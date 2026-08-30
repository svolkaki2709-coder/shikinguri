/**
 * ライフプラン画面の金額表示ヘルパー。
 * 数十年の試算では円単位だと桁が読めないため、この画面だけ万円で入出力する。
 * DBには他のテーブルと同じく円で保存する。
 */

export const MAN = 10000

/** 円 → 万円（表示用に整数へ丸める） */
export function toMan(yen: number): number {
  return Math.round(yen / MAN)
}

/** 円 → "1,234"（万円の桁区切り文字列） */
export function fmtMan(yen: number): string {
  return toMan(yen).toLocaleString("ja-JP")
}

/** 万円の入力文字列 → 円 */
export function manToYen(v: string | number): number {
  const n = Number(String(v).replace(/,/g, ""))
  return isNaN(n) ? 0 : Math.round(n * MAN)
}

/** 円 → 万円の入力文字列（端数は小数第1位まで残す） */
export function yenToManStr(yen: number): string {
  const v = yen / MAN
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10)
}

/** 円 → "12,345円"（円単位で見せたいとき用） */
export function fmtYen(yen: number): string {
  return `${Math.round(yen).toLocaleString("ja-JP")}円`
}
