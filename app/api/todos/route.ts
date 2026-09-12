import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized, forbidden } from "@/lib/session"

/**
 * 2人で進める手続き・タスク。
 *
 * 既定は共同（owner_user_id IS NULL）。card_type=self を付けたときだけ個人のリストになる。
 * テンプレートからの一括登録があるので POST は配列にも対応する。
 */
export async function GET(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const isJoint = new URL(req.url).searchParams.get("card_type") !== "self"

  const todos = isJoint
    ? await sql`
        SELECT id, title, category, detail, assignee, due_date::text AS due_date,
               done, done_at, template_key, sort_order
        FROM todos WHERE owner_user_id IS NULL
        ORDER BY done, due_date NULLS LAST, sort_order, id
      `
    : await sql`
        SELECT id, title, category, detail, assignee, due_date::text AS due_date,
               done, done_at, template_key, sort_order
        FROM todos WHERE owner_user_id = ${me.id}
        ORDER BY done, due_date NULLS LAST, sort_order, id
      `

  return NextResponse.json({ todos, scope: isJoint ? "joint" : "self" })
}

export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const b = await req.json()
  const owner = b.card_type === "self" ? me.id : null
  const list: Record<string, unknown>[] = Array.isArray(b.todos) ? b.todos : [b]

  // 同じテンプレートを二重に取り込まないよう、既存の template_key を先に拾っておく
  const existingRows = owner === null
    ? await sql<{ template_key: string }>`SELECT template_key FROM todos WHERE owner_user_id IS NULL AND template_key IS NOT NULL`
    : await sql<{ template_key: string }>`SELECT template_key FROM todos WHERE owner_user_id = ${owner} AND template_key IS NOT NULL`
  const existing = new Set(existingRows.map(r => r.template_key))

  const created = []
  let skipped = 0
  for (const t of list) {
    const title = String(t.title ?? "").trim()
    if (!title) continue
    const key = t.template_key ? String(t.template_key) : null
    if (key && existing.has(key)) { skipped++; continue }

    const [row] = await sql`
      INSERT INTO todos (title, category, detail, assignee, due_date, template_key, sort_order, owner_user_id)
      VALUES (
        ${title},
        ${String(t.category ?? "その他")},
        ${String(t.detail ?? "")},
        ${String(t.assignee ?? "")},
        ${t.due_date ? String(t.due_date) : null},
        ${key},
        ${Number(t.sort_order ?? 0)},
        ${owner}
      )
      RETURNING id, title, category, detail, assignee, due_date::text AS due_date,
                done, done_at, template_key, sort_order
    `
    created.push(row)
    if (key) existing.add(key)
  }
  return NextResponse.json({ todos: created, count: created.length, skipped })
}

export async function PATCH(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const b = await req.json()
  if (!b.id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

  // 完了チェックだけを切り替えるケースが多いので、done だけの更新を分けている
  if (b.done !== undefined && b.title === undefined) {
    const done = b.done === true
    const updated = await sql`
      UPDATE todos SET done = ${done}, done_at = ${done ? new Date().toISOString() : null}
      WHERE id = ${Number(b.id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
      RETURNING id, title, category, detail, assignee, due_date::text AS due_date,
                done, done_at, template_key, sort_order
    `
    if (updated.length === 0) return forbidden()
    return NextResponse.json({ todo: updated[0] })
  }

  const updated = await sql`
    UPDATE todos SET
      title    = ${String(b.title ?? "").trim()},
      category = ${String(b.category ?? "その他")},
      detail   = ${String(b.detail ?? "")},
      assignee = ${String(b.assignee ?? "")},
      due_date = ${b.due_date ? String(b.due_date) : null}
    WHERE id = ${Number(b.id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    RETURNING id, title, category, detail, assignee, due_date::text AS due_date,
              done, done_at, template_key, sort_order
  `
  if (updated.length === 0) return forbidden()
  return NextResponse.json({ todo: updated[0] })
}

export async function DELETE(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")

  // 「完了したものをまとめて消す」用
  if (searchParams.get("done") === "1") {
    const isJoint = searchParams.get("card_type") !== "self"
    const deleted = isJoint
      ? await sql`DELETE FROM todos WHERE owner_user_id IS NULL AND done = TRUE RETURNING id`
      : await sql`DELETE FROM todos WHERE owner_user_id = ${me.id} AND done = TRUE RETURNING id`
    return NextResponse.json({ success: true, count: deleted.length })
  }

  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })
  const deleted = await sql`
    DELETE FROM todos
    WHERE id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    RETURNING id
  `
  if (deleted.length === 0) return forbidden()
  return NextResponse.json({ success: true })
}
