import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const keyword = searchParams.get("keyword") ?? ""
  const category = searchParams.get("category") ?? ""
  const month = searchParams.get("month") ?? "" // YYYY-MM

  let query = `
    SELECT id, date::text, category, amount, memo, type
    FROM transactions
    WHERE 1=1
  `
  const params: (string | number)[] = []
  let idx = 1

  if (month) {
    query += ` AND TO_CHAR(date, 'YYYY-MM') = $${idx++}`
    params.push(month)
  }
  if (category) {
    query += ` AND category = $${idx++}`
    params.push(category)
  }
  if (keyword) {
    query += ` AND (memo ILIKE $${idx} OR category ILIKE $${idx})`
    params.push(`%${keyword}%`)
    idx++
  }
  query += ` ORDER BY date DESC, id DESC LIMIT 300`

  const { rows } = await sql.query(query, params)
  return NextResponse.json({ transactions: rows })
}
