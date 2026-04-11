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

  const plans = await sql`SELECT * FROM monthly_plans WHERE month = ${month}`
  const plan = plans[0] ?? { savings_target: 0, nisa_target: 0 }

  // 前月との資産差分で貯金・NISA実績を計算
  const assets = await sql`
    SELECT month, savings_balance, investment_balance
    FROM assets
    WHERE month <= ${month}
    ORDER BY month DESC
    LIMIT 2
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
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { month, savings_target, nisa_target } = await req.json()
  if (!month) return NextResponse.json({ error: "month は必須です" }, { status: 400 })

  await sql`
    INSERT INTO monthly_plans (month, savings_target, nisa_target, updated_at)
    VALUES (${month}, ${Number(savings_target ?? 0)}, ${Number(nisa_target ?? 0)}, NOW())
    ON CONFLICT (month) DO UPDATE
      SET savings_target = EXCLUDED.savings_target,
          nisa_target = EXCLUDED.nisa_target,
          updated_at = NOW()
  `
  return NextResponse.json({ success: true })
}
