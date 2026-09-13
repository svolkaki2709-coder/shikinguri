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
