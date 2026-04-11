import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getSheetsClient, SPREADSHEET_ID } from "@/lib/sheets"

export async function GET() {
  const session = await auth()
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sheets = getSheetsClient(session.accessToken)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "カテゴリマスタ!A2:A50",
  })

  const categories = (res.data.values ?? []).flat().filter(Boolean)
  return NextResponse.json({ categories })
}
