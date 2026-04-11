import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"
import iconv from "iconv-lite"

// CSVパース（簡易実装）
function parseCSV(text: string): string[][] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  return lines
    .filter(line => line.trim())
    .map(line => {
      const result: string[] = []
      let current = ""
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          inQuotes = !inQuotes
        } else if (ch === "," && !inQuotes) {
          result.push(current.trim())
          current = ""
        } else {
          current += ch
        }
      }
      result.push(current.trim())
      return result
    })
}

// 日付を YYYY-MM-DD 形式に正規化
function normalizeDate(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim()
  // YYYY年MM月DD日
  const m0 = s.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/)
  if (m0) return `${m0[1]}-${m0[2].padStart(2, "0")}-${m0[3].padStart(2, "0")}`
  // YYYY/MM/DD or YYYY-MM-DD
  const m1 = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (m1) return `${m1[1]}-${m1[2].padStart(2, "0")}-${m1[3].padStart(2, "0")}`
  // MM/DD/YYYY
  const m2 = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m2) return `${m2[3]}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`
  // YYYYMMDD（8桁数字）
  const m3 = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m3) return `${m3[1]}-${m3[2]}-${m3[3]}`
  // YYMMDD（6桁数字: イオンカード等 例: 260211 → 2026-02-11）
  const m4 = s.match(/^(\d{2})(\d{2})(\d{2})$/)
  if (m4) {
    const yy = parseInt(m4[1])
    const year = yy >= 50 ? `19${m4[1]}` : `20${m4[1]}`
    const mm = parseInt(m4[2])
    const dd = parseInt(m4[3])
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${year}-${m4[2]}-${m4[3]}`
    }
  }
  return null
}

// 金額文字列を数値に変換（¥, 円, カンマを除去）
function parseAmount(raw: string): number {
  const cleaned = String(raw).replace(/[¥円,\s]/g, "")
  const n = parseInt(cleaned)
  return isNaN(n) ? 0 : Math.abs(n)
}

// ヘッダーからカラムインデックスを推定
function detectColumns(headers: string[]): { dateIdx: number; amountIdx: number; memoIdx: number } {
  const lower = headers.map(h => h.toLowerCase().replace(/\s/g, ""))
  const dateIdx = lower.findIndex(h =>
    h.includes("利用日") || h.includes("取引日") || h.includes("date") ||
    h.includes("処理日") || h.includes("お支払日") || h.includes("支払日") ||
    h.includes("発生日") || h.includes("決済日") || (h.includes("日") && !h.includes("金額") && !h.includes("件数"))
  )
  const amountIdx = lower.findIndex(h =>
    h.includes("利用金額") || h.includes("お支払い金額") || h.includes("支払金額") ||
    h.includes("出金") || h.includes("amount") || h.includes("金額")
  )
  const memoIdx = lower.findIndex(h =>
    h.includes("利用先") || h.includes("店名") || h.includes("ご利用先") ||
    h.includes("内容") || h.includes("摘要") || h.includes("memo") ||
    h.includes("備考") || h.includes("加盟店")
  )
  return {
    dateIdx: dateIdx >= 0 ? dateIdx : 0,
    amountIdx: amountIdx >= 0 ? amountIdx : 2,
    memoIdx: memoIdx >= 0 ? memoIdx : 1,
  }
}

// 実際のヘッダー行を探す（メタ行をスキップ）
function findHeaderRowIndex(rows: string[][]): number {
  const dateKeywords = ["利用日", "取引日", "date", "処理日", "支払日", "発生日", "決済日"]
  const amountKeywords = ["金額", "amount", "出金"]
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i].map(h => h.toLowerCase())
    const hasDate = row.some(h => dateKeywords.some(k => h.includes(k)))
    const hasAmount = row.some(h => amountKeywords.some(k => h.includes(k)))
    if (hasDate || hasAmount) return i
  }
  return 0 // フォールバック: 1行目をヘッダーとみなす
}

async function ensureImportLogsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS csv_import_logs (
      id SERIAL PRIMARY KEY,
      card_id INT NOT NULL,
      card_name TEXT,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      row_count INT NOT NULL,
      file_name TEXT,
      imported_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await ensureImportLogsTable()

  const logs = await sql`
    SELECT id, card_id, card_name, start_date, end_date, row_count, file_name,
           imported_at AT TIME ZONE 'Asia/Tokyo' AS imported_at
    FROM csv_import_logs
    ORDER BY imported_at DESC
    LIMIT 20
  `
  return NextResponse.json({ logs: logs })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await ensureImportLogsTable()

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const cardId = formData.get("card_id") as string | null
  const force = formData.get("force") === "true"

  if (!file || !cardId) {
    return NextResponse.json({ error: "file と card_id は必須です" }, { status: 400 })
  }

  // Shift-JIS / UTF-8 両対応（イオンカード等はShift-JIS）
  const buffer = Buffer.from(await file.arrayBuffer())
  let text: string
  // UTF-8として試みる（BOM付きUTF-8も含む）
  const utf8 = buffer.toString("utf-8")
  const hasGarbled = /[\uFFFD]/.test(utf8) || /[\x80-\x9F]/.test(utf8.slice(0, 200))
  if (!hasGarbled) {
    text = utf8
  } else {
    // Shift-JIS でデコード
    text = iconv.decode(buffer, "Shift_JIS")
  }
  // BOM除去
  text = text.replace(/^\uFEFF/, "")
  const rows = parseCSV(text)
  if (rows.length < 2) {
    return NextResponse.json({ error: "データが空です" }, { status: 400 })
  }

  const headerRowIdx = findHeaderRowIndex(rows)
  const headers = rows[headerRowIdx]
  const { dateIdx, amountIdx, memoIdx } = detectColumns(headers)
  const dataRows = rows.slice(headerRowIdx + 1)

  // 有効な日付を収集して範囲を確定
  const dates: string[] = []
  for (const row of dataRows) {
    const d = normalizeDate(row[dateIdx] ?? "")
    if (d) dates.push(d)
  }

  if (dates.length === 0) {
    return NextResponse.json({ error: "有効な日付データが見つかりません" }, { status: 400 })
  }

  dates.sort()
  const startDate = dates[0]
  const endDate = dates[dates.length - 1]

  // 重複チェック（同じカードで日付範囲が重なるインポートがあるか）
  if (!force) {
    const overlap = await sql`
      SELECT id, card_name, start_date, end_date, row_count, imported_at AT TIME ZONE 'Asia/Tokyo' AS imported_at
      FROM csv_import_logs
      WHERE card_id = ${Number(cardId)}
        AND start_date <= ${endDate}
        AND end_date >= ${startDate}
      ORDER BY imported_at DESC
      LIMIT 1
    `
    if (overlap.length > 0) {
      const prev = overlap[0]
      return NextResponse.json({
        warning: true,
        message: `${prev.card_name ?? "同カード"} の ${prev.start_date} ～ ${prev.end_date} のデータが既にインポートされています（${prev.row_count}件、${String(prev.imported_at).slice(0, 16)}）。続けると重複データが登録されます。`,
        existingImport: prev,
        newRange: { startDate, endDate },
      })
    }
  }

  // カード名を取得
  const cardRow = await sql`SELECT name FROM cards WHERE id = ${Number(cardId)} LIMIT 1`
  const cardName = cardRow[0]?.name ?? ""

  let count = 0
  const skipped: string[] = []
  for (const row of dataRows) {
    const rawDate = row[dateIdx] ?? ""
    const rawAmount = row[amountIdx] ?? ""
    const rawMemo = row[memoIdx] ?? ""

    const date = normalizeDate(rawDate)
    const amount = parseAmount(rawAmount)

    if (!date || amount === 0) {
      skipped.push(row.join(","))
      continue
    }

    await sql`
      INSERT INTO transactions (date, card_id, category, amount, memo, source)
      VALUES (${date}, ${Number(cardId)}, '未分類', ${amount}, ${rawMemo}, 'csv')
    `
    count++
  }

  // インポートログを記録
  await sql`
    INSERT INTO csv_import_logs (card_id, card_name, start_date, end_date, row_count, file_name)
    VALUES (${Number(cardId)}, ${cardName}, ${startDate}, ${endDate}, ${count}, ${file.name})
  `

  return NextResponse.json({ success: true, imported: count, skipped: skipped.length })
}
