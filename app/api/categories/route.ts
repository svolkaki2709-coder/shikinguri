import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

async function migrateCategories() {
  await sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS card_type TEXT NOT NULL DEFAULT 'self'`
  await sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS group_type TEXT`
  // name のみの UNIQUE 制約を削除し、(name, card_type) の複合 UNIQUE に変更
  // → 個人と共用で同じカテゴリ名を共存可能にする
  try {
    await sql`ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_key`
  } catch (_) { /* 制約がなければ無視 */ }
  try {
    await sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'categories_name_cardtype_key'
        ) THEN
          ALTER TABLE categories ADD CONSTRAINT categories_name_cardtype_key UNIQUE (name, card_type);
        END IF;
      END $$
    `
  } catch (_) { /* 既に存在すれば無視 */ }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await migrateCategories()

  const { searchParams } = new URL(req.url)
  const cardType = searchParams.get("card_type")

  let rows
  if (cardType) {
    rows = await sql`SELECT name, card_type, group_type FROM categories WHERE card_type = ${cardType} ORDER BY sort_order, name`
  } else {
    rows = await sql`SELECT name, card_type, group_type FROM categories ORDER BY card_type, sort_order, name`
  }

  return NextResponse.json({
    categories: rows.map(r => r.name as string),
    rows: rows.map(r => ({ name: r.name as string, card_type: r.card_type as string, group_type: (r.group_type ?? null) as string | null })),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await migrateCategories()

  const { name, card_type, group_type } = await req.json()
  if (!name) return NextResponse.json({ error: "名前が必要です" }, { status: 400 })

  const ct = card_type ?? "self"
  // (name, card_type) の組み合わせで存在確認（同名カテゴリを個人・共用両方で持てる）
  const existing = await sql`SELECT id FROM categories WHERE name = ${name} AND card_type = ${ct}`
  if (existing.length === 0) {
    await sql`INSERT INTO categories (name, card_type, group_type) VALUES (${name}, ${ct}, ${group_type ?? null})`
  } else {
    if (group_type !== undefined) {
      await sql`UPDATE categories SET group_type = ${group_type ?? null} WHERE name = ${name} AND card_type = ${ct}`
    }
    // card_type の更新は行わない（個人→共用の移動は削除→追加で対応）
  }
  return NextResponse.json({ success: true })
}

// 取引履歴から共用カードで使われたカテゴリをjointに自動移行
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await migrateCategories()

  await sql`
    UPDATE categories
    SET card_type = 'joint'
    WHERE name != '未分類'
    AND card_type = 'self'
    AND name IN (
      SELECT DISTINCT t.category
      FROM transactions t
      JOIN cards c ON t.card_id = c.id
      WHERE c.card_type = 'joint'
    )
  `

  const rows = await sql`SELECT name, card_type FROM categories ORDER BY card_type, name`
  return NextResponse.json({
    categories: rows.map(r => r.name as string),
    rows: rows.map(r => ({ name: r.name as string, card_type: r.card_type as string })),
  })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const name = searchParams.get("name")
  if (!name) return NextResponse.json({ error: "name は必須です" }, { status: 400 })

  await sql`DELETE FROM categories WHERE name = ${name}`
  return NextResponse.json({ success: true })
}
