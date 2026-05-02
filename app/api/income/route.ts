import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const now = new Date()
  const month =
    searchParams.get("month") ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  await sql`ALTER TABLE incomes ADD COLUMN IF NOT EXISTS card_type TEXT DEFAULT 'self'`

  const cardType = searchParams.get("card_type") ?? null

  const rows = cardType
    ? await sql`
        SELECT id, date::text, amount, category, memo, card_type
        FROM incomes
        WHERE TO_CHAR(date, 'YYYY-MM') = ${month} AND card_type = ${cardType}
        ORDER BY date DESC
      `
    : await sql`
        SELECT id, date::text, amount, category, memo, card_type
        FROM incomes
        WHERE TO_CHAR(date, 'YYYY-MM') = ${month}
        ORDER BY date DESC
      `

  const total = rows.reduce((s, r) => s + Number(r.amount), 0)
  return NextResponse.json({ incomes: rows, total, month })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { date, amount, category, memo, card_type } = await req.json()
  if (!date || !amount) return NextResponse.json({ error: "date, amount は必須です" }, { status: 400 })

  const result = await sql`
    INSERT INTO incomes (date, amount, category, memo, card_type)
    VALUES (${date}, ${Number(amount)}, ${category ?? "給与"}, ${memo ?? ""}, ${card_type ?? "self"})
    RETURNING *
  `
  return NextResponse.json({ income: result[0] })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id, amount, category, date, memo } = await req.json()
  if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 })

  const result = await sql`
    UPDATE incomes
    SET
      amount   = COALESCE(${amount != null ? Number(amount) : null}, amount),
      category = COALESCE(${category ?? null}, category),
      date     = COALESCE(${date ?? null}, date),
      memo     = COALESCE(${memo ?? null}, memo)
    WHERE id = ${Number(id)}
    RETURNING *
  `
  return NextResponse.json({ income: result[0] })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 })

  await sql`DELETE FROM incomes WHERE id = ${Number(id)}`
  return NextResponse.json({ success: true })
}
