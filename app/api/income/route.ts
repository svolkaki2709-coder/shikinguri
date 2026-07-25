import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized, forbidden, ownerFor } from "@/lib/session"

export async function GET(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const now = new Date()
  const month =
    searchParams.get("month") ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const cardType = searchParams.get("card_type") ?? null

  const rows = cardType
    ? await sql`
        SELECT id, date::text, amount, category, memo, card_type, account_id
        FROM incomes
        WHERE TO_CHAR(date, 'YYYY-MM') = ${month} AND card_type = ${cardType}
          AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
        ORDER BY date DESC
      `
    : await sql`
        SELECT id, date::text, amount, category, memo, card_type, account_id
        FROM incomes
        WHERE TO_CHAR(date, 'YYYY-MM') = ${month}
          AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
        ORDER BY date DESC
      `

  const total = rows.reduce((s, r) => s + Number(r.amount), 0)
  return NextResponse.json({ incomes: rows, total, month })
}

export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { date, amount, category, memo, card_type, account_id } = await req.json()
  if (!date || !amount) return NextResponse.json({ error: "date, amount は必須です" }, { status: 400 })

  const ct = card_type ?? "self"

  // 口座を指定する場合は権限を確認し、スコープを口座に合わせる
  let ownerUserId = ownerFor(ct, me.id)
  if (account_id != null) {
    const [account] = await sql<{ owner_user_id: number | null }>`
      SELECT owner_user_id FROM cards
      WHERE id = ${Number(account_id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
      LIMIT 1
    `
    if (!account) return forbidden()
    ownerUserId = account.owner_user_id
  }

  const result = await sql`
    INSERT INTO incomes (date, amount, category, memo, card_type, account_id, owner_user_id)
    VALUES (${date}, ${Number(amount)}, ${category ?? "給与"}, ${memo ?? ""}, ${ct},
            ${account_id != null ? Number(account_id) : null}, ${ownerUserId})
    RETURNING *
  `
  return NextResponse.json({ income: result[0] })
}

export async function PUT(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

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
      AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    RETURNING *
  `
  if (result.length === 0) return forbidden()
  return NextResponse.json({ income: result[0] })
}

export async function DELETE(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 })

  const deleted = await sql`
    DELETE FROM incomes
    WHERE id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    RETURNING id
  `
  if (deleted.length === 0) return forbidden()
  return NextResponse.json({ success: true })
}
