import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized, forbidden } from "@/lib/session"

/**
 * 特定の年に発生するライフイベント。
 * repeat_years で「その年から何年続くか」を表す（大学4年間 = 4）。
 * amount は現在の物価での金額。inflate=true なら物価上昇率を掛けて将来価値に換算する。
 * まとめて登録できるよう、配列（events）での一括POSTにも対応する。
 */
export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const b = await req.json()
  const owner = b.card_type === "self" ? me.id : null
  const list: Record<string, unknown>[] = Array.isArray(b.events) ? b.events : [b]

  const created = []
  for (const e of list) {
    if (!e.name || e.year == null) continue
    const [row] = await sql`
      INSERT INTO life_events
        (year, name, category, kind, amount, repeat_years, inflate, member_id, note, owner_user_id)
      VALUES (
        ${Number(e.year)},
        ${String(e.name).trim()},
        ${e.category ?? "その他"},
        ${e.kind === "income" ? "income" : "expense"},
        ${Math.round(Number(e.amount ?? 0))},
        ${Math.max(1, Number(e.repeat_years ?? 1))},
        ${e.inflate === false ? false : true},
        ${e.member_id ? Number(e.member_id) : null},
        ${e.note ?? ""},
        ${owner}
      )
      RETURNING *
    `
    created.push(row)
  }
  return NextResponse.json({ events: created, count: created.length })
}

export async function PATCH(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const b = await req.json()
  if (!b.id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

  const updated = await sql`
    UPDATE life_events SET
      year         = ${Number(b.year)},
      name         = ${String(b.name ?? "").trim()},
      category     = ${b.category ?? "その他"},
      kind         = ${b.kind === "income" ? "income" : "expense"},
      amount       = ${Math.round(Number(b.amount ?? 0))},
      repeat_years = ${Math.max(1, Number(b.repeat_years ?? 1))},
      inflate      = ${b.inflate === false ? false : true},
      member_id    = ${b.member_id ? Number(b.member_id) : null},
      note         = ${b.note ?? ""}
    WHERE id = ${Number(b.id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    RETURNING *
  `
  if (updated.length === 0) return forbidden()
  return NextResponse.json({ event: updated[0] })
}

export async function DELETE(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const id = new URL(req.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

  const deleted = await sql`
    DELETE FROM life_events
    WHERE id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    RETURNING id
  `
  if (deleted.length === 0) return forbidden()
  return NextResponse.json({ success: true })
}
