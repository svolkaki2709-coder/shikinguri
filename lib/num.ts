/**
 * 全角で打たれた数字を半角に直す。
 *
 * 日本語入力のまま金額を打つことは普通にあるが、入力欄の多くが
 * /^\d+$/ で弾いていたため「全角だと何も入らない」状態になっていた。
 * 入力を受け取った時点でここを通し、どちらで打っても同じ結果にする。
 */
export function toHalfWidth(v: string): string {
  return v
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[，、]/g, ",")
    .replace(/[．]/g, ".")
    .replace(/[－ー−]/g, "-")
}

/**
 * 金額入力の表示用。打っている途中から3桁区切りにする。
 * 桁数を目で数えずに済むよう、すべての金額欄でこれを通す。
 * 保存・計算の前には parseNum() でカンマを外すこと。
 */
export function fmtMoneyInput(v: string): string {
  const half = toHalfWidth(v ?? "")
  const neg = half.trim().startsWith("-")
  const raw = half.replace(/[^0-9]/g, "")
  if (raw === "") return neg ? "-" : ""
  return `${neg ? "-" : ""}${Number(raw).toLocaleString("ja-JP")}`
}

/**
 * 小数を使う入力（万円・％・利回りなど）の表示用。
 * 整数部だけ3桁区切りにし、入力途中の「1.」や末尾の0は壊さずそのまま残す。
 */
export function fmtDecimalInput(v: string): string {
  const half = toHalfWidth(v ?? "").replace(/,/g, "")
  if (half === "" || half === "-") return half
  const m = half.match(/^(-?)(\d*)(\.\d*)?/)
  if (!m) return half
  const [, sign, intPart, decPart] = m
  const int = intPart === "" ? "" : Number(intPart).toLocaleString("ja-JP")
  return `${sign}${int}${decPart ?? ""}`
}

/** カンマ・全角を外して数値にする。数値にならなければ 0 */
export function parseNum(v: string | number | null | undefined): number {
  if (typeof v === "number") return isNaN(v) ? 0 : v
  const n = Number(toHalfWidth(String(v ?? "")).replace(/,/g, ""))
  return isNaN(n) ? 0 : n
}
