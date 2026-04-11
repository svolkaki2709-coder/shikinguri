import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { query } from "@/lib/db"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const keyword = searchParams.get("keyword") ?? ""
  const category = searchParams.get("category") ?? ""
  const month = searchParams.get("month") ?? ""

  let sql = `
    SELECT id, date::text, category, amount, memo, type
    FROM transactions
    WHERE 1=1
  `
  const params: (string | number)[] = []
  let idx = 1

  if (month) {
    sql += ` AND TO_CHAR(date, 'YYYY-MM') = $${idx++}`
    params.push(month)
  }
  if (category) {
    sql += ` AND category = $${idx++}`
    params.push(category)
  }
  if (keyword) {
    sql += ` AND (memo ILIKE $${idx} OR category ILIKE $${idx})`
    params.push(`%${keyword}%`)
    idx++
  }
  sql += ` ORDER BY date DESC, id DESC LIMIT 300`

  const rows = await query(sql, params)
  return NextResponse.json({ transactions: rows })
}
