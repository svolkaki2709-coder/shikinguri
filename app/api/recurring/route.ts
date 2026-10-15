import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized, forbidden } from "@/lib/session"

type RecurringRow = {
  id: number; card_id: number | null; category: string; amount: number
  entry_type: string | null; owner_user_id: number | null
}

/**
 * その月に登録済みの定期項目IDを返す。
 *
 * 以前は「カード・カテゴリ・金額が一致する明細があるか」で判定していたため、
 * 確定時に金額を変えると未登録のまま残り続けた。
 * 同じ口座・カテゴリの定期が複数あることもある（例：返済 27,325円と50,000円）ので、
 *   1. 金額まで一致する明細を先に対応づけ
 *   2. 残った明細を、口座・カテゴリが同じ定期に1件ずつ対応づける（金額を変えて確定した分）
 * の2段階で照合する。1件の明細が2つの定期を消すことはない。
 */
async function registeredIds(rows: RecurringRow[], month: string, meId: number): Promise<Set<number>> {
  const done = new Set<number>()
  if (rows.length === 0) return done
  const [txs, ins] = await Promise.all([
    sql<{ card_id: number | null; category: string; amount: number; owner_user_id: number | null }>`
      SELECT card_id, category, amount, owner_user_id FROM transactions
      WHERE source = 'recurring' AND TO_CHAR(date, 'YYYY-MM') = ${month}
        AND (owner_user_id IS NULL OR owner_user_id = ${meId})
    `,
    sql<{ category: string; amount: number; owner_user_id: number | null }>`
      SELECT category, amount, owner_user_id FROM incomes
      WHERE TO_CHAR(date, 'YYYY-MM') = ${month}
        AND (owner_user_id IS NULL OR owner_user_id = ${meId})
    `,
  ])
  const keyOf = (isIncome: boolean, cardId: number | null, category: string, owner: number | null) =>
    isIncome ? `i|${category}|${owner ?? 0}` : `e|${cardId ?? 0}|${category}|${owner ?? 0}`
  // キーごとに、まだ対応づけていない明細の金額を持つ
  const pool = new Map<string, number[]>()
  const push = (k: string, amount: number) => pool.set(k, [...(pool.get(k) ?? []), Number(amount)])
  for (const t of txs) push(keyOf(false, t.card_id, t.category, t.owner_user_id), t.amount)
  for (const i of ins) push(keyOf(true, null, i.category, i.owner_user_id), i.amount)

  const keyOfRow = (r: RecurringRow) =>
    keyOf((r.entry_type ?? "expense") === "income", r.card_id, r.category, r.owner_user_id)
  // 1. 金額一致
  for (const r of rows) {
    const list = pool.get(keyOfRow(r))
    const idx = list?.indexOf(Number(r.amount)) ?? -1
    if (list && idx >= 0) { list.splice(idx, 1); done.add(r.id) }
  }
  // 2. 金額違い（確定時に金額を変えたもの）
  for (const r of rows) {
    if (done.has(r.id)) continue
    const list = pool.get(keyOfRow(r))
    if (list && list.length > 0) { list.shift(); done.add(r.id) }
  }
  return done
}

export async function GET(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const pending = searchParams.get("pending")
  const month = searchParams.get("month")

  // ?pending=true&month=YYYY-MM → 指定月に未生成・未スキップの項目を返す（支出・入金の両方）
  // 過去月を指定した場合は全日が経過済み扱い、未来月は表示しない（当月のみ「今日まで」で絞る）
  if (pending === "true" && month) {
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    const todayDay = now.getDate()
    const rows = await sql`
      SELECT r.*, c.name AS card_name, c.card_type, c.color
      FROM recurring_expenses r
      LEFT JOIN cards c ON r.card_id = c.id
      WHERE r.active = TRUE
        AND (r.owner_user_id IS NULL OR r.owner_user_id = ${me.id})
        AND (
          CASE
            WHEN ${month} < ${currentMonth} THEN TRUE
            WHEN ${month} = ${currentMonth} THEN r.day_of_month <= ${todayDay}
            ELSE FALSE
          END
        )
        AND (r.start_month IS NULL OR r.start_month <= ${month})
        AND (r.end_month IS NULL OR r.end_month >= ${month})
        AND NOT EXISTS (
          SELECT 1 FROM recurring_skips s WHERE s.recurring_id = r.id AND s.month = ${month}
        )
      ORDER BY r.day_of_month, r.id
    `
    // 照合は「その月の全定期」で行う（日付で絞った後だと、まだ日が来ていない定期の明細を取り違える）
    const all = await sql<RecurringRow>`
      SELECT id, card_id, category, amount, entry_type, owner_user_id FROM recurring_expenses
      WHERE active = TRUE AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
      ORDER BY day_of_month, id
    `
    const done = await registeredIds(all, month, me.id)
    return NextResponse.json({ recurring: rows.filter(r => !done.has(Number(r.id))) })
  }

  // card_type=self / joint を付けるとそのスコープだけを返す
  const cardType = searchParams.get("card_type")
  const rows = cardType === "self"
    ? await sql`
        SELECT r.*, c.name AS card_name, c.card_type, c.color
        FROM recurring_expenses r
        LEFT JOIN cards c ON r.card_id = c.id
        WHERE r.active = TRUE AND r.owner_user_id = ${me.id}
        ORDER BY r.day_of_month, r.id
      `
    : cardType === "joint"
    ? await sql`
        SELECT r.*, c.name AS card_name, c.card_type, c.color
        FROM recurring_expenses r
        LEFT JOIN cards c ON r.card_id = c.id
        WHERE r.active = TRUE AND r.owner_user_id IS NULL
        ORDER BY r.day_of_month, r.id
      `
    : await sql`
        SELECT r.*, c.name AS card_name, c.card_type, c.color
        FROM recurring_expenses r
        LEFT JOIN cards c ON r.card_id = c.id
        WHERE r.active = TRUE
          AND (r.owner_user_id IS NULL OR r.owner_user_id = ${me.id})
        ORDER BY r.day_of_month, r.id
      `
  return NextResponse.json({ recurring: rows })
}

