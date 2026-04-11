import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getSheetsClient, SPREADSHEET_ID, toJPY } from "@/lib/sheets"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sheets = getSheetsClient(session.accessToken)

  // ダッシュボードシートから月別合計 (A:B) と カテゴリ別 (I:J) を取得
  const [monthlyRes, categoryRes] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "ダッシュボード!A2:G20",
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "ダッシュボード!I2:L30",
    }),
  ])

  const monthlyRows = monthlyRes.data.values ?? []
  const monthly = monthlyRows
    .map(([month, total, , , jointTotal, self15Total, selfEndTotal]) => ({
      month: month ?? "",
      total: toJPY(total),
      jointTotal: toJPY(jointTotal ?? 0),
      self15Total: toJPY(self15Total ?? 0),
      selfEndTotal: toJPY(selfEndTotal ?? 0),
    }))
    .filter((r) => r.month)

  const categoryRows = categoryRes.data.values ?? []
  // カテゴリ行は [月ヘッダー（1行目）, カテゴリ, 合計, ...]
  const categories = categoryRows
    .map(([cat, amt]) => ({
      category: cat ?? "",
      amount: toJPY(amt ?? 0),
    }))
    .filter((r) => r.category && r.amount > 0)

  // 最新月を特定
  const latestMonth = monthly.length > 0 ? monthly[monthly.length - 1].month : ""

  return NextResponse.json({ monthly, categories, latestMonth })
}
