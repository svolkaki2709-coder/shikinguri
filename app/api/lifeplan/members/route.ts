import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized, forbidden } from "@/lib/session"

/** 家族構成の追加。生年から各年の年齢を自動計算するために使う。 */
export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { name, birth_year, relation, card_type } = await req.json()
  if (!name || !birth_year) {
    return NextResponse.json({ error: "name と birth_year は必須です" }, { status: 400 })
  }
  const owner = card_type === "self" ? me.id : null

  const [row] = await sql`
    INSERT INTO life_members (name, birth_year, relation, owner_user_id)
    VALUES (${String(name).trim()}, ${Number(birth_year)}, ${relation ?? "本人"}, ${owner})
    RETURNING *
  `
  return NextResponse.json({ member: row })
}

export async function PATCH(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { id, name, birth_year, relation } = await req.json()
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

  const updated = await sql`
    UPDATE life_members SET
      name       = COALESCE(${name ?? null}, name),
      birth_year = COALESCE(${birth_year != null ? Number(birth_year) : null}, birth_year),
      relation   = COALESCE(${relation ?? null}, relation)
    WHERE id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    RETURNING *
  `
  if (updated.length === 0) return forbidden()
  return NextResponse.json({ member: updated[0] })
}

export async function DELETE(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const id = new URL(req.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

  const deleted = await sql`
    DELETE FROM life_members
    WHERE id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    RETURNING id
  `
  if (deleted.length === 0) return forbidden()
  return NextResponse.json({ success: true })
}