export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { day_of_month, card_id, category, amount, memo, entry_type, start_month, end_month } = await req.json()
  if (!card_id || !category || !amount) {
    return NextResponse.json({ error: "card_id, category, amount は必須です" }, { status: 400 })
  }

  const [account] = await sql<{ owner_user_id: number | null }>`
    SELECT owner_user_id FROM cards
    WHERE id = ${Number(card_id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    LIMIT 1
  `
  if (!account) return forbidden()

  const mm = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}$/.test(v) ? v : null)

  const result = await sql`
    INSERT INTO recurring_expenses
      (day_of_month, card_id, category, amount, memo, entry_type, start_month, end_month, owner_user_id)
    VALUES (${Number(day_of_month ?? 1)}, ${Number(card_id)}, ${category}, ${Number(amount)},
            ${memo ?? ""}, ${entry_type ?? "expense"}, ${mm(start_month)}, ${mm(end_month)},
            ${account.owner_user_id})
    RETURNING *
  `
  return NextResponse.json({ recurring: result[0] })
}

// 定期項目の編集（金額・日・カテゴリ・メモ）
export async function PATCH(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { id, day_of_month, category, amount, memo, active, start_month, end_month } = await req.json()
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

  const keepPeriod = start_month === undefined && end_month === undefined
  const updated = keepPeriod
    ? await sql`
        UPDATE recurring_expenses SET
          day_of_month = COALESCE(${day_of_month != null ? Number(day_of_month) : null}, day_of_month),
          category     = COALESCE(${category ?? null}, category),
          amount       = COALESCE(${amount != null ? Number(amount) : null}, amount),
          memo         = COALESCE(${memo ?? null}, memo),
          active       = COALESCE(${typeof active === "boolean" ? active : null}, active)
        WHERE id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
        RETURNING *
      `
    : await sql`
    UPDATE recurring_expenses SET
      day_of_month = COALESCE(${day_of_month != null ? Number(day_of_month) : null}, day_of_month),
      category     = COALESCE(${category ?? null}, category),
      amount       = COALESCE(${amount != null ? Number(amount) : null}, amount),
      memo         = COALESCE(${memo ?? null}, memo),
      active       = COALESCE(${typeof active === "boolean" ? active : null}, active),
      -- 期間は「空文字なら制限なしに戻す」を表現したいので COALESCE ではなく明示的に分岐する
      start_month  = ${start_month === undefined ? null : (start_month || null)},
      end_month    = ${end_month === undefined ? null : (end_month || null)}
    WHERE id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    RETURNING *
  `
  if (updated.length === 0) return forbidden()
  return NextResponse.json({ recurring: updated[0] })
}

export async function DELETE(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 })

  const updated = await sql`
    UPDATE recurring_expenses SET active = FALSE
    WHERE id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    RETURNING id
  `
  if (updated.length === 0) return forbidden()
  return NextResponse.json({ success: true })
}

// 定期支出/入金を当月に生成（id指定で個別、省略で一括）
export async function PUT(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { month, id } = await req.json()
  if (!month) return NextResponse.json({ error: "month は必須です" }, { status: 400 })

  const recurring = id
    ? await sql`
        SELECT r.*, c.card_type FROM recurring_expenses r
        LEFT JOIN cards c ON r.card_id = c.id
        WHERE r.active = TRUE AND r.id = ${Number(id)}
          AND (r.owner_user_id IS NULL OR r.owner_user_id = ${me.id})
      `
    : await sql`
        SELECT r.*, c.card_type FROM recurring_expenses r
        LEFT JOIN cards c ON r.card_id = c.id
        WHERE r.active = TRUE
          AND (r.owner_user_id IS NULL OR r.owner_user_id = ${me.id})
      `

  const done = await registeredIds(recurring as unknown as RecurringRow[], month, me.id)
  let count = 0
  let skipped = 0
  for (const r of recurring) {
    // 二重生成を防ぐ（金額を変えて確定済みのものも登録済みとみなす）
    if (done.has(Number(r.id))) { skipped++; continue }
    // 期間外の月には作らない（終了した定期・まだ始まっていない予定）
    if (r.start_month && month < r.start_month) { skipped++; continue }
    if (r.end_month && month > r.end_month) { skipped++; continue }
    const day = String(r.day_of_month).padStart(2, "0")
    const date = `${month}-${day}`
    const entryType = r.entry_type ?? "expense"

    if (entryType === "income") {
      await sql`
        INSERT INTO incomes (date, amount, category, memo, card_type, account_id, owner_user_id)
        VALUES (${date}, ${r.amount}, ${r.category}, ${r.memo}, ${r.card_type ?? "self"},
                ${r.card_id ?? null}, ${r.owner_user_id})
      `
    } else {
      await sql`
        INSERT INTO transactions (date, card_id, category, amount, memo, source, owner_user_id)
        VALUES (${date}, ${r.card_id}, ${r.category}, ${r.amount}, ${r.memo}, 'recurring',
                ${r.owner_user_id})
      `
    }
    count++
  }
  return NextResponse.json({ success: true, count, skipped })
}
