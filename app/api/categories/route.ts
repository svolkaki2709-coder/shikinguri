import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rows = await sql`SELECT name FROM categories ORDER BY sort_order, name`
  return NextResponse.json({ categories: rows.map((r) => r.name) })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name } = await req.json()
  if (!name) return NextResponse.json({ error: "名前が必要です" }, { status: 400 })

  await sql`INSERT INTO categories (name) VALUES (${name}) ON CONFLICT DO NOTHING`
  return NextResponse.json({ success: true })
}
