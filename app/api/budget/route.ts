import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getSheetsClient, SPREADSHEET_ID, toJPY } from "@/lib/sheets"

export async function GET() {
  const session = await auth()
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sheets = getSheetsClient(session.accessToken)

  const [selfRes, jointRes] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "予算_自分!A1:Z50",
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "予算_共同!A1:Z50",
    }),
  ])

  return NextResponse.json({
    self: selfRes.data.values ?? [],
    joint: jointRes.data.values ?? [],
  })
}
