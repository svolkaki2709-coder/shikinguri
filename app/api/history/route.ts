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
  const keywordLike = keyword ? `%${keyword}%` : null

  const rows = await sql`
    SELECT id, date::text, category, amount, memo, type
    FROM transactions
    WHERE (${month}::text IS NULL OR TO_CHAR(date, 'YYYY-MM') = ${month})
      AND (${category}::text IS NULL OR category = ${category})
      AND (${keywordLike}::text IS NULL
           OR memo ILIKE ${keywordLike}
           OR category ILIKE ${keywordLike})
    ORDER BY date DESC, id DESC
    LIMIT 300
  `
  return NextResponse.json({ transactions: rows })
}
