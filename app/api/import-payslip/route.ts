import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
// v1.1.1: lib直接インポートでVercelのfs問題を回避（v1のentry pointがtest fileを読もうとするバグ対策）
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse")

interface ParsedPayslip {
  paymentMonth: string | null
  netPay: number | null          // 差引総支給額
  grossPay: number | null        // 支給合計（額面）
  incomeTax: number | null       // 所得税
  residentTax: number | null     // 住民税
  healthInsurance: number | null // 健康保険料
  pension: number | null         // 厚生年金保険料
  employmentInsurance: number | null // 雇用保険料
  travelReimbursement: number | null // 営業交通費（立替）
  nonTaxableCommute: number | null   // 非課税通勤手当（立替）
  taxableCommute: number | null      // 課税通勤手当（立替）
  totalDeduction: number | null  // 控除合計
  yearEndAdjustment: number | null // 年末調整還付（負値=還付）
  _debug?: { nums: number[]; labels: string[]; val: Record<string, number> }
}

/**
 * アイドマ・ホールディングス給与明細PDFの解析
 *
 * PDFテキスト構造（特殊: 数値が先に並び、ラベルが後から出てくる）:
 *   名前・社員番号
 *   差引総支給額
 *   [数値ブロック: 差引総支給額, 月給, 固定残業, ..., 支給計, 健保, ..., 控除計]
 *   [タイムシートブロック: 日付・時間]
 *   [ラベルブロック: 支給, 月給, 固定残業手当, ..., 計, 控除, 健康保険料, ..., 計]
 *   YYYY年M月支払分 ...
 *
 * 解析方針: 数値ブロックとラベルブロックを別々に収集し、
 *   nums[0]=差引総支給額, nums[i+1]=labels[i] として対応させる
 */
function parsePayslipText(text: string): ParsedPayslip {
  const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.length > 0)

  // ---- 支払月 ----
  const monthMatch = text.match(/(\d{4})年(\d{1,2})月支払分/)
  const paymentMonth = monthMatch
    ? `${monthMatch[1]}-${monthMatch[2].padStart(2, "0")}`
    : null

  // タイムシート行パターン（スキップ対象）
  const TIMESHEET = /[日時間]|\d{2}:\d{2}|\d+\.\d+ 日/

  // ==== STEP 1: 数値ブロック収集 ====
  // 「差引総支給額」行の直後から、非数値行が出るまで
  const nums: number[] = []
  let inBlock = false

  for (const line of lines) {
    if (line.includes("差引総")) { inBlock = true; continue }
    if (!inBlock) continue
    if (TIMESHEET.test(line)) continue
    const c = line.replace(/[,，\s]/g, "")
    if (/^-?\d+$/.test(c)) {
      nums.push(Number(c))  // マイナス値（年末調整還付など）も含む
    } else if (/^[△▲]\d+$/.test(c)) {
      nums.push(-parseInt(c.substring(1)))  // △表記のマイナス値
    } else if (c.length > 0) {
      break  // 非数値行 = 数値ブロック終了
    }
  }

  // ==== STEP 2: ラベルブロック収集 ====
  // 数値ブロック通過後の非数値・非タイムシート行を収集
  // スキップ対象: セクションヘッダー（支給/控除/備考/勤怠）、大きな数値を含む行（備考欄）
  const SECTION_HEADERS = new Set(["支給", "控除", "備考", "勤怠", "小計"])
  const labels: string[] = []
  let passedBlock = false

  for (const line of lines) {
    if (line.match(/\d{4}年\d{1,2}月支払分/)) break  // 支払月行で終了
    if (line.includes("差引総")) { passedBlock = true; continue }
    if (!passedBlock) continue
    if (TIMESHEET.test(line)) continue
    const c = line.replace(/[,，\s]/g, "")
    if (/^\d+$/.test(c)) continue  // 数値行スキップ
    // 4桁以上の数値を含む行はスキップ（備考欄: 課税支給累計額など）
    if (/\d{4,}/.test(line.replace(/[（）()年月〜～]/g, ""))) continue
    if (SECTION_HEADERS.has(line)) continue
    if (line.trim().length === 0) continue
    labels.push(line.trim())
  }

  // ==== STEP 3: ラベル→数値マッピング ====
  // nums[0] = 差引総支給額, nums[i+1] = labels[i] に対応
  const val: Record<string, number> = {}
  if (nums[0] != null) val["差引総支給額"] = nums[0]
  for (let i = 0; i < labels.length && i + 1 < nums.length; i++) {
    val[labels[i]] = nums[i + 1]
  }

  // 「計」は2回出現: 1回目=支給合計, 2回目=控除合計
  let grossPay: number | null = null
  let totalDeduction: number | null = null
  let calcCount = 0
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === "計") {
      calcCount++
      const v = nums[i + 1] ?? 0
      if (calcCount === 1) grossPay = v || null
      else if (calcCount === 2) totalDeduction = v || null
    }
  }

  // ==== STEP 4: 後処理 ====
  // 住民税が負値 = 年末調整還付の値が誤マッピングされている
  // （12月など住民税=0の月はPDF数値ブロックから省略されるためずれる）
  let yearEndAdjustment: number | null = null
  if ((val["住民税"] ?? 0) < 0) {
    yearEndAdjustment = val["住民税"]  // 例: -37,042
    val["住民税"] = 0
  }
  // 明示的な年末調整ラベルがあれば上書き
  for (let i = 0; i < labels.length; i++) {
    if (labels[i].includes("年末調整") && nums[i + 1] != null && nums[i + 1] < 0) {
      yearEndAdjustment = nums[i + 1]
      break
    }
  }
  // totalDeductionが取れなかった場合（計ラベルのずれ）は手動計算
  if (totalDeduction === null) {
    const base = (val["所得税"] ?? 0) + (val["住民税"] ?? 0)
      + (val["健康保険料"] ?? 0) + (val["厚生年金保険料"] ?? 0)
      + (val["雇用保険料"] ?? 0)
    totalDeduction = base + (yearEndAdjustment ?? 0) || null
  }

  return {
    paymentMonth,
    netPay:              val["差引総支給額"]    ?? null,
    grossPay,
    incomeTax:           val["所得税"]          ?? null,
    residentTax:         val["住民税"] != null && val["住民税"] >= 0 ? val["住民税"] : null,
    healthInsurance:     val["健康保険料"]       ?? null,
    pension:             val["厚生年金保険料"]   ?? null,
    employmentInsurance: val["雇用保険料"]       ?? null,
    travelReimbursement: val["営業交通費"]       ?? null,
    nonTaxableCommute:   val["非課税通勤手当"]   ?? null,
    taxableCommute:      val["課税通勤手当"]     ?? null,
    totalDeduction,
    yearEndAdjustment,
    _debug: { nums, labels, val },
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
