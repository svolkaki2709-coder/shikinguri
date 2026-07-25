import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized, forbidden } from "@/lib/session"

export async function GET(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q") ?? ""

  const rows = q
    ? await sql`
        SELECT id, keyword, category FROM store_category_rules
        WHERE (owner_user_id IS NULL OR owner_user_id = ${me.id})
          AND (keyword ILIKE ${"%" + q + "%"} OR category ILIKE ${"%" + q + "%"})
        ORDER BY keyword LIMIT 100
      `
    : await sql`
        SELECT id, keyword, category FROM store_category_rules
        WHERE (owner_user_id IS NULL OR owner_user_id = ${me.id})
        ORDER BY keyword LIMIT 300
      `

  return NextResponse.json({ rules: rows })
}

/**
 * キーワードにマッチする未分類明細を遡って振り分ける。
 * 「メモがキーワードを含む」場合のみ対象。以前は逆方向の包含
 * （キーワードがメモを含む）も見ていたため、短いメモが無関係な
 * ルールで巻き込まれていた。
 */
async function applyRuleToExisting(keyword: string, category: string, owner: number | null) {
  const k = keyword.trim()
  if (!k) return
  // ルールと同じスコープの明細だけを書き換える。
  // 個人ルールが共同明細（相手にも見えるデータ）を勝手に振り分けないようにする。
  await sql`
    UPDATE transactions
    SET category = ${category}
    WHERE category = '未分類'
      AND memo IS NOT NULL AND memo <> ''
      AND POSITION(${k} IN memo) > 0
      AND COALESCE(owner_user_id, 0) = COALESCE(${owner}, 0)
  `
}

export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { keyword, category, card_type } = await req.json()
  if (!keyword || !category) {
    return NextResponse.json({ error: "keyword と category は必須です" }, { status: 400 })
  }
  const k = String(keyword).trim()
  const owner = card_type === "joint" ? null : me.id

  const existing = owner === null
    ? await sql<{ id: number }>`SELECT id FROM store_category_rules WHERE keyword = ${k} AND owner_user_id IS NULL LIMIT 1`
    : await sql<{ id: number }>`SELECT id FROM store_category_rules WHERE keyword = ${k} AND owner_user_id = ${owner} LIMIT 1`

  if (existing.length > 0) {
    await sql`UPDATE store_category_rules SET category = ${category} WHERE id = ${existing[0].id}`
  } else {
    await sql`
      INSERT INTO store_category_rules (keyword, category, owner_user_id)
      VALUES (${k}, ${category}, ${owner})
    `
  }
  await applyRuleToExisting(k, category, owner)
  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { id, keyword, category } = await req.json()
  if (!id || !keyword || !category) {
    return NextResponse.json({ error: "id, keyword, category は必須です" }, { status: 400 })
  }

  const updated = await sql<{ id: number; owner_user_id: number | null }>`
    UPDATE store_category_rules SET keyword = ${String(keyword).trim()}, category = ${category}
    WHERE id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    RETURNING id, owner_user_id
  `
  if (updated.length === 0) return forbidden()
  await applyRuleToExisting(String(keyword), category, updated[0].owner_user_id)
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

  const deleted = await sql`
    DELETE FROM store_category_rules
    WHERE id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    RETURNING id
  `
  if (deleted.length === 0) return forbidden()
  return NextResponse.json({ success: true })
}
