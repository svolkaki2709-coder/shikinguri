import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const cards = await sql`SELECT * FROM cards ORDER BY sort_order`
  return NextResponse.json({ cards })
}
