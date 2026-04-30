import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const keyword = searchParams.get("keyword") || null
  const category = searchParams.get("category") || null
  const month = searchParams.get("month") || null
  const cardType = searchParams.get("card_type") || null  // "self" | "joint" | null
  const keywordLike = keyword ? `%${keyword}%` : null

  const rows = await sql`
    SELECT
      t.id,
      t.date::text,
      t.category,
      t.amount,
      t.memo,
      t.source,
      c.id AS card_id,
      c.name AS card_name,
      c.card_type,
      c.color
    FROM transactions t
    LEFT JOIN cards c ON t.card_id = c.id
    WHERE (${month}::text IS NULL OR TO_CHAR(t.date, 'YYYY-MM') = ${month})
      AND (${category}::text IS NULL OR t.category = ${category})
      AND (${cardType}::text IS NULL OR c.card_type = ${cardType})
      AND (${keywordLike}::text IS NULL
           OR t.memo ILIKE ${keywordLike}
           OR t.category ILIKE ${keywordLike})
    ORDER BY t.date DESC, t.id DESC
    LIMIT 500
  `
  return NextResponse.json({ transactions: rows })
}
