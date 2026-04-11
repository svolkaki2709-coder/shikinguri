import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const goals = await sql`SELECT * FROM goals ORDER BY created_at DESC`
  const latestAsset = await sql`SELECT * FROM assets ORDER BY month DESC LIMIT 1`
  const totalAssets = latestAsset[0]
    ? Number(latestAsset[0].savings_balance) + Number(latestAsset[0].investment_balance)
    : 0

  return NextResponse.json({ goals, totalAssets })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name, target_amount, deadline } = await req.json()
  if (!name || !target_amount) return NextResponse.json({ error: "name, target_amount は必須です" }, { status: 400 })

  const result = await sql`
    INSERT INTO goals (name, target_amount, deadline)
    VALUES (${name}, ${Number(target_amount)}, ${deadline ?? null})
    RETURNING *
  `
  return NextResponse.json({ goal: result[0] })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 })

  await sql`DELETE FROM goals WHERE id = ${Number(id)}`
  return NextResponse.json({ success: true })
}
