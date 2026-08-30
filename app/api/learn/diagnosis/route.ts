import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized } from "@/lib/session"

/**
 * 資産形成の「やる順番」を判定するための材料を集める。
 *
 * NISA・iDeCo・保険・ふるさと納税を実際にやっているかは、
 * カテゴリ別の支出実績から判定する（自己申告より確実なため）。
 *
 * 個人で管理するもの（iDeCo・生命保険など）と共同で管理するもの（貯蓄など）が
 * 混在するため、世帯合算で判定しつつ、個人／共同の内訳も返して画面で示せるようにする。
 */
export async function GET() {
  const me = await requireUser()
  if (!me) return unauthorized()

  const since = new Date()
  since.setMonth(since.getMonth() - 12)
  const sinceStr = since.toISOString().slice(0, 10)

  const [catRows, expenseRows, assetRows, payslipRows, mortgageRows] = await Promise.all([
    // 直近1年のカテゴリ別支出（個人／共同を分けて集計）
    sql<{ category: string; scope: string; total: string }>`
      SELECT category,
             CASE WHEN owner_user_id IS NULL THEN 'joint' ELSE 'self' END AS scope,
             SUM(amount)::text AS total
      FROM transactions
      WHERE (owner_user_id IS NULL OR owner_user_id = ${me.id})
        AND date >= ${sinceStr}
      GROUP BY category, scope
    `,
    // 生活費（投資・貯蓄・振替などを除いた純粋な支出）もスコープ別に
    sql<{ scope: string; total: string }>`
      SELECT CASE WHEN t.owner_user_id IS NULL THEN 'joint' ELSE 'self' END AS scope,
             COALESCE(SUM(t.amount), 0)::text AS total
      FROM transactions t
      LEFT JOIN categories c
        ON c.name = t.category
       AND (c.owner_user_id IS NULL OR c.owner_user_id = ${me.id})
      WHERE (t.owner_user_id IS NULL OR t.owner_user_id = ${me.id})
        AND t.date >= ${sinceStr}
        AND COALESCE(c.group_type, '支出') = '支出'
      GROUP BY scope
    `,
    // 最新月の資産残高をスコープ別に
    sql<{ scope: string; savings: string; investment: string }>`
      SELECT CASE WHEN owner_user_id IS NULL THEN 'joint' ELSE 'self' END AS scope,
             COALESCE(SUM(savings_balance), 0)::text    AS savings,
             COALESCE(SUM(investment_balance), 0)::text AS investment
      FROM assets
      WHERE (owner_user_id IS NULL OR owner_user_id = ${me.id})
        AND month = (
          SELECT MAX(month) FROM assets
          WHERE (owner_user_id IS NULL OR owner_user_id = ${me.id})
        )
      GROUP BY scope
    `,
    // 年収の推定に使う厚生年金保険料（標準報酬月額 × 9.15%）
    sql<{ pension: number }>`
      SELECT pension FROM payslip_details
      WHERE owner_user_id = ${me.id} AND pension IS NOT NULL AND pension > 0
      ORDER BY payment_month DESC LIMIT 1
    `,
    sql<{ n: number }>`
      SELECT (
        (SELECT COUNT(*) FROM life_tools
          WHERE tool = 'mortgage' AND (owner_user_id IS NULL OR owner_user_id = ${me.id})) +
        (SELECT COUNT(*) FROM life_streams
          WHERE kind = 'expense' AND name LIKE '%ローン%'
            AND (owner_user_id IS NULL OR owner_user_id = ${me.id}))
      )::int AS n
    `,
  ])

  const categoryTotals: Record<string, number> = {}
  const categoryBySelf: Record<string, number> = {}
  const categoryByJoint: Record<string, number> = {}
  for (const r of catRows) {
    const v = Number(r.total)
    categoryTotals[r.category] = (categoryTotals[r.category] ?? 0) + v
    if (r.scope === "joint") categoryByJoint[r.category] = v
    else categoryBySelf[r.category] = v
  }

  const pick = <T extends { scope: string }>(rows: T[], scope: string) =>
    rows.find(r => r.scope === scope)

  const annualExpense = expenseRows.reduce((s, r) => s + Number(r.total), 0)
  const standardMonthly = payslipRows[0]?.pension
    ? Math.round(Number(payslipRows[0].pension) / 0.0915 / 1000) * 1000
    : null

  const selfAsset = pick(assetRows, "self")
  const jointAsset = pick(assetRows, "joint")

  return NextResponse.json({
    // 資産が未登録なのか、本当に0円なのかを区別できるようにする
    hasAssetData: assetRows.length > 0,
    monthlyExpense: annualExpense > 0 ? Math.round(annualExpense / 12) : null,
    savings: assetRows.reduce((s, r) => s + Number(r.savings), 0),
    investment: assetRows.reduce((s, r) => s + Number(r.investment), 0),
    annualIncome: standardMonthly ? standardMonthly * 12 : null,
    categoryTotals,
    hasMortgage: Number(mortgageRows[0]?.n ?? 0) > 0,
    byScope: {
      self: {
        savings: Number(selfAsset?.savings ?? 0),
        investment: Number(selfAsset?.investment ?? 0),
        categoryTotals: categoryBySelf,
      },
      joint: {
        savings: Number(jointAsset?.savings ?? 0),
        investment: Number(jointAsset?.investment ?? 0),
        categoryTotals: categoryByJoint,
      },
    },
  })
}
