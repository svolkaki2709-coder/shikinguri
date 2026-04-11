import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const now = new Date()
  const month =
    searchParams.get("month") ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const [budgets, actuals] = await Promise.all([
    sql`SELECT category, amount, card_type FROM budgets ORDER BY card_type, category`,
    sql`
      SELECT t.category, c.card_type, SUM(t.amount) AS actual
      FROM transactions t
      LEFT JOIN cards c ON t.card_id = c.id
      WHERE TO_CHAR(t.date, 'YYYY-MM') = ${month}
      GROUP BY t.category, c.card_type
    `,
  ])

  const actualMap: Record<string, number> = {}
  for (const r of actuals) {
    actualMap[`${r.category}__${r.card_type}`] = Number(r.actual)
  }

  const rows = budgets.map((b) => ({
    category: b.category,
    cardType: b.card_type,
    budget: Number(b.amount),
    actual: actualMap[`${b.category}__${b.card_type}`] ?? 0,
  }))

  return NextResponse.json({ budgets: rows, month })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { category, amount, card_type } = await req.json()
  await sql`
    INSERT INTO budgets (category, amount, card_type)
    VALUES (${category}, ${Number(amount)}, ${card_type ?? "self"})
    ON CONFLICT (category, card_type) DO UPDATE SET amount = EXCLUDED.amount
  `
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const category = searchParams.get("category")
  const cardType = searchParams.get("card_type")
  if (!category || !cardType) return NextResponse.json({ error: "category, card_type は必須です" }, { status: 400 })

  await sql`DELETE FROM budgets WHERE category = ${category} AND card_type = ${cardType}`
  return NextResponse.json({ success: true })
}
