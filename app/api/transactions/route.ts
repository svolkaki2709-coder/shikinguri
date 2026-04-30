import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { date, card_id, category, amount, memo } = await req.json()
  if (!date || !card_id || !category || !amount) {
    return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 })
  }

  const result = await sql`
    INSERT INTO transactions (date, card_id, category, amount, memo, source)
    VALUES (${date}, ${Number(card_id)}, ${category}, ${Number(amount)}, ${memo ?? ""}, 'manual')
    RETURNING *
  `
  return NextResponse.json({ transaction: result[0] })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id, date, card_id, category, amount, memo } = await req.json()
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

  // 全フィールド更新（フル編集）
  if (date !== undefined && card_id !== undefined && category !== undefined && amount !== undefined) {
    await sql`
      UPDATE transactions
      SET date = ${date}, card_id = ${Number(card_id)}, category = ${category},
          amount = ${Number(amount)}, memo = ${memo ?? ""}
      WHERE id = ${Number(id)}
    `
  } else if (category !== undefined) {
    // カテゴリのみ更新（後方互換）
    await sql`UPDATE transactions SET category = ${category} WHERE id = ${Number(id)}`
  } else {
    return NextResponse.json({ error: "更新するフィールドがありません" }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 })

  await sql`DELETE FROM transactions WHERE id = ${Number(id)}`
  return NextResponse.json({ success: true })
}
