import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

async function migrateCards() {
  try { await sql`ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_name_key` } catch (_) {}
  try {
    await sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'cards_name_cardtype_key'
        ) THEN
          ALTER TABLE cards ADD CONSTRAINT cards_name_cardtype_key UNIQUE (name, card_type);
        END IF;
      END $$
    `
  } catch (_) {}
  await sql`ALTER TABLE cards ADD COLUMN IF NOT EXISTS has_csv BOOLEAN DEFAULT FALSE`
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await migrateCards()
  const cards = await sql`SELECT * FROM cards ORDER BY sort_order`
  return NextResponse.json({ cards })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name, card_type, color, sort_order } = await req.json()
  if (!name) return NextResponse.json({ error: "name は必須です" }, { status: 400 })

  // 同じ card_type 内での重複チェック（個人と共用は別扱いなので同名可）
  const ct = card_type ?? "self"
  const existing = await sql`SELECT * FROM cards WHERE name = ${name} AND card_type = ${ct} LIMIT 1`
  if (existing.length > 0) {
    return NextResponse.json({ card: existing[0] })
  }

  const result = await sql`
    INSERT INTO cards (name, card_type, color, sort_order)
    VALUES (${name}, ${ct}, ${color ?? "#6b7280"}, ${sort_order ?? 99})
    RETURNING *
  `
  return NextResponse.json({ card: result[0] })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await req.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

    // has_csv トグル
    if (typeof body.has_csv === "boolean") {
      const result = await sql`UPDATE cards SET has_csv = ${body.has_csv} WHERE id = ${Number(id)} RETURNING *`
      return NextResponse.json({ card: result[0] })
    }

    // 名前変更
    const { name } = body
    if (!name?.trim()) return NextResponse.json({ error: "name は必須です" }, { status: 400 })
    const target = await sql`SELECT card_type FROM cards WHERE id = ${Number(id)} LIMIT 1`
    const cardType = target[0]?.card_type ?? "self"
    const existing = await sql`SELECT * FROM cards WHERE name = ${name.trim()} AND card_type = ${cardType} AND id != ${Number(id)} LIMIT 1`
    if (existing.length > 0) return NextResponse.json({ error: "同じ種別に同じ名前の支払方法が既に存在します" }, { status: 400 })

    const result = await sql`UPDATE cards SET name = ${name.trim()} WHERE id = ${Number(id)} RETURNING *`
    return NextResponse.json({ card: result[0] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  const reassignId = searchParams.get("reassign_to")  // 移行先カードID
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

  // 移行先が指定されていれば、このカードのトランザクションを付け替え
  if (reassignId) {
    await sql`UPDATE transactions SET card_id = ${Number(reassignId)} WHERE card_id = ${Number(id)}`
    await sql`UPDATE recurring_expenses SET card_id = ${Number(reassignId)} WHERE card_id = ${Number(id)}`
  }

  await sql`DELETE FROM cards WHERE id = ${Number(id)}`
  return NextResponse.json({ success: true })
}
