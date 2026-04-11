import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"
import { STORE_CATEGORY_MAP } from "@/lib/categoryData"

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS store_category_rules (
      id SERIAL PRIMARY KEY,
      keyword TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(keyword)
    )
  `
  // 初回のみ categoryData.ts のハードコード済みデータをシード
  const count = await sql`SELECT COUNT(*) as cnt FROM store_category_rules`
  if (Number(count[0].cnt) === 0) {
    for (const [keyword, category] of Object.entries(STORE_CATEGORY_MAP)) {
      await sql`
        INSERT INTO store_category_rules (keyword, category)
        VALUES (${keyword}, ${category})
        ON CONFLICT (keyword) DO NOTHING
      `
    }
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  await ensureTable()

  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q") ?? ""

  const rows = q
    ? await sql`
        SELECT id, keyword, category FROM store_category_rules
        WHERE keyword ILIKE ${"%" + q + "%"} OR category ILIKE ${"%" + q + "%"}
        ORDER BY keyword LIMIT 100
      `
    : await sql`
        SELECT id, keyword, category FROM store_category_rules
        ORDER BY keyword LIMIT 300
      `

  return NextResponse.json({ rules: rows })
}

// キーワードにマッチする未分類トランザクションを遡って更新
async function applyRuleToExisting(keyword: string, category: string) {
  const k = keyword.trim()
  await sql`
    UPDATE transactions
    SET category = ${category}
    WHERE category = '未分類'
      AND memo IS NOT NULL
      AND memo != ''
      AND (
        memo = ${k}
        OR POSITION(${k} IN memo) > 0
        OR POSITION(memo IN ${k}) > 0
      )
  `
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  await ensureTable()

  const { keyword, category } = await req.json()
  if (!keyword || !category) return NextResponse.json({ error: "keyword と category は必須です" }, { status: 400 })

  await sql`
    INSERT INTO store_category_rules (keyword, category)
    VALUES (${keyword.trim()}, ${category})
    ON CONFLICT (keyword) DO UPDATE SET category = ${category}
  `
  await applyRuleToExisting(keyword, category)
  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id, keyword, category } = await req.json()
  if (!id || !keyword || !category) return NextResponse.json({ error: "id, keyword, category は必須です" }, { status: 400 })

  await sql`
    UPDATE store_category_rules SET keyword = ${keyword.trim()}, category = ${category}
    WHERE id = ${Number(id)}
  `
  await applyRuleToExisting(keyword, category)
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

  await sql`DELETE FROM store_category_rules WHERE id = ${Number(id)}`
  return NextResponse.json({ success: true })
}
