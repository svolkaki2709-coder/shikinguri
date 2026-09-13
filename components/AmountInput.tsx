"use client"

import { useCallback, useRef, useState } from "react"

/**
 * 金額のインライン編集用の入力欄。
 *
 * 既存の金額が入った状態で開くため、本来は「開いた直後に全選択 → 打ち直すと置き換わる」
 * という動きを期待するが、フォーカスと選択のタイミングによっては選択が外れてしまい、
 * 先頭に1文字挿入される（9000 と打ったつもりが 99000 になる）事故が起きていた。
 *
 * 選択状態に頼らず、「開いてから最初の1文字は必ず置き換え」と決め打ちすることで、
 * 環境によらず同じ結果になるようにしている。既存の値を活かして直したい場合は、
 * 先にカーソルキーやクリックで位置を決めれば、そのまま部分編集できる。
 */
export function AmountInput({ value, onChange, onCommit, onCancel, className = "", width }: {
  value: string
  onChange: (v: string) => void
  /** Enter またはフォーカスが外れたときの確定 */
  onCommit: () => void
  onCancel: () => void
  className?: string
  width?: string
}) {
  // 開いた直後かどうか。最初の入力で false になる
  const fresh = useRef(true)
  const [, force] = useState(0)

  // ref に無名関数を渡すと再レンダリングのたびに呼ばれてしまい、
  // 1文字打つたびに全選択が走って前の文字が消える（半角で1桁しか入らない）。
  // 最初に付いたときだけフォーカスするよう、関数を固定して1回に限定する。
  const focused = useRef(false)
  const attach = useCallback((el: HTMLInputElement | null) => {
    if (!el || focused.current) return
    focused.current = true
    el.focus()
    el.select()
  }, [])

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      ref={attach}
      onChange={e => onChange(fmtAmount(e.target.value))}
      onKeyDown={e => {
        if (e.key === "Enter") { e.currentTarget.blur(); return }
        if (e.key === "Escape") { onCancel(); return }

        // 開いて最初のキーは、選択できていてもいなくても「置き換え」に揃える
        if (fresh.current) {
          if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault()
            fresh.current = false
            onChange(fmtAmount(e.key))
            force(n => n + 1)
            return
          }
          if (e.key === "Backspace" || e.key === "Delete") {
            e.preventDefault()
            fresh.current = false
            onChange("")
            force(n => n + 1)
            return
          }
          // カーソル移動やクリックで位置を決めたなら、部分編集の意思とみなす
          fresh.current = false
        }
      }}
      onMouseDown={() => { fresh.current = false }}
      onBlur={onCommit}
      className={className}
      style={width ? { width } : undefined}
    />
  )
}

/**
 * 入力中の見た目を3桁区切りに整える。
 * 全角で打たれた数字（１２３・，）は半角に直してから扱う。
 * 日本語入力のまま金額を打つことは普通にあるので、ここで吸収しないと保存時に NaN になる。
 */
export function fmtAmount(v: string): string {
  const half = v
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[，、]/g, ",")
  const raw = half.replace(/,/g, "")
  if (raw === "") return ""
  if (!/^\d+$/.test(raw)) return half
  return Number(raw).toLocaleString()
}
