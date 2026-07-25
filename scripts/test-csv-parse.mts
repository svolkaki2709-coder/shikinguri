/**
 * 銀行・カードCSVの列検出と金額パースの動作確認。
 *   node --experimental-strip-types scripts/test-csv-parse.mts
 */
import { parseCSV, detectColumns, findHeaderRowIndex, normalizeDate, parseAmountSigned } from "../lib/csv.ts"

const SAMPLES: Record<string, string> = {
  "三菱UFJ銀行": `日付,摘要,摘要内容,支払い金額,預かり金額,差引残高,メモ,未資金化区分,入払区分
2026/07/01,カード,イオンカード,192225,,1250000,,,1
2026/07/05,振込,キユウヨ　カキオカシンヤ,,383943,1633943,,,2
2026/07/10,ATM,セブンイレブン,30000,,1603943,,,1`,

  "三井住友銀行": `,,,,
お取引明細
年月日,お引出し,お預入れ,お取扱内容,残高
2026/07/01,192225,,カ－ドショウヒ,1250000
2026/07/05,,383943,ﾌﾘｺﾐ ｷﾕｳﾖ,1633943
2026/07/10,30000,,ATMｼﾞｷﾞﾖｳ,1603943`,

  "住信SBIネット銀行": `日付,内容,出金金額(円),入金金額(円),残高(円),メモ
2026/07/01,イオンカード,"192,225",,"1,250,000",
2026/07/05,給与振込,,"383,943","1,633,943",
2026/07/10,セブン銀行ATM,"30,000",,"1,603,943",`,

  "ゆうちょ銀行（符号1列）": `取扱日,受払区分,金額,詳細1,残高
2026/07/01,払出,▲192225,イオンカード,1250000
2026/07/05,預入,383943,キユウヨ,1633943`,

  "イオンカード（カード明細）": `ご利用代金明細
次回ご請求額,192225
ご利用日,ご利用先,ご利用金額
260701,ヨコハマミナトミライマンヨウク,6360
260702,中台　横浜公園上,3640`,
}

let failures = 0
for (const [name, csv] of Object.entries(SAMPLES)) {
  const rows = parseCSV(csv)
  const hIdx = findHeaderRowIndex(rows)
  const cols = detectColumns(rows[hIdx])
  const header = rows[hIdx]

  console.log(`\n=== ${name} ===`)
  console.log(`ヘッダー行: ${hIdx} → [${header.join(" | ")}]`)
  console.log(`  日付=${cols.dateIdx >= 0 ? header[cols.dateIdx] : "—"}` +
    `  出金=${cols.withdrawIdx >= 0 ? header[cols.withdrawIdx] : "—"}` +
    `  入金=${cols.depositIdx >= 0 ? header[cols.depositIdx] : "—"}` +
    `  残高=${cols.balanceIdx >= 0 ? header[cols.balanceIdx] : "—"}` +
    `  摘要=${cols.memoIdx >= 0 ? header[cols.memoIdx] : "—"}`)

  for (const row of rows.slice(hIdx + 1)) {
    const date = normalizeDate(row[cols.dateIdx] ?? "")
    if (!date) continue
    const w = cols.withdrawIdx >= 0 ? parseAmountSigned(row[cols.withdrawIdx] ?? "") : null
    const d = cols.depositIdx >= 0 ? parseAmountSigned(row[cols.depositIdx] ?? "") : null
    const b = cols.balanceIdx >= 0 ? parseAmountSigned(row[cols.balanceIdx] ?? "") : null
    const memo = row[cols.memoIdx] ?? ""
    console.log(`  ${date}  出金:${w ?? "-"}  入金:${d ?? "-"}  残高:${b ?? "-"}  ${memo}`)
    if (w == null && d == null) { console.log("    ★ 金額が取れていない"); failures++ }
  }
}

// 金額パースの単体確認
console.log("\n=== 金額パース ===")
const cases: [string, number | null][] = [
  ["1,234", 1234], ["¥1,234", 1234], ["▲1234", -1234], ["△1,234", -1234],
  ["-1234", -1234], ["(1234)", -1234], ["１２３４", 1234], ["", null], ["ー", null], ["0", 0],
]
for (const [input, expected] of cases) {
  const got = parseAmountSigned(input)
  const ok = got === expected
  if (!ok) failures++
  console.log(`  ${ok ? "OK " : "NG "} "${input}" → ${got}${ok ? "" : ` (期待: ${expected})`}`)
}

console.log(failures === 0 ? "\nすべて通過" : `\n${failures} 件の問題`)
process.exit(failures === 0 ? 0 : 1)
