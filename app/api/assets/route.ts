import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized } from "@/lib/session"

export async function GET(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const limit = Number(searchParams.get("limit") ?? "13")
  // 資産は個人と共同で別系列。既定は個人。
  const isJoint = searchParams.get("card_type") === "joint"

  const rows = isJoint
    ? await sql`
        SELECT month, savings_balance, investment_balance,
               (savings_balance + investment_balance) AS total_balance
        FROM assets WHERE owner_user_id IS NULL
        ORDER BY month DESC LIMIT ${limit}
      `
    : await sql`
        SELECT month, savings_balance, investment_balance,
               (savings_balance + investment_balance) AS total_balance
        FROM assets WHERE owner_user_id = ${me.id}
        ORDER BY month DESC LIMIT ${limit}
      `

  return NextResponse.json({
    assets: rows.map(r => ({
      month: r.month,
      savings: Number(r.savings_balance),
      investment: Number(r.investment_balance),
      total: Number(r.total_balance),
    })).reverse(),
  })
}

export async function PUT(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { month, savings_balance, investment_balance, card_type } = await req.json()
  if (!month) return NextResponse.json({ error: "month は必須です" }, { status: 400 })

  const owner = card_type === "joint" ? null : me.id
  // 値が渡されなかった項目は既存値を維持する（未入力欄で0に上書きしてしまう事故を防ぐ）
  const savings = savings_balance == null ? null : Number(savings_balance)
  const investment = investment_balance == null ? null : Number(investment_balance)

  const existing = owner === null
    ? await sql<{ id: number }>`SELECT id FROM assets WHERE month = ${month} AND owner_user_id IS NULL LIMIT 1`
    : await sql<{ id: number }>`SELECT id FROM assets WHERE month = ${month} AND owner_user_id = ${owner} LIMIT 1`

  if (existing.length > 0) {
    await sql`
      UPDATE assets
      SET savings_balance    = COALESCE(${savings}, savings_balance),
          investment_balance = COALESCE(${investment}, investment_balance),
          updated_at = NOW()
      WHERE id = ${existing[0].id}
    `
  } else {
    await sql`
      INSERT INTO assets (month, savings_balance, investment_balance, owner_user_id, updated_at)
      VALUES (${month}, ${savings ?? 0}, ${investment ?? 0}, ${owner}, NOW())
    `
  }
  return NextResponse.json({ success: true })
}
