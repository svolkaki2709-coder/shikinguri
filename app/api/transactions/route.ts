import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized, forbidden } from "@/lib/session"

/** 自分が使える口座か検証し、その口座のスコープ（owner_user_id）を返す。 */
async function resolveAccount(accountId: number, userId: number) {
  const rows = await sql<{ id: number; owner_user_id: number | null }>`
    SELECT id, owner_user_id FROM cards
    WHERE id = ${accountId} AND (owner_user_id IS NULL OR owner_user_id = ${userId})
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { date, card_id, category, amount, memo, source } = await req.json()
  if (!date || !card_id || !category || !amount) {
    return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 })
  }

  // 明細のスコープは口座に従う（共同口座の支出は共同、個人口座の支出は個人）
  const account = await resolveAccount(Number(card_id), me.id)
  if (!account) return forbidden()

  const result = await sql`
    INSERT INTO transactions (date, card_id, category, amount, memo, source, owner_user_id)
    VALUES (${date}, ${Number(card_id)}, ${category}, ${Number(amount)}, ${memo ?? ""},
            ${source ?? "manual"}, ${account.owner_user_id})
    RETURNING *
  `
  return NextResponse.json({ transaction: result[0] })
}

export async function PATCH(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { id, date, card_id, category, amount, memo } = await req.json()
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

  // 全フィールド更新（フル編集）
  if (date !== undefined && card_id !== undefined && category !== undefined && amount !== undefined) {
    // 口座が変わるとスコープも変わるため、移動先口座の権限を確認して owner を付け替える
    const account = await resolveAccount(Number(card_id), me.id)
    if (!account) return forbidden()

    const updated = await sql`
      UPDATE transactions
      SET date = ${date}, card_id = ${Number(card_id)}, category = ${category},
          amount = ${Number(amount)}, memo = ${memo ?? ""},
          owner_user_id = ${account.owner_user_id}
      WHERE id = ${Number(id)}
        AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
      RETURNING id
    `
    if (updated.length === 0) return forbidden()
  } else if (category !== undefined) {
    // カテゴリのみ更新（後方互換）
    const updated = await sql`
      UPDATE transactions SET category = ${category}
      WHERE id = ${Number(id)}
        AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
      RETURNING id
    `
    if (updated.length === 0) return forbidden()
  } else {
    return NextResponse.json({ error: "更新するフィールドがありません" }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 })

  const deleted = await sql`
    DELETE FROM transactions
    WHERE id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    RETURNING id
  `
  if (deleted.length === 0) return forbidden()
  return NextResponse.json({ success: true })
}
