import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
// lib直接インポートでVercelのfs問題を回避
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse")

interface ParsedPayslip {
  paymentMonth: string | null   // "2026-02"
  netPay: number | null          // 差引総支給額
  grossPay: number | null        // 支給合計
  incomeTax: number | null       // 所得税
  residentTax: number | null     // 住民税
  healthInsurance: number | null // 健康保険料
  pension: number | null         // 厚生年金保険料
  employmentInsurance: number | null // 雇用保険料
  travelReimbursement: number | null // 営業交通費
  totalDeduction: number | null  // 控除合計
}

/**
 * アイドマ・ホールディングス給与明細PDFの解析
 *
 * PDFテキスト構造:
 *   名前・社員番号
 *   差引総支給額
 *   [数値ブロック: 差引総支給額, 月給, 固定残業, ..., 支給計, 健保, ..., 控除計]
 *   [タイムシートブロック]
 *   [ラベルブロック: 支給, 月給, ...]
 *   2026年2月支払分 ...
 */
function parsePayslipText(text: string): ParsedPayslip {
  const lines = text
    .split(/[\r\n]+/)
    .map(l => l.trim())
    .filter(l => l.length > 0)

  // ---- 支払月の抽出 ----
  const monthMatch = text.match(/(\d{4})年(\d{1,2})月支払分/)
  const paymentMonth = monthMatch
    ? `${monthMatch[1]}-${monthMatch[2].padStart(2, "0")}`
    : null

  // ---- 数値行の抽出（タイムシート行を除く） ----
  // タイムシート行パターン: "19.0 日", "00:25 / 0" など
  const TIMESHEET_PATTERN = /[日時間\/:]|\d{2}:\d{2}/
  const numericLines: number[] = []

  let inNumberBlock = false
  for (const line of lines) {
    if (line.includes("差引総") || line.includes("差引総")) {
      inNumberBlock = true
      continue
    }
    // ラベルブロックが始まったら終了
    if (inNumberBlock && /^[支給控除月給固定]/.test(line) && !/^\d/.test(line)) {
      break
    }
    if (inNumberBlock) {
      if (TIMESHEET_PATTERN.test(line)) continue
      const cleaned = line.replace(/[,，\s]/g, "")
      const n = parseInt(cleaned)
      if (!isNaN(n) && /^\d+$/.test(cleaned)) {
        numericLines.push(n)
      }
    }
  }

  /**
   * アイドマ形式の数値配列マッピング（0ベース）:
   *  [0] 差引総支給額
   *  [1] 月給
   *  [2] 固定残業手当
   *  [3] 固定残業手当超過額
   *  [4] 勤怠控除
   *  [5] 非課税通勤手当
   *  [6] 課税通勤手当
   *  [7] 営業交通費
   *  [8] 支給合計
   *  [9] 健康保険料
   * [10] 介護保険料
   * [11] 厚生年金保険料
   * [12] 雇用保険料
   * [13] 所得税
   * [14] 住民税
   * [15] 控除合計
   */
  const n = numericLines

  // フォールバック: ラベル付近を検索
  function findNearLabel(label: string): number | null {
    for (let i = 0; i < lines.length; i++) {
      const normalized = lines[i].replace(/\s/g, "").replace(/⼿/g, "手").replace(/⽀/g, "支").replace(/⺠/g, "民")
      if (normalized.includes(label)) {
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const cleaned = lines[j].replace(/[,，\s]/g, "")
          const num = parseInt(cleaned)
          if (!isNaN(num) && /^\d+$/.test(cleaned) && num > 0) return num
        }
      }
    }
    return null
  }

  return {
    paymentMonth,
    netPay: n[0] ?? findNearLabel("差引総支給額"),
    grossPay: n[8] ?? null,
    incomeTax: n[13] ?? findNearLabel("所得税"),
    residentTax: n[14] ?? findNearLabel("住民税"),
    healthInsurance: n[9] ?? findNearLabel("健康保険料"),
    pension: n[11] ?? findNearLabel("厚生年金保険料"),
    employmentInsurance: n[12] ?? findNearLabel("雇用保険料"),
    travelReimbursement: n[7] ?? findNearLabel("営業交通費"),
    totalDeduction: n[15] ?? null,
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "fileが必要です" }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const parsed = await pdfParse(buffer, { max: 1 })
    const data = parsePayslipText(parsed.text)

    return NextResponse.json({ success: true, ...data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `PDF解析エラー: ${msg}` }, { status: 500 })
  }
}
