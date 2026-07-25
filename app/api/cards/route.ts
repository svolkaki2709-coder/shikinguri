import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized, forbidden, ownerFor } from "@/lib/session"

const KINDS = ["card", "bank", "cash", "emoney"] as const
type Kind = (typeof KINDS)[number]

export async function GET(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const includeInactive = searchParams.get("include_inactive") === "true"

  const cards = includeInactive
    ? await sql`
        SELECT * FROM cards
        WHERE (owner_user_id IS NULL OR owner_user_id = ${me.id})
        ORDER BY sort_order, id
      `
    : await sql`
        SELECT * FROM cards
        WHERE (owner_user_id IS NULL OR owner_user_id = ${me.id}) AND active = TRUE
        ORDER BY sort_order, id
      `
  return NextResponse.json({ cards })
}

export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { name, card_type, color, sort_order, kind, institution } = await req.json()
  if (!name) return NextResponse.json({ error: "name は必須です" }, { status: 400 })

  const ct = card_type === "joint" ? "joint" : "self"
  const owner = ownerFor(ct, me.id)
  const k: Kind = KINDS.includes(kind) ? kind : "card"

  // 同一スコープ内での重複チェック（個人と共同は別扱いなので同名可）
  const existing = owner === null
    ? await sql`SELECT * FROM cards WHERE name = ${name} AND card_type = ${ct} AND owner_user_id IS NULL LIMIT 1`
    : await sql`SELECT * FROM cards WHERE name = ${name} AND card_type = ${ct} AND owner_user_id = ${owner} LIMIT 1`
  if (existing.length > 0) {
    return NextResponse.json({ card: existing[0] })
  }

  const result = await sql`
    INSERT INTO cards (name, card_type, color, sort_order, kind, institution, owner_user_id)
    VALUES (${name}, ${ct}, ${color ?? "#6b7280"}, ${sort_order ?? 99}, ${k},
            ${institution ?? null}, ${owner})
    RETURNING *
  `
  return NextResponse.json({ card: result[0] })
}

export async function PATCH(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  try {
    const body = await req.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

    // 自分が触れる口座かを先に確認する
    const [target] = await sql<{ card_type: string; owner_user_id: number | null }>`
      SELECT card_type, owner_user_id FROM cards
      WHERE id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
      LIMIT 1
    `
    if (!target) return forbidden()

    // 並び替え（複数件一括）
    if (Array.isArray(body.order)) {
      for (const [i, cardId] of body.order.entries()) {
        await sql`
          UPDATE cards SET sort_order = ${i}
          WHERE id = ${Number(cardId)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
        `
      }
      return NextResponse.json({ success: true })
    }

    // 属性更新（未指定の項目は現状維持）
    const nextName = typeof body.name === "string" ? body.name.trim() : null
    if (nextName !== null && nextName === "") {
      return NextResponse.json({ error: "name は必須です" }, { status: 400 })
    }
    if (nextName) {
      const dup = target.owner_user_id === null
        ? await sql`SELECT id FROM cards WHERE name = ${nextName} AND card_type = ${target.card_type} AND owner_user_id IS NULL AND id != ${Number(id)} LIMIT 1`
        : await sql`SELECT id FROM cards WHERE name = ${nextName} AND card_type = ${target.card_type} AND owner_user_id = ${target.owner_user_id} AND id != ${Number(id)} LIMIT 1`
      if (dup.length > 0) {
        return NextResponse.json({ error: "同じ区分に同じ名前の口座が既に存在します" }, { status: 400 })
      }
    }

    const nextKind = KINDS.includes(body.kind) ? (body.kind as Kind) : null

    const result = await sql`
      UPDATE cards SET
        name        = COALESCE(${nextName}, name),
        has_csv     = COALESCE(${typeof body.has_csv === "boolean" ? body.has_csv : null}, has_csv),
        color       = COALESCE(${body.color ?? null}, color),
        kind        = COALESCE(${nextKind}, kind),
        institution = COALESCE(${body.institution ?? null}, institution),
        active      = COALESCE(${typeof body.active === "boolean" ? body.active : null}, active)
      WHERE id = ${Number(id)}
        AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
      RETURNING *
    `
    if (result.length === 0) return forbidden()
    return NextResponse.json({ card: result[0] })
  } catch (e: unknown) {
    // Postgresの生エラー（制約名や列名）は返さない
    console.error("[PATCH /api/cards]", e)
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  const reassignId = searchParams.get("reassign_to")
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

  const [target] = await sql<{ owner_user_id: number | null }>`
    SELECT owner_user_id FROM cards
    WHERE id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    LIMIT 1
  `
  if (!target) return forbidden()

  if (reassignId) {
    // 付け替え先も自分が触れる口座で、かつ同じスコープであること
    const [dest] = await sql<{ owner_user_id: number | null }>`
      SELECT owner_user_id FROM cards
      WHERE id = ${Number(reassignId)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
      LIMIT 1
    `
    if (!dest) return forbidden()
    if ((dest.owner_user_id ?? null) !== (target.owner_user_id ?? null)) {
      return NextResponse.json(
        { error: "個人と共同をまたいで明細を移すことはできません" }, { status: 400 }
      )
    }
    await sql`
      UPDATE transactions SET card_id = ${Number(reassignId)}
      WHERE card_id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    `
    await sql`
      UPDATE recurring_expenses SET card_id = ${Number(reassignId)}
      WHERE card_id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    `
    await sql`
      UPDATE incomes SET account_id = ${Number(reassignId)}
      WHERE account_id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    `
  }

  await sql`
    DELETE FROM cards
    WHERE id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
  `
  return NextResponse.json({ success: true })
}
