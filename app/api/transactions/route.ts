import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { date, category, amount, memo, type } = await req.json()
  if (!date || !category || !amount) {
    return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 })
  }

  const rows = await sql`
    INSERT INTO transactions (date, category, amount, memo, type)
    VALUES (${date}, ${category}, ${Number(amount)}, ${memo ?? ""}, ${type ?? "self"})
    RETURNING id
  `
  return NextResponse.json({ success: true, id: rows[0].id })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await req.json()
  await sql`DELETE FROM transactions WHERE id = ${id}`
  return NextResponse.json({ success: true })
}
