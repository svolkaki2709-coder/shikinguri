import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized } from "@/lib/session"

export async function GET(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const now = new Date()
  const month =
    searchParams.get("month") ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const isJoint = searchParams.get("card_type") === "joint"

  const plans = isJoint
    ? await sql`SELECT * FROM monthly_plans WHERE month = ${month} AND owner_user_id IS NULL`
    : await sql`SELECT * FROM monthly_plans WHERE month = ${month} AND owner_user_id = ${me.id}`
  const plan = plans[0] ?? { savings_target: 0, nisa_target: 0 }

  // 前月との資産差分で貯金・NISA実績を計算
  const assets = isJoint
    ? await sql`
        SELECT month, savings_balance, investment_balance FROM assets
        WHERE month <= ${month} AND owner_user_id IS NULL
        ORDER BY month DESC LIMIT 2
      `
    : await sql`
        SELECT month, savings_balance, investment_balance FROM assets
        WHERE month <= ${month} AND owner_user_id = ${me.id}
        ORDER BY month DESC LIMIT 2
      `

  let savingsActual = 0
  let nisaActual = 0
  if (assets.length >= 2 && assets[0].month === month) {
    savingsActual = Math.max(0, Number(assets[0].savings_balance) - Number(assets[1].savings_balance))
    nisaActual = Math.max(0, Number(assets[0].investment_balance) - Number(assets[1].investment_balance))
  }

  return NextResponse.json({
    plan: {
      savingsTarget: Number(plan.savings_target ?? 0),
      nisaTarget: Number(plan.nisa_target ?? 0),
    },
    actual: { savingsActual, nisaActual },
    month,
  })
}

export async function PUT(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { month, savings_target, nisa_target, card_type } = await req.json()
  if (!month) return NextResponse.json({ error: "month は必須です" }, { status: 400 })

  const owner = card_type === "joint" ? null : me.id

  const existing = owner === null
    ? await sql<{ id: number }>`SELECT id FROM monthly_plans WHERE month = ${month} AND owner_user_id IS NULL LIMIT 1`
    : await sql<{ id: number }>`SELECT id FROM monthly_plans WHERE month = ${month} AND owner_user_id = ${owner} LIMIT 1`

  if (existing.length > 0) {
    await sql`
      UPDATE monthly_plans
      SET savings_target = ${Number(savings_target ?? 0)},
          nisa_target = ${Number(nisa_target ?? 0)},
          updated_at = NOW()
      WHERE id = ${existing[0].id}
    `
  } else {
    await sql`
      INSERT INTO monthly_plans (month, savings_target, nisa_target, owner_user_id, updated_at)
      VALUES (${month}, ${Number(savings_target ?? 0)}, ${Number(nisa_target ?? 0)}, ${owner}, NOW())
    `
  }
  return NextResponse.json({ success: true })
}
