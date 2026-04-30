import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

async function migrateRecurring() {
  // entry_type: 'expense' | 'income'
  await sql`ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS entry_type TEXT DEFAULT 'expense'`
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await migrateRecurring()

  const { searchParams } = new URL(req.url)
  const pending = searchParams.get("pending")
  const month = searchParams.get("month")

  // ?pending=true&month=YYYY-MM → 当月未生成で引き落とし日を過ぎた支出のみ返す
  if (pending === "true" && month) {
    const today = new Date()
    const todayDay = today.getDate()
    const rows = await sql`
      SELECT r.*, c.name AS card_name, c.card_type, c.color
      FROM recurring_expenses r
      LEFT JOIN cards c ON r.card_id = c.id
      WHERE r.active = TRUE
        AND COALESCE(r.entry_type, 'expense') = 'expense'
        AND r.day_of_month <= ${todayDay}
        AND NOT EXISTS (
          SELECT 1 FROM transactions t
          WHERE t.card_id = r.card_id
            AND t.category = r.category
            AND t.amount = r.amount
            AND t.source = 'recurring'
            AND TO_CHAR(t.date, 'YYYY-MM') = ${month}
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
    ORDER BY r.day_of_month, r.id
  `
  return NextResponse.json({ recurring: rows })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await migrateRecurring()

  const { day_of_month, card_id, category, amount, memo, entry_type } = await req.json()
  if (!card_id || !category || !amount) {
    return NextResponse.json({ error: "card_id, category, amount は必須です" }, { status: 400 })
  }

  const result = await sql`
    INSERT INTO recurring_expenses (day_of_month, card_id, category, amount, memo, entry_type)
    VALUES (${Number(day_of_month ?? 1)}, ${Number(card_id)}, ${category}, ${Number(amount)}, ${memo ?? ""}, ${entry_type ?? "expense"})
    RETURNING *
  `
  return NextResponse.json({ recurring: result[0] })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 })

  await sql`UPDATE recurring_expenses SET active = FALSE WHERE id = ${Number(id)}`
  return NextResponse.json({ success: true })
}

// 定期支出/入金を当月に生成（id指定で個別、省略で一括）
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { month, id } = await req.json()
  if (!month) return NextResponse.json({ error: "month は必須です" }, { status: 400 })

  const recurring = id
    ? await sql`SELECT r.*, c.card_type FROM recurring_expenses r LEFT JOIN cards c ON r.card_id = c.id WHERE r.active = TRUE AND r.id = ${Number(id)}`
    : await sql`SELECT r.*, c.card_type FROM recurring_expenses r LEFT JOIN cards c ON r.card_id = c.id WHERE r.active = TRUE`

  let count = 0
  for (const r of recurring) {
    const day = String(r.day_of_month).padStart(2, "0")
    const date = `${month}-${day}`
    const entryType = r.entry_type ?? "expense"

    if (entryType === "income") {
      // 収入テーブルへ挿入
      await sql`
        INSERT INTO incomes (date, amount, category, memo, card_type)
        VALUES (${date}, ${r.amount}, ${r.category}, ${r.memo}, ${r.card_type ?? "self"})
      `
    } else {
      // 支出テーブルへ挿入
      await sql`
        INSERT INTO transactions (date, card_id, category, amount, memo, source)
        VALUES (${date}, ${r.card_id}, ${r.category}, ${r.amount}, ${r.memo}, 'recurring')
      `
    }
    count++
  }
  return NextResponse.json({ success: true, count })
}
