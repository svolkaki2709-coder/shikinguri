import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

async function migrateBudgets() {
  // month カラム追加（NULL = 毎月共通デフォルト、'YYYY-MM' = その月専用）
  await sql`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS month TEXT`
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

  // 当月専用設定 → なければデフォルト(month IS NULL) でフォールバック
  // categories テーブルから group_type, sort_order も取得
  const budgets = await sql`
    SELECT DISTINCT ON (b.category, b.card_type)
      b.category, b.card_type, b.amount, b.month,
      c.group_type, c.sort_order
    FROM budgets b
    LEFT JOIN categories c ON c.name = b.category AND c.card_type = b.card_type
    WHERE b.month = ${month} OR b.month IS NULL
    ORDER BY b.category, b.card_type, (b.month IS NOT NULL) DESC
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
    isMonthly: b.month === month,
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

  const { category, amount, card_type, month } = await req.json()

  if (month) {
    // 月別専用予算
    await sql`
      INSERT INTO budgets (category, amount, card_type, month)
      VALUES (${category}, ${Number(amount)}, ${card_type ?? "self"}, ${month})
      ON CONFLICT (category, card_type, month) DO UPDATE SET amount = EXCLUDED.amount
    `
  } else {
    // デフォルト予算（month = NULL）
    // NULLはON CONFLICTで扱えないのでUPSERT的に処理
    const existing = await sql`SELECT id FROM budgets WHERE category = ${category} AND card_type = ${card_type ?? "self"} AND month IS NULL`
    if (existing.length > 0) {
      await sql`UPDATE budgets SET amount = ${Number(amount)} WHERE category = ${category} AND card_type = ${card_type ?? "self"} AND month IS NULL`
    } else {
      await sql`INSERT INTO budgets (category, amount, card_type, month) VALUES (${category}, ${Number(amount)}, ${card_type ?? "self"}, NULL)`
    }
  }
  return NextResponse.json({ success: true })
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
