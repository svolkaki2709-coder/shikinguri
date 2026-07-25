import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized, forbidden, ownerFor } from "@/lib/session"

type Row = {
  name: string
  card_type: string
  group_type: string | null
  sort_order: number | null
  sign: string | null
}

function shape(rows: Row[]) {
  return {
    categories: rows.map(r => r.name),
    rows: rows.map(r => ({
      name: r.name,
      card_type: r.card_type,
      group_type: r.group_type ?? null,
      sort_order: r.sort_order ?? null,
      sign: r.sign ?? null,
    })),
  }
}

export async function GET(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const cardType = searchParams.get("card_type")

  const rows = cardType
    ? await sql<Row>`
        SELECT name, card_type, group_type, sort_order, sign FROM categories
        WHERE card_type = ${cardType}
          AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
        ORDER BY COALESCE(sort_order, 9999), name
      `
    : await sql<Row>`
        SELECT name, card_type, group_type, sort_order, sign FROM categories
        WHERE (owner_user_id IS NULL OR owner_user_id = ${me.id})
        ORDER BY card_type, COALESCE(sort_order, 9999), name
      `

  return NextResponse.json(shape(rows))
}

export async function POST(req: Request) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { name, card_type, group_type, sign } = await req.json()
  if (!name) return NextResponse.json({ error: "名前が必要です" }, { status: 400 })

  const ct = card_type === "joint" ? "joint" : "self"
  const owner = ownerFor(ct, me.id)

  const existing = owner === null
    ? await sql<{ id: number }>`SELECT id FROM categories WHERE name = ${name} AND card_type = ${ct} AND owner_user_id IS NULL`
    : await sql<{ id: number }>`SELECT id FROM categories WHERE name = ${name} AND card_type = ${ct} AND owner_user_id = ${owner}`

  if (existing.length === 0) {
    // 末尾に追加（同一スコープ内の最大 sort_order + 1）
    const maxRes = owner === null
      ? await sql<{ next: number }>`SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM categories WHERE card_type = ${ct} AND owner_user_id IS NULL`
      : await sql<{ next: number }>`SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM categories WHERE card_type = ${ct} AND owner_user_id = ${owner}`
    await sql`
      INSERT INTO categories (name, card_type, group_type, sort_order, owner_user_id)
      VALUES (${name}, ${ct}, ${group_type ?? null}, ${maxRes[0].next}, ${owner})
    `
  } else {
    if (group_type !== undefined) {
      await sql`UPDATE categories SET group_type = ${group_type ?? null} WHERE id = ${existing[0].id}`
    }
    if (sign !== undefined) {
      await sql`UPDATE categories SET sign = ${sign ?? null} WHERE id = ${existing[0].id}`
    }
  }
  return NextResponse.json({ success: true })
}

// PATCH: action="reorder" → sort_order 一括更新。それ以外は一覧を返すだけ。
export async function PATCH(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const body = await req.json().catch(() => ({}))

  if (body.action === "reorder") {
    // 画面によって items / updates のどちらでも受ける
    const updates: Array<{ name: string; card_type: string; sort_order: number }> =
      body.updates ?? body.items ?? []
    for (const u of updates) {
      await sql`
        UPDATE categories SET sort_order = ${u.sort_order}
        WHERE name = ${u.name} AND card_type = ${u.card_type}
          AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
      `
    }
    return NextResponse.json({ success: true })
  }

  const rows = await sql<Row>`
    SELECT name, card_type, group_type, sort_order, sign FROM categories
    WHERE (owner_user_id IS NULL OR owner_user_id = ${me.id})
    ORDER BY card_type, COALESCE(sort_order, 9999), name
  `
  return NextResponse.json(shape(rows))
}

export async function DELETE(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const name = searchParams.get("name")
  // 個人と共同で同名カテゴリが並存するため card_type は必須（片方だけ消す）
  const cardType = searchParams.get("card_type")
  if (!name) return NextResponse.json({ error: "name は必須です" }, { status: 400 })
  if (cardType !== "self" && cardType !== "joint") {
    return NextResponse.json(
      { error: "card_type（self / joint）の指定が必要です" }, { status: 400 }
    )
  }

  const deleted = await sql`
    DELETE FROM categories
    WHERE name = ${name} AND card_type = ${cardType}
      AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    RETURNING id
  `
  if (deleted.length === 0) return forbidden()
  return NextResponse.json({ success: true })
}
