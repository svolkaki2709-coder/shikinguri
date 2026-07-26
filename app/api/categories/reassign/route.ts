import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized } from "@/lib/session"

/**
 * 既存カテゴリに割り振られている明細・収入をまとめて別カテゴリへ付け替える。
 * 対象はリクエスト元のスコープ（個人ならその人の個人データ、共同なら共同データ）に限る。
 */
export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { card_type, from, to } = await req.json()
  const fromName = String(from ?? "").trim()
  const toName = String(to ?? "").trim()
  if (!fromName || !toName) {
    return NextResponse.json({ error: "移行元・移行先のカテゴリが必要です" }, { status: 400 })
  }
  if (fromName === toName) {
    return NextResponse.json({ error: "同じカテゴリには変更できません" }, { status: 400 })
  }

  const owner = card_type === "joint" ? null : me.id

  // 移行元・移行先とも、自分が触れるスコープに実在するカテゴリであることを確認する
  const [fromCat, toCat] = await Promise.all([
    owner === null
      ? sql<{ id: number }>`SELECT id FROM categories WHERE name = ${fromName} AND card_type = 'joint' AND owner_user_id IS NULL LIMIT 1`
      : sql<{ id: number }>`SELECT id FROM categories WHERE name = ${fromName} AND card_type = 'self' AND owner_user_id = ${owner} LIMIT 1`,
    owner === null
      ? sql<{ id: number }>`SELECT id FROM categories WHERE name = ${toName} AND card_type = 'joint' AND owner_user_id IS NULL LIMIT 1`
      : sql<{ id: number }>`SELECT id FROM categories WHERE name = ${toName} AND card_type = 'self' AND owner_user_id = ${owner} LIMIT 1`,
  ])
  if (fromCat.length === 0 || toCat.length === 0) {
    return NextResponse.json({ error: "指定したカテゴリが見つかりません" }, { status: 404 })
  }

  const [tx, inc] = await Promise.all([
    owner === null
      ? sql`UPDATE transactions SET category = ${toName} WHERE category = ${fromName} AND owner_user_id IS NULL RETURNING id`
      : sql`UPDATE transactions SET category = ${toName} WHERE category = ${fromName} AND owner_user_id = ${owner} RETURNING id`,
    owner === null
      ? sql`UPDATE incomes SET category = ${toName} WHERE category = ${fromName} AND owner_user_id IS NULL RETURNING id`
      : sql`UPDATE incomes SET category = ${toName} WHERE category = ${fromName} AND owner_user_id = ${owner} RETURNING id`,
  ])

  // 予算・定期支出・自動振り分けルールも一緒に付け替える（残すと迷子の設定になるため）
  const [budgets, recurring, rules] = await Promise.all([
    owner === null
      ? sql`UPDATE budgets SET category = ${toName} WHERE category = ${fromName} AND owner_user_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM budgets b2 WHERE b2.category = ${toName} AND b2.card_type = 'joint'
              AND COALESCE(b2.month,'') = COALESCE(budgets.month,'') AND b2.owner_user_id IS NULL) RETURNING id`
      : sql`UPDATE budgets SET category = ${toName} WHERE category = ${fromName} AND owner_user_id = ${owner}
            AND NOT EXISTS (SELECT 1 FROM budgets b2 WHERE b2.category = ${toName} AND b2.card_type = 'self'
              AND COALESCE(b2.month,'') = COALESCE(budgets.month,'') AND b2.owner_user_id = ${owner}) RETURNING id`,
    owner === null
      ? sql`UPDATE recurring_expenses SET category = ${toName} WHERE category = ${fromName} AND owner_user_id IS NULL RETURNING id`
      : sql`UPDATE recurring_expenses SET category = ${toName} WHERE category = ${fromName} AND owner_user_id = ${owner} RETURNING id`,
    owner === null
      ? sql`UPDATE store_category_rules SET category = ${toName} WHERE category = ${fromName} AND owner_user_id IS NULL RETURNING id`
      : sql`UPDATE store_category_rules SET category = ${toName} WHERE category = ${fromName} AND owner_user_id = ${owner} RETURNING id`,
  ])

  // 付け替えきれなかった旧カテゴリの予算（移行先に同月の予算が既にあった等）は掃除する
  await (owner === null
    ? sql`DELETE FROM budgets WHERE category = ${fromName} AND card_type = 'joint' AND owner_user_id IS NULL`
    : sql`DELETE FROM budgets WHERE category = ${fromName} AND card_type = 'self' AND owner_user_id = ${owner}`)

  return NextResponse.json({
    success: true,
    transactions: tx.length,
    incomes: inc.length,
    budgets: budgets.length,
    recurring: recurring.length,
    rules: rules.length,
  })
}
