import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized } from "@/lib/session"

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser()
    if (!me) return unauthorized()

    const { searchParams } = new URL(req.url)
    const now = new Date()
    const month =
      searchParams.get("month") ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    // 個人/共同トグルに連動させる（カテゴリ別内訳が両方を合算していた不具合）
    const viewJoint = searchParams.get("view_type") === "joint"

    const [monthly, cardSummary, categoryBreakdown, incomeTotal, latestAssets, budgetVsActual] =
      await Promise.all([
        // 過去12ヶ月の月次合計（個人/共同別）
        sql`
          SELECT
            TO_CHAR(t.date, 'YYYY-MM') AS month,
            SUM(t.amount) AS total,
            SUM(CASE WHEN t.owner_user_id IS NULL THEN t.amount ELSE 0 END) AS joint_total,
            SUM(CASE WHEN t.owner_user_id = ${me.id} THEN t.amount ELSE 0 END) AS self_total
          FROM transactions t
          WHERE t.date >= (NOW() AT TIME ZONE 'Asia/Tokyo')::date - INTERVAL '12 months'
            AND (t.owner_user_id IS NULL OR t.owner_user_id = ${me.id})
          GROUP BY TO_CHAR(t.date, 'YYYY-MM')
          ORDER BY month ASC
        `,
        // 当月の口座別合計
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
            AND (t.owner_user_id IS NULL OR t.owner_user_id = ${me.id})
          WHERE c.name != '現金'
            AND (c.owner_user_id IS NULL OR c.owner_user_id = ${me.id})
          GROUP BY c.id, c.name, c.card_type, c.color, c.sort_order
          ORDER BY c.sort_order
        `,
        // 当月カテゴリ別内訳（個人/共同トグルで絞る）
        viewJoint
          ? sql`
              SELECT category, SUM(amount) AS amount
              FROM transactions
              WHERE TO_CHAR(date, 'YYYY-MM') = ${month} AND owner_user_id IS NULL
              GROUP BY category ORDER BY amount DESC LIMIT 10
            `
          : sql`
              SELECT category, SUM(amount) AS amount
              FROM transactions
              WHERE TO_CHAR(date, 'YYYY-MM') = ${month} AND owner_user_id = ${me.id}
              GROUP BY category ORDER BY amount DESC LIMIT 10
            `,
        // 当月の個人収入合計（給与源泉税などのマイナス行は額面表示のため除外）
        sql`
          SELECT COALESCE(SUM(amount), 0) AS total
          FROM incomes
          WHERE TO_CHAR(date, 'YYYY-MM') = ${month}
            AND card_type = 'self' AND amount > 0
            AND owner_user_id = ${me.id}
        `,
        sql`SELECT * FROM assets WHERE owner_user_id = ${me.id} ORDER BY month DESC LIMIT 1`,
        // 予算 vs 実績（当月）
        // 実績側はカテゴリ名だけでなくスコープも一致させる。
        // 一致させないと個人と共同の同名カテゴリが互いの実績を拾って二重計上になる。
        sql`
          SELECT
            b.category,
            b.card_type,
            b.amount AS budget,
            COALESCE(SUM(t.amount), 0) AS actual,
            c.group_type,
            c.sort_order
          FROM budgets b
          LEFT JOIN transactions t
            ON t.category = b.category
            AND TO_CHAR(t.date, 'YYYY-MM') = ${month}
            AND COALESCE(t.owner_user_id, 0) = COALESCE(b.owner_user_id, 0)
          LEFT JOIN categories c
            ON c.name = b.category AND c.card_type = b.card_type
            AND COALESCE(c.owner_user_id, 0) = COALESCE(b.owner_user_id, 0)
          WHERE (b.owner_user_id IS NULL OR b.owner_user_id = ${me.id})
          GROUP BY b.category, b.card_type, b.amount, c.group_type, c.sort_order
          ORDER BY c.group_type NULLS LAST, COALESCE(c.sort_order, 9999), b.category
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
        sortOrder: (r.sort_order ?? null) as number | null,
      })),
      currentMonth: month,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error("[dashboard API error]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
