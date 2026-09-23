import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized, forbidden } from "@/lib/session"

/**
 * 口座マップ。自分の個人口座と共同口座、その間の流れをまとめて返す。
 * 相手の個人口座は見えない（スコープ規約どおり）。
 */
const KINDS = ["income", "bank", "securities", "card", "wallet", "cash"] as const
const FLOW_KINDS = ["salary", "transfer", "debit", "invest"] as const

export async function GET() {
  const me = await requireUser()
  if (!me) return unauthorized()

  const [accounts, flows] = await Promise.all([
    sql`
      SELECT id, name, kind, institution, purpose, card_id, sort_order,
             CASE WHEN owner_user_id IS NULL THEN 'joint' ELSE 'self' END AS scope
      FROM money_accounts
      WHERE owner_user_id IS NULL OR owner_user_id = ${me.id}
      ORDER BY sort_order, id
    `,
    sql`
      SELECT f.id, f.from_id, f.to_id, f.kind, f.amount, f.day_of_month, f.memo
      FROM money_flows f
      WHERE (f.owner_user_id IS NULL OR f.owner_user_id = ${me.id})
        AND EXISTS (SELECT 1 FROM money_accounts a WHERE a.id = f.from_id AND (a.owner_user_id IS NULL OR a.owner_user_id = ${me.id}))
        AND EXISTS (SELECT 1 FROM money_accounts a WHERE a.id = f.to_id AND (a.owner_user_id IS NULL OR a.owner_user_id = ${me.id}))
      ORDER BY f.id
    `,
  ])
  return NextResponse.json({ accounts, flows })
}

/** 自分が触れる口座か（個人なら自分のもの、または共同） */
async function visibleAccount(id: number, meId: number) {
  const [a] = await sql<{ id: number; owner_user_id: number | null }>`
    SELECT id, owner_user_id FROM money_accounts
    WHERE id = ${id} AND (owner_user_id IS NULL OR owner_user_id = ${meId}) LIMIT 1
  `
  return a ?? null
}

export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()
  const b = await req.json()

  // 家計簿の口座からまとめて取り込む
  if (b.action === "import_cards") {
    const cards = await sql<{ id: number; name: string; kind: string; owner_user_id: number | null; institution: string | null }>`
      SELECT id, name, kind, owner_user_id, institution FROM cards
      WHERE active = TRUE AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    `
    const linked = new Set((await sql<{ card_id: number }>`
      SELECT card_id FROM money_accounts WHERE card_id IS NOT NULL
        AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    `).map(r => r.card_id))
    let added = 0
    for (const c of cards) {
      if (linked.has(c.id)) continue
      const kind = c.kind === "bank" ? "bank" : c.kind === "cash" ? "cash" : "card"
      await sql`
        INSERT INTO money_accounts (name, kind, institution, card_id, owner_user_id)
        VALUES (${c.name}, ${kind}, ${c.institution ?? ""}, ${c.id}, ${c.owner_user_id})
      `
      added++
    }
    return NextResponse.json({ success: true, added })
  }

  // 流れの追加
  if (b.type === "flow") {
    const from = await visibleAccount(Number(b.from_id), me.id)
    const to = await visibleAccount(Number(b.to_id), me.id)
    if (!from || !to) return forbidden()
    // どちらかが共同口座なら、流れも共同として保存する（相手にも見えるべき情報）
    const owner = from.owner_user_id === null || to.owner_user_id === null ? null : me.id
    const kind = FLOW_KINDS.includes(b.kind) ? b.kind : "transfer"
    const [row] = await sql`
      INSERT INTO money_flows (from_id, to_id, kind, amount, day_of_month, memo, owner_user_id)
      VALUES (${from.id}, ${to.id}, ${kind},
              ${b.amount ? Math.round(Number(b.amount)) : null},
              ${b.day_of_month ? Number(b.day_of_month) : null},
              ${String(b.memo ?? "")}, ${owner})
      RETURNING id
    `
    return NextResponse.json({ success: true, id: row.id })
  }

  // 口座の追加
  const name = String(b.name ?? "").trim()
  if (!name) return NextResponse.json({ error: "名前は必須です" }, { status: 400 })
  const kind = KINDS.includes(b.kind) ? b.kind : "bank"
  const owner = b.scope === "joint" ? null : me.id
  const [row] = await sql`
    INSERT INTO money_accounts (name, kind, institution, purpose, owner_user_id)
    VALUES (${name}, ${kind}, ${String(b.institution ?? "")}, ${String(b.purpose ?? "")}, ${owner})
    RETURNING id
  `
  return NextResponse.json({ success: true, id: row.id })
}

export async function PATCH(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()
  const b = await req.json()

  if (b.type === "flow") {
    const updated = await sql`
      UPDATE money_flows SET
        kind = ${FLOW_KINDS.includes(b.kind) ? b.kind : "transfer"},
        amount = ${b.amount ? Math.round(Number(b.amount)) : null},
        day_of_month = ${b.day_of_month ? Number(b.day_of_month) : null},
        memo = ${String(b.memo ?? "")}
      WHERE id = ${Number(b.id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
      RETURNING id
    `
    if (updated.length === 0) return forbidden()
    return NextResponse.json({ success: true })
  }

  const name = String(b.name ?? "").trim()
  if (!name) return NextResponse.json({ error: "名前は必須です" }, { status: 400 })
  const updated = await sql`
    UPDATE money_accounts SET
      name = ${name},
      kind = ${KINDS.includes(b.kind) ? b.kind : "bank"},
      institution = ${String(b.institution ?? "")},
      purpose = ${String(b.purpose ?? "")}
    WHERE id = ${Number(b.id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    RETURNING id
  `
  if (updated.length === 0) return forbidden()
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()
  const { searchParams } = new URL(req.url)
  const id = Number(searchParams.get("id"))
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

  const deleted = searchParams.get("type") === "flow"
    ? await sql`DELETE FROM money_flows WHERE id = ${id} AND (owner_user_id IS NULL OR owner_user_id = ${me.id}) RETURNING id`
    : await sql`DELETE FROM money_accounts WHERE id = ${id} AND (owner_user_id IS NULL OR owner_user_id = ${me.id}) RETURNING id`
  if (deleted.length === 0) return forbidden()
  return NextResponse.json({ success: true })
}
