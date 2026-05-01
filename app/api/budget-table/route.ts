import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

/**
 * 予実横並び一覧 API
 * 指定期間の月ごと予算・実績を返す
 *
 * ?from=2026-01&to=2026-12
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const now = new Date()
  const currentYear = now.getFullYear()

  // デフォルト: 今年の1月〜12月
  const from = searchParams.get("from") ?? `${currentYear}-01`
  const to   = searchParams.get("to")   ?? `${currentYear}-12`

  // 期間内の月リストを生成
  const months: string[] = []
  const [fromY, fromM] = from.split("-").map(Number)
  const [toY,   toM  ] = to.split("-").map(Number)
  let y = fromY, m = fromM
  while (y < toY || (y === toY && m <= toM)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`)
    m++; if (m > 12) { m = 1; y++ }
  }

  // ---- 予算（デフォルト / 月別） ----
  const budgetRows = await sql`
    SELECT category, card_type, amount, month
    FROM budgets
    WHERE month IS NULL OR (month >= ${from + "-01"} AND month <= ${to + "-31"})
    ORDER BY category, card_type, (month IS NOT NULL) DESC
  `

  // カテゴリ・card_type ごとの月別予算を解決（月別 > デフォルト）
  type BudgetKey = string
  const budgetDefault: Record<BudgetKey, number> = {}
  const budgetMonthly: Record<BudgetKey, Record<string, number>> = {}

  for (const b of budgetRows) {
    const key = `${b.category}__${b.card_type}`
    if (!b.month) {
      budgetDefault[key] = Number(b.amount)
    } else {
      const mm = String(b.month).slice(0, 7) // "YYYY-MM"
      if (!budgetMonthly[key]) budgetMonthly[key] = {}
      budgetMonthly[key][mm] = Number(b.amount)
    }
  }

  // ---- 実績（取引合計 + 収入合計） ----
  const [actualRows, incomeActualRows] = await Promise.all([
    sql`
      SELECT
        t.category,
        c.card_type,
        TO_CHAR(t.date, 'YYYY-MM') AS month,
        SUM(t.amount) AS actual
      FROM transactions t
      LEFT JOIN cards c ON t.card_id = c.id
      WHERE TO_CHAR(t.date, 'YYYY-MM') >= ${from}
        AND TO_CHAR(t.date, 'YYYY-MM') <= ${to}
      GROUP BY t.category, c.card_type, TO_CHAR(t.date, 'YYYY-MM')
    `,
    sql`
      SELECT
        category,
        card_type,
        TO_CHAR(date, 'YYYY-MM') AS month,
        SUM(amount) AS actual
      FROM incomes
      WHERE TO_CHAR(date, 'YYYY-MM') >= ${from}
        AND TO_CHAR(date, 'YYYY-MM') <= ${to}
      GROUP BY category, card_type, TO_CHAR(date, 'YYYY-MM')
    `,
  ])

  // ---- 収入月別合計（thead表示用） ----
  const incomeByMonth: Record<string, number> = {}
  for (const r of incomeActualRows) {
    const key = r.month as string
    incomeByMonth[key] = (incomeByMonth[key] ?? 0) + Number(r.actual)
  }

  // ---- カテゴリ一覧（group_type, sort_order 付き） ----
  const categoryRows = await sql`
    SELECT name, card_type, group_type, COALESCE(sort_order, 9999) AS sort_order
    FROM categories
    ORDER BY card_type, group_type NULLS LAST, sort_order, name
  `

  // 実績マップ: "category__card_type__month" → actual（transactions + incomes 合算）
  const actualMap: Record<string, number> = {}
  for (const r of actualRows) {
    const key = `${r.category}__${r.card_type}__${r.month}`
    actualMap[key] = Number(r.actual)
  }
  for (const r of incomeActualRows) {
    const key = `${r.category}__${r.card_type}__${r.month}`
    actualMap[key] = (actualMap[key] ?? 0) + Number(r.actual)
  }

  // ---- レスポンス構築 ----
  const categories = categoryRows.map(c => {
    const key = `${c.name}__${c.card_type}`
    const budget = budgetDefault[key] ?? 0

    const byMonth: Record<string, { budget: number; actual: number }> = {}
    for (const mon of months) {
      const b = budgetMonthly[key]?.[mon] ?? budget
      const a = actualMap[`${c.name}__${c.card_type}__${mon}`] ?? 0
      byMonth[mon] = { budget: b, actual: a }
    }

    const yearBudget = months.reduce((s, mon) => s + (byMonth[mon].budget), 0)
    const yearActual = months.reduce((s, mon) => s + (byMonth[mon].actual), 0)

    return {
      name: c.name as string,
      cardType: c.card_type as string,
      groupType: (c.group_type ?? null) as string | null,
      sortOrder: Number(c.sort_order),
      budget,      // 月間デフォルト予算
      yearBudget,  // 期間内合計予算
      yearActual,  // 期間内合計実績
      byMonth,
    }
  })

  return NextResponse.json({ months, categories, incomeByMonth })
}
