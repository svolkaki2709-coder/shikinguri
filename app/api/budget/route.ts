import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

async function migrateBudgets() {
  // month カラム追加（NULL = 毎月共通デフォルト、'YYYY-MM' = その月専用 or この月以降の開始月）
  await sql`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS month TEXT`
  // is_from_month カラム追加（TRUE = 'この月以降'）
  await sql`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS is_from_month BOOLEAN DEFAULT FALSE`
  // 古い2カラムUNIQUE制約を全パターン個別に削除（try-catchで存在しない場合は無視）
  try { await sql`ALTER TABLE budgets DROP CONSTRAINT "budgets_category_type_key"` } catch (_) {}
  try { await sql`ALTER TABLE budgets DROP CONSTRAINT "budgets_category_card_type_key"` } catch (_) {}
  try { await sql`ALTER TABLE budgets DROP CONSTRAINT "budgets_category_card_type_unique"` } catch (_) {}
  // 新しい (category, card_type, month) 3カラムのユニーク制約を追加
  try {
    await sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'budgets_category_cardtype_month_key'
        ) THEN
          ALTER TABLE budgets ADD CONSTRAINT budgets_category_cardtype_month_key
            UNIQUE (category, card_type, month);
        END IF;
      END $$
    `
  } catch (_) { /* 無視 */ }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await migrateBudgets()

  const { searchParams } = new URL(req.url)
  const now = new Date()
  const month =
    searchParams.get("month") ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  // 優先順位: この月だけ > この月以降（最新） > 毎月共通
  const budgets = await sql`
    SELECT DISTINCT ON (b.category, b.card_type)
      b.category, b.card_type, b.amount, b.month, b.is_from_month,
      c.group_type, c.sort_order, c.sign
    FROM budgets b
    LEFT JOIN categories c ON c.name = b.category AND c.card_type = b.card_type
    WHERE b.month = ${month}
       OR (COALESCE(b.is_from_month, FALSE) = TRUE AND b.month <= ${month})
       OR b.month IS NULL
    ORDER BY b.category, b.card_type,
      CASE
        WHEN b.month = ${month} AND NOT COALESCE(b.is_from_month, FALSE) THEN 0
        WHEN COALESCE(b.is_from_month, FALSE) = TRUE THEN 1
        ELSE 2
      END,
      b.month DESC NULLS LAST
  `

  const [actuals, incomeActuals] = await Promise.all([
    sql`
      SELECT t.category, c.card_type, SUM(t.amount) AS actual
      FROM transactions t
      LEFT JOIN cards c ON t.card_id = c.id
      WHERE TO_CHAR(t.date, 'YYYY-MM') = ${month}
      GROUP BY t.category, c.card_type
    `,
    sql`
      SELECT category, card_type, SUM(amount) AS actual
      FROM incomes
      WHERE TO_CHAR(date, 'YYYY-MM') = ${month}
      GROUP BY category, card_type
    `,
  ])

  const actualMap: Record<string, number> = {}
  for (const r of actuals) {
    actualMap[`${r.category}__${r.card_type}`] = Number(r.actual)
  }
  // 収入テーブルの実績を合算
  for (const r of incomeActuals) {
    const key = `${r.category}__${r.card_type}`
    actualMap[key] = (actualMap[key] ?? 0) + Number(r.actual)
  }

  const rows = budgets.map((b) => {
    const effSign = b.sign === "plus" ? 1 : b.sign === "minus" ? -1
      : b.group_type === "収入" ? 1 : b.group_type === "振替" ? 0 : -1
    const rawActual = actualMap[`${b.category}__${b.card_type}`] ?? 0
    const actual = effSign === -1 && rawActual < 0 ? Math.abs(rawActual) : rawActual
    return {
      category: b.category,
      cardType: b.card_type,
      budget: Number(b.amount),
      actual,
      isMonthly: b.month === month && !b.is_from_month,
      isFromMonth: b.is_from_month === true,
      recordMonth: b.month ?? null,
      groupType: (b.group_type ?? null) as string | null,
      sortOrder: (b.sort_order ?? null) as number | null,
      sign: (b.sign ?? null) as string | null,
    }
  })

  // 全デフォルト一覧も返す（設定UI用）
  const defaults = await sql`SELECT category, card_type, amount FROM budgets WHERE month IS NULL ORDER BY card_type, category`

  return NextResponse.json({
    budgets: rows,
    defaults: defaults.map(b => ({ category: b.category, cardType: b.card_type, budget: Number(b.amount) })),
    month,
  })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    await migrateBudgets()

    const { category, amount, card_type, month, is_from_month } = await req.json()

    if (month) {
      if (is_from_month) {
        // 新しい開始月以降のレコードだけ削除（それより前の「以降」レコードは残す）
        await sql`DELETE FROM budgets WHERE category = ${category} AND card_type = ${card_type ?? "self"} AND COALESCE(is_from_month, FALSE) = TRUE AND month >= ${month}`
      }
      // 同じ month のレコードを削除（制約違反を防ぐ）
      await sql`DELETE FROM budgets WHERE category = ${category} AND card_type = ${card_type ?? "self"} AND month = ${month}`
      await sql`
        INSERT INTO budgets (category, amount, card_type, month, is_from_month)
        VALUES (${category}, ${Number(amount)}, ${card_type ?? "self"}, ${month}, ${!!is_from_month})
      `
    } else {
      // デフォルト予算（month = NULL）
      const existing = await sql`SELECT id FROM budgets WHERE category = ${category} AND card_type = ${card_type ?? "self"} AND month IS NULL`
      if (existing.length > 0) {
        await sql`UPDATE budgets SET amount = ${Number(amount)} WHERE category = ${category} AND card_type = ${card_type ?? "self"} AND month IS NULL`
      } else {
        await sql`INSERT INTO budgets (category, amount, card_type, month) VALUES (${category}, ${Number(amount)}, ${card_type ?? "self"}, NULL)`
      }
    }
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[PUT /api/budget] error:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const category = searchParams.get("category")
  const cardType = searchParams.get("card_type")
  const month = searchParams.get("month")  // なければデフォルトを削除

  if (!category || !cardType) return NextResponse.json({ error: "category, card_type は必須です" }, { status: 400 })

  if (month) {
    await sql`DELETE FROM budgets WHERE category = ${category} AND card_type = ${cardType} AND month = ${month}`
  } else {
    await sql`DELETE FROM budgets WHERE category = ${category} AND card_type = ${cardType} AND month IS NULL`
  }
  return NextResponse.json({ success: true })
}
