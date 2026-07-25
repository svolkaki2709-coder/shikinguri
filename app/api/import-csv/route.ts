import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized, forbidden } from "@/lib/session"
import {
  decodeCsvBuffer, parseCSV, normalizeDate,
  parseAmountSigned, parseAmountAbs, detectColumns, findHeaderRowIndex,
} from "@/lib/csv"

export async function GET(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const logs = await sql`
    SELECT id, card_id, card_name, kind, start_date, end_date, row_count, income_count, file_name,
           imported_at AT TIME ZONE 'Asia/Tokyo' AS imported_at
    FROM csv_import_logs
    WHERE (owner_user_id IS NULL OR owner_user_id = ${me.id})
    ORDER BY imported_at DESC
    LIMIT 50
  `
  return NextResponse.json({ logs })
}

/** 自口座あて（クレカ引き落とし・口座間移動）の出金を「振替」として扱うか判定する */
function looksLikeTransfer(memo: string, accountNames: string[]): boolean {
  const m = memo.replace(/\s/g, "")
  if (!m) return false
  return accountNames.some(n => {
    const key = n.replace(/\s/g, "").replace(/[（(].*?[)）]/g, "")
    return key.length >= 2 && m.includes(key)
  })
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireUser()
    if (!me) return unauthorized()

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const cardId = formData.get("card_id") as string | null
    const force = formData.get("force") === "true"

    if (!file || !cardId) {
      return NextResponse.json({ error: "file と card_id は必須です" }, { status: 400 })
    }

    // 取込先口座の権限とスコープを確認
    const [account] = await sql<{
      id: number; name: string; kind: string; card_type: string; owner_user_id: number | null
    }>`
      SELECT id, name, kind, card_type, owner_user_id FROM cards
      WHERE id = ${Number(cardId)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
      LIMIT 1
    `
    if (!account) return forbidden()
    const owner = account.owner_user_id
    const isBank = account.kind === "bank"

    const text = decodeCsvBuffer(Buffer.from(await file.arrayBuffer()))
    const rows = parseCSV(text)
    if (rows.length < 2) {
      return NextResponse.json({ error: "データが空です" }, { status: 400 })
    }

    const headerRowIdx = findHeaderRowIndex(rows)
    const cols = detectColumns(rows[headerRowIdx])
    const dataRows = rows.slice(headerRowIdx + 1)

    // メタ行から請求合計を探す（カード明細向け。「次回ご請求額,193183」形式）
    const billingKeys = ["請求額", "合計金額", "ご請求金額", "支払総額", "お支払い金額合計", "請求金額合計"]
    let csvBillingTotal: number | null = null
    for (let i = 0; i < headerRowIdx; i++) {
      const label = (rows[i][0] ?? "").trim()
      if (billingKeys.some(k => label.includes(k))) {
        const val = parseAmountAbs(rows[i][1] ?? "")
        if (val > 0) { csvBillingTotal = val; break }
      }
    }

    const dates: string[] = []
    for (const row of dataRows) {
      const d = normalizeDate(row[cols.dateIdx] ?? "")
      if (d) dates.push(d)
    }
    if (dates.length === 0) {
      return NextResponse.json({ error: "有効な日付データが見つかりません" }, { status: 400 })
    }

    // ラベルなし末尾合計行（例: ,,,,,35970, ）をカード明細の請求合計とみなす
    if (csvBillingTotal === null && !isBank) {
      let lastDataIdx = -1
      for (let i = 0; i < dataRows.length; i++) {
        if (normalizeDate(dataRows[i][cols.dateIdx] ?? "")) lastDataIdx = i
      }
      for (let i = lastDataIdx + 1; i < dataRows.length; i++) {
        const nums = dataRows[i].map(c => parseAmountAbs(c)).filter(n => n > 0)
        if (nums.length === 1) { csvBillingTotal = nums[0]; break }
      }
    }

    dates.sort()
    const startDate = dates[0]
    const endDate = dates[dates.length - 1]

    // 期間が重なる取込がすでにあれば確認する
    if (!force) {
      const overlap = await sql`
        SELECT id, card_name, start_date, end_date, row_count,
               imported_at AT TIME ZONE 'Asia/Tokyo' AS imported_at
        FROM csv_import_logs
        WHERE card_id = ${Number(cardId)}
          AND start_date <= ${endDate} AND end_date >= ${startDate}
        ORDER BY imported_at DESC LIMIT 1
      `
      if (overlap.length > 0) {
        const prev = overlap[0]
        return NextResponse.json({
          warning: true,
          message: `${prev.card_name ?? "同じ口座"} の ${prev.start_date} ～ ${prev.end_date} のデータが既に取り込まれています（${prev.row_count}件、${String(prev.imported_at).slice(0, 16)}）。続けると重複して登録されます。`,
          existingImport: prev,
          newRange: { startDate, endDate },
        })
      }
    }

    // 自動振り分けルール（自分に見えるもののみ）
    const storeRules = (await sql<{ keyword: string; category: string }>`
      SELECT keyword, category FROM store_category_rules
      WHERE (owner_user_id IS NULL OR owner_user_id = ${me.id})
      ORDER BY LENGTH(keyword) DESC
    `).map(r => ({ keyword: r.keyword, category: r.category }))

    // 振替判定に使う他口座の名前
    const otherAccounts = (await sql<{ name: string; institution: string | null }>`
      SELECT name, institution FROM cards
      WHERE id <> ${Number(cardId)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    `).flatMap(r => [r.name, r.institution].filter(Boolean) as string[])

    function categorize(memo: string): string {
      const m = memo.trim()
      if (!m) return "未分類"
      const exact = storeRules.find(r => r.keyword === m)
      if (exact) return exact.category
      // メモがキーワードを含む場合のみ（短いメモが長いキーワードに巻き込まれないよう逆包含はしない）
      const partial = storeRules.find(r => m.includes(r.keyword))
      return partial ? partial.category : "未分類"
    }

    // 取込ログを先に作り、各行へIDを紐付ける（取り消しを正確にするため）
    const [log] = await sql<{ id: number }>`
      INSERT INTO csv_import_logs
        (card_id, card_name, kind, start_date, end_date, row_count, income_count, file_name, owner_user_id)
      VALUES (${Number(cardId)}, ${account.name}, ${isBank ? "bank" : "card"},
              ${startDate}, ${endDate}, 0, 0, ${file.name}, ${owner})
      RETURNING id
    `

    let expenseCount = 0
    let incomeCount = 0
    let expenseTotal = 0
    let incomeTotal = 0
    let transferCount = 0
    let skipped = 0
    const balances: Array<{ date: string; balance: number }> = []
    let needsTransferCategory = false

    for (const row of dataRows) {
      const date = normalizeDate(row[cols.dateIdx] ?? "")
      if (!date) { skipped++; continue }

      const memo = (row[cols.memoIdx] ?? "").trim()

      // 残高列があれば控えておく（口座残高の推移として保存）
      if (cols.balanceIdx >= 0) {
        const bal = parseAmountSigned(row[cols.balanceIdx] ?? "")
        if (bal != null) balances.push({ date, balance: bal })
      }

      // 出金・入金の判定
      let withdraw: number | null = null
      let deposit: number | null = null

      if (cols.depositIdx >= 0) {
        // 出金列・入金列が分かれている（銀行明細の一般形）
        const w = cols.withdrawIdx >= 0 ? parseAmountSigned(row[cols.withdrawIdx] ?? "") : null
        const d = parseAmountSigned(row[cols.depositIdx] ?? "")
        if (w != null && w !== 0) withdraw = Math.abs(w)
        if (d != null && d !== 0) deposit = Math.abs(d)
      } else if (cols.withdrawIdx >= 0) {
        // 金額が1列。マイナスは入金（返金・入金）として扱う
        const v = parseAmountSigned(row[cols.withdrawIdx] ?? "")
        if (v != null && v !== 0) {
          if (isBank && v < 0) deposit = Math.abs(v)
          else withdraw = Math.abs(v)
        }
      }

      if (withdraw == null && deposit == null) { skipped++; continue }

      if (deposit != null) {
        await sql`
          INSERT INTO incomes (date, amount, category, memo, card_type, account_id, owner_user_id, import_log_id)
          VALUES (${date}, ${deposit}, ${categorize(memo)}, ${memo},
                  ${account.card_type}, ${Number(cardId)}, ${owner}, ${log.id})
        `
        incomeCount++
        incomeTotal += deposit
      }

      if (withdraw != null) {
        // 自分の他口座あての引き落とし（クレカ支払い等）は振替にして二重計上を防ぐ
        const isTransfer = isBank && looksLikeTransfer(memo, otherAccounts)
        const category = isTransfer ? "振替" : categorize(memo)
        if (isTransfer) { transferCount++; needsTransferCategory = true }

        await sql`
          INSERT INTO transactions (date, card_id, category, amount, memo, source, owner_user_id, import_log_id)
          VALUES (${date}, ${Number(cardId)}, ${category}, ${withdraw}, ${memo}, 'csv', ${owner}, ${log.id})
        `
        expenseCount++
        expenseTotal += withdraw
      }
    }

    // 「振替」カテゴリが無ければ作る（集計から除外される中立カテゴリ）
    if (needsTransferCategory) {
      const exists = owner === null
        ? await sql`SELECT 1 FROM categories WHERE name = '振替' AND card_type = ${account.card_type} AND owner_user_id IS NULL LIMIT 1`
        : await sql`SELECT 1 FROM categories WHERE name = '振替' AND card_type = ${account.card_type} AND owner_user_id = ${owner} LIMIT 1`
      if (exists.length === 0) {
        await sql`
          INSERT INTO categories (name, card_type, group_type, sign, sort_order, owner_user_id)
          VALUES ('振替', ${account.card_type}, '振替', 'neutral', 900, ${owner})
        `
      }
    }

    // 残高スナップショットを保存（同日が複数あれば最後の値を採用）
    for (const b of balances) {
      await sql`
        INSERT INTO account_balances (account_id, date, balance, source)
        VALUES (${Number(cardId)}, ${b.date}, ${b.balance}, 'csv')
        ON CONFLICT (account_id, date) DO UPDATE SET balance = EXCLUDED.balance
      `
    }

    await sql`
      UPDATE csv_import_logs
      SET row_count = ${expenseCount}, income_count = ${incomeCount}
      WHERE id = ${log.id}
    `

    const verified = csvBillingTotal !== null ? csvBillingTotal === expenseTotal : null

    return NextResponse.json({
      success: true,
      kind: isBank ? "bank" : "card",
      imported: expenseCount,
      incomeImported: incomeCount,
      transferCount,
      skipped,
      importedTotal: expenseTotal,
      incomeTotal,
      balanceCount: balances.length,
      csvBillingTotal,
      verified,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e)
    console.error("[import-csv]", msg)
    return NextResponse.json(
      { error: `サーバーエラー: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    )
  }
}

// 取込の取り消し
export async function DELETE(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const logId = searchParams.get("log_id")
  if (!logId) return NextResponse.json({ error: "log_id は必須です" }, { status: 400 })

  const [log] = await sql<{
    id: number; card_id: number; start_date: string; end_date: string
  }>`
    SELECT id, card_id, start_date::text, end_date::text FROM csv_import_logs
    WHERE id = ${Number(logId)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    LIMIT 1
  `
  if (!log) return NextResponse.json({ error: "ログが見つかりません" }, { status: 404 })

  // ログIDが紐付いている行だけを正確に削除する
  const delTx = await sql`DELETE FROM transactions WHERE import_log_id = ${log.id} RETURNING id`
  const delIn = await sql`DELETE FROM incomes WHERE import_log_id = ${log.id} RETURNING id`
  let deleted = delTx.length + delIn.length

  // ログID導入前の古い取込はIDを持たないので、従来どおり期間で削除する
  if (deleted === 0) {
    const legacy = await sql`
      DELETE FROM transactions
      WHERE card_id = ${log.card_id} AND source = 'csv' AND import_log_id IS NULL
        AND date >= ${log.start_date} AND date <= ${log.end_date}
        AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
      RETURNING id
    `
    deleted = legacy.length
  }

  await sql`DELETE FROM account_balances WHERE account_id = ${log.card_id} AND source = 'csv'
            AND date >= ${log.start_date} AND date <= ${log.end_date}`
  await sql`DELETE FROM csv_import_logs WHERE id = ${log.id}`

  return NextResponse.json({ success: true, deleted })
}
