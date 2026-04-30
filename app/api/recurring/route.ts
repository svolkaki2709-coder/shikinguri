import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

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

  const { day_of_month, card_id, category, amount, memo } = await req.json()
  if (!card_id || !category || !amount) {
    return NextResponse.json({ error: "card_id, category, amount は必須です" }, { status: 400 })
  }

  const result = await sql`
    INSERT INTO recurring_expenses (day_of_month, card_id, category, amount, memo)
    VALUES (${Number(day_of_month ?? 1)}, ${Number(card_id)}, ${category}, ${Number(amount)}, ${memo ?? ""})
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

// 定期支出を当月に生成（id指定で個別、省略で一括）
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { month, id } = await req.json()
  if (!month) return NextResponse.json({ error: "month は必須です" }, { status: 400 })

  const recurring = id
    ? await sql`SELECT * FROM recurring_expenses WHERE active = TRUE AND id = ${Number(id)}`
    : await sql`SELECT * FROM recurring_expenses WHERE active = TRUE`

  let count = 0
  for (const r of recurring) {
    const day = String(r.day_of_month).padStart(2, "0")
    const date = `${month}-${day}`
    await sql`
      INSERT INTO transactions (date, card_id, category, amount, memo, source)
      VALUES (${date}, ${r.card_id}, ${r.category}, ${r.amount}, ${r.memo}, 'recurring')
    `
    count++
  }
  return NextResponse.json({ success: true, count })
}
