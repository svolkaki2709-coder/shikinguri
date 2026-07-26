import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized, forbidden } from "@/lib/session"

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
        AND NOT EXISTS (
          SELECT 1 FROM recurring_skips s WHERE s.recurring_id = r.id AND s.month = ${month}
        )
        AND (
          CASE WHEN COALESCE(r.entry_type, 'expense') = 'income' THEN
            NOT EXISTS (
              SELECT 1 FROM incomes i
              WHERE i.category = r.category
                AND i.amount = r.amount
                AND TO_CHAR(i.date, 'YYYY-MM') = ${month}
                AND COALESCE(i.owner_user_id, 0) = COALESCE(r.owner_user_id, 0)
            )
          ELSE
            NOT EXISTS (
              SELECT 1 FROM transactions t
              WHERE t.card_id = r.card_id
                AND t.category = r.category
                AND t.amount = r.amount
                AND t.source = 'recurring'
                AND TO_CHAR(t.date, 'YYYY-MM') = ${month}
                AND COALESCE(t.owner_user_id, 0) = COALESCE(r.owner_user_id, 0)
            )
          END
        )
      ORDER BY r.day_of_month, r.id
    `
    return NextResponse.json({ recurring: rows })
  }

  const rows = await sql`
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

  const { day_of_month, card_id, category, amount, memo, entry_type } = await req.json()
  if (!card_id || !category || !amount) {
    return NextResponse.json({ error: "card_id, category, amount は必須です" }, { status: 400 })
  }

  const [account] = await sql<{ owner_user_id: number | null }>`
    SELECT owner_user_id FROM cards
    WHERE id = ${Number(card_id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    LIMIT 1
  `
  if (!account) return forbidden()

  const result = await sql`
    INSERT INTO recurring_expenses
      (day_of_month, card_id, category, amount, memo, entry_type, owner_user_id)
    VALUES (${Number(day_of_month ?? 1)}, ${Number(card_id)}, ${category}, ${Number(amount)},
            ${memo ?? ""}, ${entry_type ?? "expense"}, ${account.owner_user_id})
    RETURNING *
  `
  return NextResponse.json({ recurring: result[0] })
}

// 定期項目の編集（金額・日・カテゴリ・メモ）
export async function PATCH(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { id, day_of_month, category, amount, memo, active } = await req.json()
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

  const updated = await sql`
    UPDATE recurring_expenses SET
      day_of_month = COALESCE(${day_of_month != null ? Number(day_of_month) : null}, day_of_month),
      category     = COALESCE(${category ?? null}, category),
      amount       = COALESCE(${amount != null ? Number(amount) : null}, amount),
      memo         = COALESCE(${memo ?? null}, memo),
      active       = COALESCE(${typeof active === "boolean" ? active : null}, active)
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

  let count = 0
  let skipped = 0
  for (const r of recurring) {
    const day = String(r.day_of_month).padStart(2, "0")
    const date = `${month}-${day}`
    const entryType = r.entry_type ?? "expense"

    // 二重生成を防ぐ（同月に同一内容が既にあればスキップ）
    if (entryType === "income") {
      const dup = await sql`
        SELECT 1 FROM incomes
        WHERE category = ${r.category} AND amount = ${r.amount}
          AND TO_CHAR(date, 'YYYY-MM') = ${month}
          AND COALESCE(owner_user_id, 0) = COALESCE(${r.owner_user_id}, 0)
        LIMIT 1
      `
      if (dup.length > 0) { skipped++; continue }
      await sql`
        INSERT INTO incomes (date, amount, category, memo, card_type, account_id, owner_user_id)
        VALUES (${date}, ${r.amount}, ${r.category}, ${r.memo}, ${r.card_type ?? "self"},
                ${r.card_id ?? null}, ${r.owner_user_id})
      `
    } else {
      const dup = await sql`
        SELECT 1 FROM transactions
        WHERE card_id = ${r.card_id} AND category = ${r.category} AND amount = ${r.amount}
          AND source = 'recurring' AND TO_CHAR(date, 'YYYY-MM') = ${month}
          AND COALESCE(owner_user_id, 0) = COALESCE(${r.owner_user_id}, 0)
        LIMIT 1
      `
      if (dup.length > 0) { skipped++; continue }
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
