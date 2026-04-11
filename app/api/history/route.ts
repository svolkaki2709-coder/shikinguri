import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getSheetsClient, SPREADSHEET_ID, toJPY } from "@/lib/sheets"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const keyword = searchParams.get("keyword") ?? ""
  const category = searchParams.get("category") ?? ""
  const month = searchParams.get("month") ?? "" // YYYY-MM

  const sheets = getSheetsClient(session.accessToken)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "明細_全履歴!A2:D5000",
  })

  const rows = res.data.values ?? []
  let transactions = rows
    .map(([date, cat, amount, memo]) => ({
      date: date ?? "",
      category: cat ?? "",
      amount: toJPY(amount),
      memo: memo ?? "",
    }))
    .filter((t) => t.date)

  if (keyword) {
    const kw = keyword.toLowerCase()
    transactions = transactions.filter(
      (t) =>
        t.memo.toLowerCase().includes(kw) ||
        t.category.toLowerCase().includes(kw)
    )
  }
  if (category) {
    transactions = transactions.filter((t) => t.category === category)
  }
  if (month) {
    transactions = transactions.filter((t) => t.date.startsWith(month))
  }

  transactions.sort((a, b) => b.date.localeCompare(a.date))

  return NextResponse.json({ transactions: transactions.slice(0, 200) })
}
