import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // 未分類かつメモがある明細のメモ値を重複排除して取得（件数多い順）
  const rows = await sql`
    SELECT memo, COUNT(*) as cnt, MAX(date) as last_date, card_type
    FROM (
      SELECT t.memo, t.date, c.card_type
      FROM transactions t
      JOIN cards c ON t.card_id = c.id
      WHERE t.category = '未分類'
        AND t.memo IS NOT NULL
        AND t.memo != ''
    ) sub
    GROUP BY memo, card_type
    ORDER BY cnt DESC, last_date DESC
    LIMIT 100
  `

  return NextResponse.json({
    memos: rows.map(r => ({
      memo: r.memo as string,
      count: Number(r.cnt),
      card_type: r.card_type as string,
    }))
  })
}
