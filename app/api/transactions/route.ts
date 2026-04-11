import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getSheetsClient, SPREADSHEET_ID } from "@/lib/sheets"

// POST: 取引_手入力シートに新規行追加
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { date, category, amount, memo } = body

  if (!date || !category || !amount) {
    return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 })
  }

  const sheets = getSheetsClient(session.accessToken)

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "取引_手入力!A:D",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[date, category, Number(amount), memo ?? ""]],
    },
  })

  return NextResponse.json({ success: true })
}
