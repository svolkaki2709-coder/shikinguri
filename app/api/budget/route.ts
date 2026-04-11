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
    sql`SELECT category, amount, type FROM budgets ORDER BY type, category`,
    sql`
      SELECT category, type, SUM(amount) AS actual
      FROM transactions
      WHERE TO_CHAR(date, 'YYYY-MM') = ${month}
      GROUP BY category, type
    `,
  ])

  const actualMap: Record<string, number> = {}
  for (const r of actuals) {
    actualMap[`${r.category}__${r.type}`] = Number(r.actual)
  }

  const rows = budgets.map((b) => ({
    category: b.category,
    type: b.type,
    budget: Number(b.amount),
    actual: actualMap[`${b.category}__${b.type}`] ?? 0,
  }))

  return NextResponse.json({ budgets: rows, month })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { category, amount, type } = await req.json()
  await sql`
    INSERT INTO budgets (category, amount, type)
    VALUES (${category}, ${Number(amount)}, ${type})
    ON CONFLICT (category, type) DO UPDATE SET amount = EXCLUDED.amount
  `
  return NextResponse.json({ success: true })
}
