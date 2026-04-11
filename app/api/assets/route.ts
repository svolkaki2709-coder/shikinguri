import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit = Number(searchParams.get("limit") ?? "13")

  const rows = await sql`
    SELECT month, savings_balance, investment_balance,
           (savings_balance + investment_balance) AS total_balance
    FROM assets
    ORDER BY month DESC
    LIMIT ${limit}
  `
  const goals = await sql`SELECT * FROM goals ORDER BY created_at DESC`

  return NextResponse.json({
    assets: rows.map(r => ({
      month: r.month,
      savings: Number(r.savings_balance),
      investment: Number(r.investment_balance),
      total: Number(r.total_balance),
    })).reverse(),
    goals,
  })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { month, savings_balance, investment_balance } = await req.json()
  if (!month) return NextResponse.json({ error: "month は必須です" }, { status: 400 })

  await sql`
    INSERT INTO assets (month, savings_balance, investment_balance, updated_at)
    VALUES (${month}, ${Number(savings_balance ?? 0)}, ${Number(investment_balance ?? 0)}, NOW())
    ON CONFLICT (month) DO UPDATE
      SET savings_balance = EXCLUDED.savings_balance,
          investment_balance = EXCLUDED.investment_balance,
          updated_at = NOW()
  `
  return NextResponse.json({ success: true })
}
