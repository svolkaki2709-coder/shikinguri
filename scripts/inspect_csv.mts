/**
 * CSVがどう解析されるかを確認する診断ツール。
 * 新しいカード・銀行のCSVが正しく取り込めないときに、
 * 列の判定結果と取込予定の明細を実際のパーサーで確認できる。
 *
 *   npx tsx scripts/inspect_csv.mts "C:/path/to/明細.csv"
 *
 * 見るべきポイント:
 *   headerless … 列名の行が無いCSVか
 *   cols.dateIdx / withdrawIdx / memoIdx … 日付・金額・摘要と判定された列番号
 *   合計 … CSVの請求額と一致するか
 */
import fs from "fs"
import { decodeCsvBuffer, parseCSV, detectLayout, normalizeDate, parseAmountSigned } from "../lib/csv"

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error("使い方: npx tsx scripts/inspect_csv.mts <csvファイル...>")
  process.exit(1)
}

for (const f of files) {
  const rows = parseCSV(decodeCsvBuffer(fs.readFileSync(f)))
  const layout = detectLayout(rows)
  console.log("=== " + f.split(/[\/]/).pop() + " ===")
  console.log("headerless:", layout.headerless, "/ dataStartIdx:", layout.dataStartIdx)
  console.log("cols:", JSON.stringify(layout.cols))

  // 取込ルート（app/api/import-csv）と同じ分類で数える
  //   skipped … 日付があり他列に金額らしき数値もあるのに取り込めなかった＝要確認
  //   ignored … 合計行・空行・金額0の行＝明細ではないので報告不要
  let total = 0, n = 0, skipped = 0, ignored = 0
  for (const row of rows.slice(layout.dataStartIdx)) {
    const d = normalizeDate(row[layout.cols.dateIdx] ?? "")
    if (!d) { ignored++; continue }
    const v = layout.cols.withdrawIdx >= 0 ? parseAmountSigned(row[layout.cols.withdrawIdx] ?? "") : null
    if (v == null || v === 0) {
      const hasMoneyElsewhere = row.some((c, i) => {
        if (i === layout.cols.dateIdx || i === layout.cols.withdrawIdx || i === layout.cols.depositIdx) return false
        const x = parseAmountSigned(c)
        return x != null && Math.abs(x) >= 10
      })
      if (hasMoneyElsewhere) { skipped++; console.log(`  [要確認] ${d}  ${row.join(" | ")}`) }
      else ignored++
      continue
    }
    console.log(`  ${d}  ${String(Math.abs(v)).padStart(9)}  ${(row[layout.cols.memoIdx] ?? "").trim()}`)
    total += Math.abs(v); n++
  }
  console.log(`  → 取込 ${n}件 / 合計 ${total.toLocaleString()}円 / 要確認 ${skipped}件 / 明細外 ${ignored}件\n`)
}
