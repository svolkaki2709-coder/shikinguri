import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

async function migrateBudgets() {
  // month カラム追加（NULL = 毎月共通デフォルト、'YYYY-MM' = その月専用 or この月以降の開始月）
  await sql`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS month TEXT`
  // is_from_month カラム追加（TRUE = 'この月以降'）
  await sql`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS is_from_month BOOLEAN DEFAULT FALSE`
  // (category, card_type, month) のユニーク制約に変更
  try {
    await sql`ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_category_card_type_key`
  } catch (_) { /* 無視 */ }
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
      c.group_type, c.sort_order
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

  const actuals = await sql`
    SELECT t.category, c.card_type, SUM(t.amount) AS actual
    FROM transactions t
    LEFT JOIN cards c ON t.card_id = c.id
    WHERE TO_CHAR(t.date, 'YYYY-MM') = ${month}
    GROUP BY t.category, c.card_type
  `

  const actualMap: Record<string, number> = {}
  for (const r of actuals) {
    actualMap[`${r.category}__${r.card_type}`] = Number(r.actual)
  }

  const rows = budgets.map((b) => ({
    category: b.category,
    cardType: b.card_type,
    budget: Number(b.amount),
    actual: actualMap[`${b.category}__${b.card_type}`] ?? 0,
    isMonthly: b.month === month && !b.is_from_month,
    isFromMonth: b.is_from_month === true,
    recordMonth: b.month ?? null,
    groupType: (b.group_type ?? null) as string | null,
    sortOrder: (b.sort_order ?? null) as number | null,
  }))

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

  await migrateBudgets()

  const { category, amount, card_type, month, is_from_month } = await req.json()

  if (month) {
    if (is_from_month) {
      // この月以降: 同カテゴリの既存 is_from_month レコードを全削除してから新規挿入
      await sql`DELETE FROM budgets WHERE category = ${category} AND card_type = ${card_type ?? "self"} AND COALESCE(is_from_month, FALSE) = TRUE`
    } else {
      // この月だけ: 同月の既存レコードを削除してから新規挿入
      await sql`DELETE FROM budgets WHERE category = ${category} AND card_type = ${card_type ?? "self"} AND month = ${month} AND COALESCE(is_from_month, FALSE) = FALSE`
    }
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
  // 保存後のレコードを返す（デバッグ用）
  const saved = await sql`SELECT category, card_type, amount, month, is_from_month FROM budgets WHERE category = ${category} AND card_type = ${card_type ?? "self"} ORDER BY month DESC NULLS LAST`
  return NextResponse.json({ success: true, saved: saved.map(r => ({ category: r.category, cardType: r.card_type, amount: Number(r.amount), month: r.month, isFromMonth: r.is_from_month })) })
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
