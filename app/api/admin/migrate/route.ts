import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql, initDb } from "@/lib/db"

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-migration-secret")
  const validSecret = secret && secret === process.env.MIGRATION_SECRET
  if (!validSecret) {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { action, data } = body

  if (action === "init") {
    await initDb()
    return NextResponse.json({ success: true, message: "テーブル作成完了" })
  }

  if (action === "migrate_transactions_add_card") {
    // 既存transactionsにcard_idカラムを追加（冪等）
    await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS card_id INT REFERENCES cards(id) ON DELETE SET NULL`
    await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manual'`
    // type列をcard_idで置き換えるため、既存データを変動費カードに割り当て
    const cards = await sql<{ id: number; name: string }>`SELECT id, name FROM cards`
    const variableCard = cards.find(c => c.name === "変動費")
    if (variableCard) {
      await sql`UPDATE transactions SET card_id = ${variableCard.id} WHERE card_id IS NULL`
    }
    return NextResponse.json({ success: true })
  }

  if (action === "import_categories") {
    for (const name of data as string[]) {
      if (name) {
        await sql`INSERT INTO categories (name) VALUES (${name}) ON CONFLICT DO NOTHING`
      }
    }
    return NextResponse.json({ success: true, count: data.length })
  }

  if (action === "import_transactions") {
    let count = 0
    for (const t of data as { date: string; card_id?: number; category: string; amount: number; memo: string }[]) {
      if (t.date && t.amount) {
        await sql`
          INSERT INTO transactions (date, card_id, category, amount, memo, source)
          VALUES (${t.date}, ${t.card_id ?? null}, ${t.category ?? "未分類"}, ${t.amount}, ${t.memo ?? ""}, 'manual')
        `
        count++
      }
    }
    return NextResponse.json({ success: true, count })
  }

  if (action === "import_budgets") {
    for (const b of data as { category: string; amount: number; card_type: string }[]) {
      await sql`
        INSERT INTO budgets (category, amount, card_type)
        VALUES (${b.category}, ${b.amount}, ${b.card_type ?? "self"})
        ON CONFLICT (category, card_type) DO UPDATE SET amount = EXCLUDED.amount
      `
    }
    return NextResponse.json({ success: true, count: data.length })
  }

  return NextResponse.json({ error: "不明なaction" }, { status: 400 })
}
