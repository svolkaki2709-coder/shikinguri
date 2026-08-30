import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized, forbidden } from "@/lib/session"

/**
 * 計算ツールの入力値を保存する（住宅ローン・年金・必要保障額）。
 * (tool, member_id, スコープ) の組み合わせで1件に保つ。
 */
export async function PUT(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { tool, member_id, params, card_type } = await req.json()
  if (!tool) return NextResponse.json({ error: "tool は必須です" }, { status: 400 })

  const owner = card_type === "self" ? me.id : null
  const mid = member_id ? Number(member_id) : null

  // NULL 同士の一致は = で判定できないため、IS NOT DISTINCT FROM を使う
  const existing = owner === null
    ? await sql<{ id: number }>`
        SELECT id FROM life_tools
        WHERE tool = ${tool} AND owner_user_id IS NULL
          AND member_id IS NOT DISTINCT FROM ${mid}
        LIMIT 1
      `
    : await sql<{ id: number }>`
        SELECT id FROM life_tools
        WHERE tool = ${tool} AND owner_user_id = ${owner}
          AND member_id IS NOT DISTINCT FROM ${mid}
        LIMIT 1
      `

  if (existing.length > 0) {
    await sql`
      UPDATE life_tools SET params = ${JSON.stringify(params ?? {})}::jsonb, updated_at = NOW()
      WHERE id = ${existing[0].id}
    `
  } else {
    await sql`
      INSERT INTO life_tools (tool, member_id, params, owner_user_id)
      VALUES (${tool}, ${mid}, ${JSON.stringify(params ?? {})}::jsonb, ${owner})
    `
  }
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const id = new URL(req.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

  const deleted = await sql`
    DELETE FROM life_tools
    WHERE id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    RETURNING id
  `
  if (deleted.length === 0) return forbidden()
  return NextResponse.json({ success: true })
}
