import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

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
  // YYYY/MM/DD or YYYY-MM-DD
  const m1 = raw.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (m1) return `${m1[1]}-${m1[2].padStart(2, "0")}-${m1[3].padStart(2, "0")}`
  // MM/DD/YYYY
  const m2 = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m2) return `${m2[3]}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`
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
  const lower = headers.map(h => h.toLowerCase())
  const dateIdx = lower.findIndex(h => h.includes("日") || h.includes("date") || h.includes("利用日") || h.includes("取引日"))
  const amountIdx = lower.findIndex(h => h.includes("金額") || h.includes("amount") || h.includes("利用金額") || h.includes("出金"))
  const memoIdx = lower.findIndex(h => h.includes("店") || h.includes("内容") || h.includes("摘要") || h.includes("memo") || h.includes("備考"))
  return {
    dateIdx: dateIdx >= 0 ? dateIdx : 0,
    amountIdx: amountIdx >= 0 ? amountIdx : 2,
    memoIdx: memoIdx >= 0 ? memoIdx : 1,
  }
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

  const text = await file.text()
  const rows = parseCSV(text)
  if (rows.length < 2) {
    return NextResponse.json({ error: "データが空です" }, { status: 400 })
  }

  const headers = rows[0]
  const { dateIdx, amountIdx, memoIdx } = detectColumns(headers)
  const dataRows = rows.slice(1)

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
