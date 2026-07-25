import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized, forbidden } from "@/lib/session"

export async function GET(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const isJoint = searchParams.get("card_type") === "joint"

  const goals = isJoint
    ? await sql`SELECT * FROM goals WHERE owner_user_id IS NULL ORDER BY created_at DESC`
    : await sql`SELECT * FROM goals WHERE owner_user_id = ${me.id} ORDER BY created_at DESC`

  const latestAsset = isJoint
    ? await sql`SELECT * FROM assets WHERE owner_user_id IS NULL ORDER BY month DESC LIMIT 1`
    : await sql`SELECT * FROM assets WHERE owner_user_id = ${me.id} ORDER BY month DESC LIMIT 1`

  const totalAssets = latestAsset[0]
    ? Number(latestAsset[0].savings_balance) + Number(latestAsset[0].investment_balance)
    : 0

  return NextResponse.json({ goals, totalAssets })
}

export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { name, target_amount, deadline, card_type } = await req.json()
  if (!name || !target_amount) return NextResponse.json({ error: "name, target_amount は必須です" }, { status: 400 })

  const result = await sql`
    INSERT INTO goals (name, target_amount, deadline, owner_user_id)
    VALUES (${name}, ${Number(target_amount)}, ${deadline ?? null},
            ${card_type === "joint" ? null : me.id})
    RETURNING *
  `
  return NextResponse.json({ goal: result[0] })
}

export async function DELETE(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 })

  const deleted = await sql`
    DELETE FROM goals
    WHERE id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    RETURNING id
  `
  if (deleted.length === 0) return forbidden()
  return NextResponse.json({ success: true })
}
