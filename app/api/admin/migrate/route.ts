import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql, initDb } from "@/lib/db"

// このAPIはデータ移行用。移行完了後は不要になる。
export async function POST(req: NextRequest) {
  // シークレットキーまたはセッション認証のどちらかを許可
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

  if (action === "import_categories") {
    // data: string[]
    for (const name of data as string[]) {
      if (name) {
        await sql`INSERT INTO categories (name) VALUES (${name}) ON CONFLICT DO NOTHING`
      }
    }
    return NextResponse.json({ success: true, count: data.length })
  }

  if (action === "import_transactions") {
    // data: { date, category, amount, memo, type }[]
    let count = 0
    for (const t of data as { date: string; category: string; amount: number; memo: string; type: string }[]) {
      if (t.date && t.category && t.amount) {
        await sql`
          INSERT INTO transactions (date, category, amount, memo, type)
          VALUES (${t.date}, ${t.category}, ${t.amount}, ${t.memo ?? ""}, ${t.type ?? "self"})
        `
        count++
      }
    }
    return NextResponse.json({ success: true, count })
  }

  if (action === "import_budgets") {
    // data: { category, amount, type }[]
    for (const b of data as { category: string; amount: number; type: string }[]) {
      await sql`
        INSERT INTO budgets (category, amount, type)
        VALUES (${b.category}, ${b.amount}, ${b.type ?? "self"})
        ON CONFLICT (category, type) DO UPDATE SET amount = EXCLUDED.amount
      `
    }
    return NextResponse.json({ success: true, count: data.length })
  }

  return NextResponse.json({ error: "不明なaction" }, { status: 400 })
}
