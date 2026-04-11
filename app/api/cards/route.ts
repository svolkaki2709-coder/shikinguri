import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const cards = await sql`SELECT * FROM cards ORDER BY sort_order`
  return NextResponse.json({ cards })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name, card_type, color, sort_order } = await req.json()
  if (!name) return NextResponse.json({ error: "name は必須です" }, { status: 400 })

  // 既存チェック
  const existing = await sql`SELECT * FROM cards WHERE name = ${name} LIMIT 1`
  if (existing.length > 0) {
    return NextResponse.json({ card: existing[0] })
  }

  const result = await sql`
    INSERT INTO cards (name, card_type, color, sort_order)
    VALUES (${name}, ${card_type ?? "self"}, ${color ?? "#6b7280"}, ${sort_order ?? 99})
    RETURNING *
  `
  return NextResponse.json({ card: result[0] })
}
