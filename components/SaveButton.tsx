"use client"

import { useState } from "react"

/**
 * 押した結果がボタン自体に出る保存ボタン。
 *
 * 画面上部のメッセージだけで知らせると、下までスクロールしている状態では
 * 保存できたのか分からない。押した手元で「保存中 → 保存しました」を見せる。
 */
export function SaveButton({ onSave, label, savedLabel = "保存しました", className = "" }: {
  /** 保存処理。失敗したら例外を投げること */
  onSave: () => Promise<void>
  label: string
  savedLabel?: string
  className?: string
}) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle")

  async function handle() {
    if (state === "saving") return
    setState("saving")
    try {
      await onSave()
      setState("done")
      setTimeout(() => setState("idle"), 2500)
    } catch {
      setState("error")
      setTimeout(() => setState("idle"), 4000)
    }
  }

  const style =
    state === "done"  ? "bg-green-600 hover:bg-green-600"
    : state === "error" ? "bg-red-600 hover:bg-red-600"
    : "bg-blue-600 hover:bg-blue-700"

  return (
    <button
      onClick={handle}
      disabled={state === "saving"}
      className={`w-full text-white rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 active:scale-[0.99] ${style} ${className}`}
    >
      {state === "saving" ? "保存中..."
        : state === "done" ? `✓ ${savedLabel}`
        : state === "error" ? "保存に失敗しました（もう一度お試しください）"
        : label}
    </button>
  )
}
