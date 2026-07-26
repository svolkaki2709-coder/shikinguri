import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized, forbidden } from "@/lib/session"

/** 定期項目を指定月だけスキップする（未登録候補から外す。取引は作らない） */
export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { id, month } = await req.json()
  if (!id || !month) {
    return NextResponse.json({ error: "id, month は必須です" }, { status: 400 })
  }

  const [recurring] = await sql<{ id: number }>`
    SELECT id FROM recurring_expenses
    WHERE id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    LIMIT 1
  `
  if (!recurring) return forbidden()

  await sql`
    INSERT INTO recurring_skips (recurring_id, month)
    VALUES (${Number(id)}, ${month})
    ON CONFLICT (recurring_id, month) DO NOTHING
  `
  return NextResponse.json({ success: true })
}

/** スキップを取り消す */
export async function DELETE(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  const month = searchParams.get("month")
  if (!id || !month) {
    return NextResponse.json({ error: "id, month は必須です" }, { status: 400 })
  }

  const [recurring] = await sql<{ id: number }>`
    SELECT id FROM recurring_expenses
    WHERE id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    LIMIT 1
  `
  if (!recurring) return forbidden()

  await sql`DELETE FROM recurring_skips WHERE recurring_id = ${Number(id)} AND month = ${month}`
  return NextResponse.json({ success: true })
}
