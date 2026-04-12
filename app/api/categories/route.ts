import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

async function migrateCategories() {
  await sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS card_type TEXT NOT NULL DEFAULT 'self'`
  await sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS group_type TEXT`
  await sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INTEGER`
  try {
    await sql`ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_key`
  } catch (_) { /* 無視 */ }
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
  } catch (_) { /* 無視 */ }
  // sort_order が未設定の行に初期値をセット（追加順）
  await sql`
    UPDATE categories SET sort_order = sub.rn
    FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY card_type ORDER BY id) AS rn
      FROM categories WHERE sort_order IS NULL
    ) sub
    WHERE categories.id = sub.id
  `
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await migrateCategories()

  const { searchParams } = new URL(req.url)
  const cardType = searchParams.get("card_type")

  let rows
  if (cardType) {
    rows = await sql`SELECT name, card_type, group_type, sort_order FROM categories WHERE card_type = ${cardType} ORDER BY COALESCE(sort_order, 9999), name`
  } else {
    rows = await sql`SELECT name, card_type, group_type, sort_order FROM categories ORDER BY card_type, COALESCE(sort_order, 9999), name`
  }

  return NextResponse.json({
    categories: rows.map(r => r.name as string),
    rows: rows.map(r => ({
      name: r.name as string,
      card_type: r.card_type as string,
      group_type: (r.group_type ?? null) as string | null,
      sort_order: (r.sort_order ?? null) as number | null,
    })),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await migrateCategories()

  const { name, card_type, group_type } = await req.json()
  if (!name) return NextResponse.json({ error: "名前が必要です" }, { status: 400 })

  const ct = card_type ?? "self"
  const existing = await sql`SELECT id FROM categories WHERE name = ${name} AND card_type = ${ct}`
  if (existing.length === 0) {
    // 末尾に追加（そのcard_typeの最大sort_order + 1）
    const maxRes = await sql`SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM categories WHERE card_type = ${ct}`
    const nextOrder = maxRes[0].next as number
    await sql`INSERT INTO categories (name, card_type, group_type, sort_order) VALUES (${name}, ${ct}, ${group_type ?? null}, ${nextOrder})`
  } else {
    if (group_type !== undefined) {
      await sql`UPDATE categories SET group_type = ${group_type ?? null} WHERE name = ${name} AND card_type = ${ct}`
    }
  }
  return NextResponse.json({ success: true })
}

// PATCH: action="reorder" → sort_order一括更新 / それ以外 → 共用カテゴリ自動移行
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await migrateCategories()

  const body = await req.json().catch(() => ({}))

  // ドラッグ&ドロップによる並び替え
  if (body.action === "reorder") {
    const updates: Array<{ name: string; card_type: string; sort_order: number }> = body.updates ?? []
    for (const u of updates) {
      await sql`UPDATE categories SET sort_order = ${u.sort_order} WHERE name = ${u.name} AND card_type = ${u.card_type}`
    }
    return NextResponse.json({ success: true })
  }

  // 既存: 共用カード取引からカテゴリを自動移行
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

  const rows = await sql`SELECT name, card_type, group_type, sort_order FROM categories ORDER BY card_type, COALESCE(sort_order, 9999), name`
  return NextResponse.json({
    categories: rows.map(r => r.name as string),
    rows: rows.map(r => ({
      name: r.name as string,
      card_type: r.card_type as string,
      group_type: (r.group_type ?? null) as string | null,
      sort_order: (r.sort_order ?? null) as number | null,
    })),
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
