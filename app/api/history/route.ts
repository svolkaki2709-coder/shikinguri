import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized } from "@/lib/session"

const LIMIT = 500

export async function GET(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const keyword = searchParams.get("keyword") || null
  const category = searchParams.get("category") || null
  const month = searchParams.get("month") || null
  const cardId = searchParams.get("card_id") || null
  // 期間指定（month より優先）
  const from = searchParams.get("from") || null
  const to = searchParams.get("to") || null
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
    WHERE (t.owner_user_id IS NULL OR t.owner_user_id = ${me.id})
      AND (${month}::text IS NULL OR TO_CHAR(t.date, 'YYYY-MM') = ${month})
      AND (${from}::text IS NULL OR t.date >= ${from}::date)
      AND (${to}::text IS NULL OR t.date <= ${to}::date)
      AND (${category}::text IS NULL OR t.category = ${category})
      AND (${cardId}::text IS NULL OR t.card_id = ${cardId}::int)
      AND (${keywordLike}::text IS NULL
           OR t.memo ILIKE ${keywordLike}
           OR t.category ILIKE ${keywordLike})

    UNION ALL

    SELECT
      i.id,
      i.date::text,
      i.category,
      i.amount,
      i.memo,
      'income' AS source,
      i.account_id AS card_id,
      ac.name AS card_name,
      i.card_type,
      ac.color
    FROM incomes i
    LEFT JOIN cards ac ON ac.id = i.account_id
    WHERE (i.owner_user_id IS NULL OR i.owner_user_id = ${me.id})
      AND (${month}::text IS NULL OR TO_CHAR(i.date, 'YYYY-MM') = ${month})
      AND (${from}::text IS NULL OR i.date >= ${from}::date)
      AND (${to}::text IS NULL OR i.date <= ${to}::date)
      AND (${category}::text IS NULL OR i.category = ${category})
      AND (${cardId}::text IS NULL OR i.account_id = ${cardId}::int)
      AND (${keywordLike}::text IS NULL
           OR i.memo ILIKE ${keywordLike}
           OR i.category ILIKE ${keywordLike})

    ORDER BY date DESC, id DESC
    LIMIT ${LIMIT + 1}
  `

  // 件数上限に達したかを画面へ伝える（黙って切り捨てない）
  const truncated = rows.length > LIMIT
  return NextResponse.json({
    transactions: truncated ? rows.slice(0, LIMIT) : rows,
    truncated,
    limit: LIMIT,
  })
}
