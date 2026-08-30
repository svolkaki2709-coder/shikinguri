import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized } from "@/lib/session"

/**
 * ライフプランの全データを一括で返す。
 * キャッシュフローの計算自体はクライアント側で行う（前提条件を触ったら即座に
 * 再計算されてほしいため）。ここでは元データと、実績からの初期値提案だけを返す。
 */
export async function GET(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const isJoint = searchParams.get("card_type") !== "self"
  const owner = isJoint ? null : me.id

  const [settingsRows, members, streams, events, tools] = await Promise.all([
    isJoint
      ? sql`SELECT * FROM life_settings WHERE owner_user_id IS NULL LIMIT 1`
      : sql`SELECT * FROM life_settings WHERE owner_user_id = ${me.id} LIMIT 1`,
    isJoint
      ? sql`SELECT * FROM life_members WHERE owner_user_id IS NULL ORDER BY sort_order, id`
      : sql`SELECT * FROM life_members WHERE owner_user_id = ${me.id} ORDER BY sort_order, id`,
    isJoint
      ? sql`SELECT * FROM life_streams WHERE owner_user_id IS NULL ORDER BY kind DESC, sort_order, id`
      : sql`SELECT * FROM life_streams WHERE owner_user_id = ${me.id} ORDER BY kind DESC, sort_order, id`,
    isJoint
      ? sql`SELECT * FROM life_events WHERE owner_user_id IS NULL ORDER BY year, id`
      : sql`SELECT * FROM life_events WHERE owner_user_id = ${me.id} ORDER BY year, id`,
    isJoint
      ? sql`SELECT * FROM life_tools WHERE owner_user_id IS NULL`
      : sql`SELECT * FROM life_tools WHERE owner_user_id = ${me.id}`,
  ])

  // ── 実績からの初期値提案 ──────────────────────────────
  // 直近12ヶ月の支出・収入と、最新の資産残高。ユーザーが「この値を使う」で取り込める。
  const since = new Date()
  since.setMonth(since.getMonth() - 12)
  const sinceStr = since.toISOString().slice(0, 10)

  const [expenseRows, incomeRows, assetRows, nisaRows] = await Promise.all([
    isJoint
      ? sql<{ total: string }>`
          SELECT COALESCE(SUM(t.amount), 0)::text AS total
          FROM transactions t
          LEFT JOIN categories c ON c.name = t.category AND c.owner_user_id IS NULL
          WHERE t.owner_user_id IS NULL AND t.date >= ${sinceStr}
            AND COALESCE(c.group_type, '支出') = '支出'
        `
      : sql<{ total: string }>`
          SELECT COALESCE(SUM(t.amount), 0)::text AS total
          FROM transactions t
          LEFT JOIN categories c ON c.name = t.category AND c.owner_user_id = ${me.id}
          WHERE t.owner_user_id = ${me.id} AND t.date >= ${sinceStr}
            AND COALESCE(c.group_type, '支出') = '支出'
        `,
    isJoint
      ? sql<{ total: string }>`
          SELECT COALESCE(SUM(amount), 0)::text AS total FROM incomes
          WHERE owner_user_id IS NULL AND date >= ${sinceStr} AND amount > 0
        `
      : sql<{ total: string }>`
          SELECT COALESCE(SUM(amount), 0)::text AS total FROM incomes
          WHERE owner_user_id = ${me.id} AND date >= ${sinceStr} AND amount > 0
        `,
    isJoint
      ? sql`SELECT savings_balance, investment_balance FROM assets WHERE owner_user_id IS NULL ORDER BY month DESC LIMIT 1`
      : sql`SELECT savings_balance, investment_balance FROM assets WHERE owner_user_id = ${me.id} ORDER BY month DESC LIMIT 1`,
    // NISA・積立系カテゴリの直近1年の実績（積立シミュレーションの初期値に使う）
    sql<{ total: string }>`
      SELECT COALESCE(SUM(amount), 0)::text AS total FROM transactions
      WHERE (owner_user_id IS NULL OR owner_user_id = ${me.id})
        AND date >= ${sinceStr}
        AND category ~* 'NISA|ニーサ|つみたて|積立投資'
    `,
  ])

  // ── 給与明細から年金の計算材料を作る ──────────────────────
  // 厚生年金保険料（個人負担）＝ 標準報酬月額 × 9.15%（18.3%の労使折半）
  // なので、控除額から標準報酬月額を逆算できる。年金額はこの標準報酬額で決まるため、
  // 額面給与を手入力するより正確な見込額が出せる。
  // 給与明細は常に個人データなので、共同スコープで見ていても本人の実績を使う。
  const payslips = await sql<{ payment_month: string; pension: number }>`
    SELECT payment_month, pension FROM payslip_details
    WHERE owner_user_id = ${me.id} AND pension IS NOT NULL AND pension > 0
    ORDER BY payment_month DESC LIMIT 12
  `
  let payslipHints: {
    standardMonthly: number; annualEquivalent: number; months: number; latestMonth: string
  } | null = null
  if (payslips.length > 0) {
    const standardMonthly = Math.round(Number(payslips[0].pension) / 0.0915 / 1000) * 1000
    payslipHints = {
      standardMonthly,
      annualEquivalent: standardMonthly * 12,
      months: payslips.length,
      latestMonth: payslips[0].payment_month,
    }
  }

  return NextResponse.json({
    settings: settingsRows[0] ?? null,
    payslipHints,
    members,
    streams,
    events,
    tools,
    actualHints: {
      nisaAnnual: Number(nisaRows[0]?.total ?? 0),
      annualExpense: Number(expenseRows[0]?.total ?? 0),
      annualIncome: Number(incomeRows[0]?.total ?? 0),
      savings: Number(assetRows[0]?.savings_balance ?? 0),
      investment: Number(assetRows[0]?.investment_balance ?? 0),
    },
    scope: owner === null ? "joint" : "self",
  })
}

/** 前提条件の保存（1スコープにつき1レコード） */
export async function PUT(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const b = await req.json()
  const owner = b.card_type === "self" ? me.id : null

  const existing = owner === null
    ? await sql<{ id: number }>`SELECT id FROM life_settings WHERE owner_user_id IS NULL LIMIT 1`
    : await sql<{ id: number }>`SELECT id FROM life_settings WHERE owner_user_id = ${owner} LIMIT 1`

  const vals = {
    start_year: Number(b.start_year ?? new Date().getFullYear()),
    years: Math.min(80, Math.max(1, Number(b.years ?? 40))),
    inflation_rate: Number(b.inflation_rate ?? 1),
    return_rate: Number(b.return_rate ?? 3),
    initial_savings: Math.round(Number(b.initial_savings ?? 0)),
    initial_investment: Math.round(Number(b.initial_investment ?? 0)),
  }

  if (existing.length > 0) {
    await sql`
      UPDATE life_settings SET
        start_year = ${vals.start_year},
        years = ${vals.years},
        inflation_rate = ${vals.inflation_rate},
        return_rate = ${vals.return_rate},
        initial_savings = ${vals.initial_savings},
        initial_investment = ${vals.initial_investment},
        updated_at = NOW()
      WHERE id = ${existing[0].id}
    `
  } else {
    await sql`
      INSERT INTO life_settings
        (start_year, years, inflation_rate, return_rate, initial_savings, initial_investment, owner_user_id)
      VALUES (${vals.start_year}, ${vals.years}, ${vals.inflation_rate}, ${vals.return_rate},
              ${vals.initial_savings}, ${vals.initial_investment}, ${owner})
    `
  }
  return NextResponse.json({ success: true })
}
