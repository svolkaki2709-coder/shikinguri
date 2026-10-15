"use client"

import { useEffect } from "react"

/**
 * 数字入力でカーソルが末尾に飛ばないようにする。
 *
 * 金額欄は打つたびに3桁区切りで表示し直すため、React が値を差し替えた瞬間に
 * カーソルが末尾へ移り、途中の1文字を直そうとしても続きの入力が末尾に入ってしまう。
 * 入力の直前に「カーソルより左にある数字の個数」を覚えておき、表示し直した後に
 * 同じ個数の数字の後ろへカーソルを戻す。カンマが増減しても位置がずれない。
 *
 * inputMode が numeric / decimal の入力欄すべてに効く（各画面の修正は不要）。
 */
export function CaretKeeper() {
  useEffect(() => {
    const isNum = (c: string) => /[0-9.\-]/.test(c)
    const onInput = (e: Event) => {
      const el = e.target
      if (!(el instanceof HTMLInputElement) || el.type !== "text") return
      const mode = el.inputMode
      if (mode !== "numeric" && mode !== "decimal") return
      const caret = el.selectionStart
      if (caret == null) return
      const typed = el.value
      const before = [...typed.slice(0, caret)].filter(isNum).length
      requestAnimationFrame(() => {
        if (document.activeElement !== el || el.value === typed) return
        let pos = 0
        let seen = 0
        while (pos < el.value.length && seen < before) {
          if (isNum(el.value[pos])) seen++
          pos++
        }
        el.setSelectionRange(pos, pos)
      })
    }
    document.addEventListener("input", onInput, true)
    return () => document.removeEventListener("input", onInput, true)
  }, [])
  return null
}
