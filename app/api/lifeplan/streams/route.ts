import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized, forbidden } from "@/lib/session"

/**
 * 毎年継続的に発生する収入・支出の登録。
 * start_year / end_year が NULL のときは試算期間の全期間が対象。
 * growth_rate が NULL のときは、支出なら物価上昇率・収入なら0%を適用する（クライアント側で解決）。
 */
export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const b = await req.json()
  if (!b.name) return NextResponse.json({ error: "name は必須です" }, { status: 400 })
  const owner = b.card_type === "self" ? me.id : null

  const [row] = await sql`
    INSERT INTO life_streams
      (kind, name, annual_amount, start_year, end_year, growth_rate, note, owner_user_id)
    VALUES (
      ${b.kind === "income" ? "income" : "expense"},
      ${String(b.name).trim()},
      ${Math.round(Number(b.annual_amount ?? 0))},
      ${b.start_year != null && b.start_year !== "" ? Number(b.start_year) : null},
      ${b.end_year != null && b.end_year !== "" ? Number(b.end_year) : null},
      ${b.growth_rate != null && b.growth_rate !== "" ? Number(b.growth_rate) : null},
      ${b.note ?? ""},
      ${owner}
    )
    RETURNING *
  `
  return NextResponse.json({ stream: row })
}

export async function PATCH(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const b = await req.json()
  if (!b.id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

  // 期間・上昇率は「未設定（NULL）」に戻せる必要があるため、
  // クライアントは常に全項目を送る前提でそのまま上書きする。
  const num = (v: unknown) => (v === "" || v == null ? null : Number(v))

  const updated = await sql`
    UPDATE life_streams SET
      name          = ${String(b.name ?? "").trim()},
      annual_amount = ${Math.round(Number(b.annual_amount ?? 0))},
      start_year    = ${num(b.start_year)},
      end_year      = ${num(b.end_year)},
      growth_rate   = ${num(b.growth_rate)},
      note          = ${b.note ?? ""}
    WHERE id = ${Number(b.id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    RETURNING *
  `
  if (updated.length === 0) return forbidden()
  return NextResponse.json({ stream: updated[0] })
}

export async function DELETE(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const id = new URL(req.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

  const deleted = await sql`
    DELETE FROM life_streams
    WHERE id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    RETURNING id
  `
  if (deleted.length === 0) return forbidden()
  return NextResponse.json({ success: true })
}
