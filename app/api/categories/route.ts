import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

async function migrateCategories() {
  await sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS card_type TEXT NOT NULL DEFAULT 'self'`
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await migrateCategories()

  const { searchParams } = new URL(req.url)
  const cardType = searchParams.get("card_type")

  let rows
  if (cardType) {
    rows = await sql`SELECT name, card_type FROM categories WHERE card_type = ${cardType} ORDER BY sort_order, name`
  } else {
    rows = await sql`SELECT name, card_type FROM categories ORDER BY card_type, sort_order, name`
  }

  return NextResponse.json({
    categories: rows.map(r => r.name as string),
    rows: rows.map(r => ({ name: r.name as string, card_type: r.card_type as string })),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await migrateCategories()

  const { name, card_type } = await req.json()
  if (!name) return NextResponse.json({ error: "名前が必要です" }, { status: 400 })

  const ct = card_type ?? "self"
  const existing = await sql`SELECT id FROM categories WHERE name = ${name}`
  if (existing.length === 0) {
    await sql`INSERT INTO categories (name, card_type) VALUES (${name}, ${ct})`
  } else {
    // Update card_type if it already exists
    await sql`UPDATE categories SET card_type = ${ct} WHERE name = ${name}`
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
