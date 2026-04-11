import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  // 表示月（指定なければ今月）
  const now = new Date()
  const month =
    searchParams.get("month") ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const [monthlyRes, categoryRes, latestMonthsRes] = await Promise.all([
    // 直近12ヶ月の月別合計
    sql`
      SELECT
        TO_CHAR(date, 'YYYY-MM') AS month,
        SUM(amount) AS total,
        SUM(CASE WHEN type = 'joint' THEN amount ELSE 0 END) AS joint_total,
        SUM(CASE WHEN type = 'self_15' THEN amount ELSE 0 END) AS self15_total,
        SUM(CASE WHEN type = 'self_end' THEN amount ELSE 0 END) AS self_end_total
      FROM transactions
      WHERE date >= NOW() - INTERVAL '12 months'
      GROUP BY month
      ORDER BY month ASC
    `,
    // 指定月のカテゴリ別合計
    sql.query(
      `SELECT category, SUM(amount) AS amount
       FROM transactions
       WHERE TO_CHAR(date, 'YYYY-MM') = $1
       GROUP BY category
       ORDER BY amount DESC`,
      [month]
    ),
    // 最新月を特定
    sql`SELECT TO_CHAR(MAX(date), 'YYYY-MM') AS latest FROM transactions`,
  ])

  return NextResponse.json({
    monthly: monthlyRes.rows.map((r) => ({
      month: r.month,
      total: Number(r.total),
      jointTotal: Number(r.joint_total),
      self15Total: Number(r.self15_total),
      selfEndTotal: Number(r.self_end_total),
    })),
    categories: categoryRes.rows.map((r) => ({
      category: r.category,
      amount: Number(r.amount),
    })),
    latestMonth: latestMonthsRes.rows[0]?.latest ?? month,
    currentMonth: month,
  })
}
