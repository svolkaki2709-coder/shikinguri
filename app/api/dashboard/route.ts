import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const now = new Date()
  const month =
    searchParams.get("month") ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const [monthly, cardSummary, categoryBreakdown, incomeTotal, latestAssets, budgetVsActual] = await Promise.all([
    // 過去12ヶ月の月次合計（カード別）
    sql`
      SELECT
        TO_CHAR(t.date, 'YYYY-MM') AS month,
        SUM(t.amount) AS total,
        SUM(CASE WHEN c.card_type = 'joint' THEN t.amount ELSE 0 END) AS joint_total,
        SUM(CASE WHEN c.card_type = 'self' THEN t.amount ELSE 0 END) AS self_total
      FROM transactions t
      LEFT JOIN cards c ON t.card_id = c.id
      WHERE t.date >= NOW() - INTERVAL '12 months'
      GROUP BY TO_CHAR(t.date, 'YYYY-MM')
      ORDER BY month ASC
    `,
    // 当月カード別合計（「現金」カードは除外）
    sql`
      SELECT
        c.id AS card_id,
        c.name AS card_name,
        c.card_type,
        c.color,
        COALESCE(SUM(t.amount), 0) AS total
      FROM cards c
      LEFT JOIN transactions t ON t.card_id = c.id
        AND TO_CHAR(t.date, 'YYYY-MM') = ${month}
      WHERE c.name != '現金'
      GROUP BY c.id, c.name, c.card_type, c.color
      ORDER BY c.sort_order
    `,
    // 当月カテゴリ別内訳
    sql`
      SELECT category, SUM(amount) AS amount
      FROM transactions
      WHERE TO_CHAR(date, 'YYYY-MM') = ${month}
      GROUP BY category
      ORDER BY amount DESC
      LIMIT 10
    `,
    // 当月収入合計
    sql`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM incomes
      WHERE TO_CHAR(date, 'YYYY-MM') = ${month}
    `,
    // 最新資産スナップショット
    sql`
      SELECT * FROM assets ORDER BY month DESC LIMIT 1
    `,
    // 予算 vs 実績（当月）+ カテゴリのgroup_type
    sql`
      SELECT
        b.category,
        b.card_type,
        b.amount AS budget,
        COALESCE(SUM(t.amount), 0) AS actual,
        c.group_type
      FROM budgets b
      LEFT JOIN transactions t ON t.category = b.category
        AND TO_CHAR(t.date, 'YYYY-MM') = ${month}
      LEFT JOIN categories c ON c.name = b.category
      GROUP BY b.category, b.card_type, b.amount, c.group_type
      ORDER BY c.group_type NULLS LAST, b.card_type, b.category
    `,
  ])

  return NextResponse.json({
    monthly: monthly.map((r) => ({
      month: r.month,
      total: Number(r.total),
      jointTotal: Number(r.joint_total),
      selfTotal: Number(r.self_total),
    })),
    cardSummary: cardSummary.map((r) => ({
      cardId: r.card_id,
      cardName: r.card_name,
      cardType: r.card_type,
      color: r.color,
      total: Number(r.total),
    })),
    categoryBreakdown: categoryBreakdown.map((r) => ({
      category: r.category,
      amount: Number(r.amount),
    })),
    incomeTotal: Number(incomeTotal[0]?.total ?? 0),
    latestAssets: latestAssets[0] ?? null,
    budgetVsActual: budgetVsActual.map((r) => ({
      category: r.category,
      cardType: r.card_type,
      budget: Number(r.budget),
      actual: Number(r.actual),
      groupType: (r.group_type ?? null) as string | null,
    })),
    currentMonth: month,
  })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error("[dashboard API error]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
