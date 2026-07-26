"use client"

import { useState } from "react"

export interface SplitTarget {
  id: number
  date: string
  category: string
  amount: number
  memo: string
  card_name: string | null
  card_type: string
}

interface Part { category: string; amount: string }

function toJPY(n: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n)
}

/**
 * 1件の明細を複数カテゴリへ分割するモーダル。
 * 立替分と自分の負担分を1回の会計から切り分ける用途を想定している。
 */
export function SplitTransactionModal({
  target, categories, onClose, onDone,
}: {
  target: SplitTarget
  categories: string[]
  onClose: () => void
  onDone: () => void
}) {
  const [parts, setParts] = useState<Part[]>(() => {
    const advance = categories.find(c => c.includes("立替") && !c.includes("精算")) ?? categories[0] ?? ""
    return [
      { category: advance, amount: "" },
      { category: target.category, amount: "" },
    ]
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const entered = parts.reduce((s, p) => s + (Number(p.amount.replace(/,/g, "")) || 0), 0)
  const remaining = target.amount - entered
  const balanced = remaining === 0

  function update(i: number, patch: Partial<Part>) {
    setParts(prev => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  }

  /** 残額を指定の行へ入れる（片方を打てばもう片方が自動で埋まる） */
  function fillRemaining(i: number) {
    const others = parts.reduce((s, p, idx) => idx === i ? s : s + (Number(p.amount.replace(/,/g, "")) || 0), 0)
    const rest = target.amount - others
    if (rest > 0) update(i, { amount: String(rest) })
  }

  async function handleSave() {
    setError("")
    if (!balanced) { setError("内訳の合計を元の金額に合わせてください"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/transactions/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: target.id,
          parts: parts.map(p => ({ category: p.category, amount: Number(p.amount.replace(/,/g, "")) })),
        }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? "分割に失敗しました"); return }
      onDone()
    } catch {
      setError("通信エラーが発生しました")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center">
          <h2 className="text-base font-bold text-slate-100">明細を分割</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
        </div>

        {/* 元の明細 */}
        <div className="bg-slate-800 rounded-lg px-3 py-2.5">
          <div className="flex justify-between items-baseline">
            <span className="text-xs text-slate-400">{target.date}</span>
            <span className="text-lg font-bold text-slate-100">{toJPY(target.amount)}</span>
          </div>
          <p className="text-xs text-slate-300 truncate">{target.memo || target.category}</p>
          {target.card_name && <p className="text-[11px] text-slate-500">{target.card_name}</p>}
        </div>

        <p className="text-xs text-slate-400">
          この会計の中身を分けます。たとえば立替分と自分の負担分など。
          <span className="block text-slate-500 mt-0.5">合計は元の金額と一致させる必要があります。</span>
        </p>

        {/* 内訳 */}
        <div className="space-y-2">
          {parts.map((p, i) => (
            <div key={i} className="flex gap-2 items-center">
              <select value={p.category} onChange={e => update(i, { category: e.target.value })}
                className="flex-1 min-w-0 border border-slate-700 rounded-lg px-2 py-2 text-sm bg-slate-900 text-slate-100 outline-none focus:ring-2 focus:ring-blue-500">
                {!categories.includes(p.category) && <option value={p.category}>{p.category}</option>}
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="relative w-32 shrink-0">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-sm">¥</span>
                <input type="text" inputMode="numeric" placeholder="0"
                  value={p.amount ? Number(p.amount.replace(/,/g, "")).toLocaleString("ja-JP") : ""}
                  onChange={e => {
                    const raw = e.target.value.replace(/,/g, "")
                    if (raw === "" || /^\d+$/.test(raw)) update(i, { amount: raw })
                  }}
                  className="w-full border border-slate-700 rounded-lg pl-6 pr-2 py-2 text-sm text-right text-slate-100 bg-slate-900 outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button onClick={() => fillRemaining(i)} title="残額をここに入れる"
                className="text-[11px] text-blue-400 hover:underline shrink-0 w-8">残額</button>
              {parts.length > 2 && (
                <button onClick={() => setParts(prev => prev.filter((_, idx) => idx !== i))}
                  className="text-slate-600 hover:text-red-400 text-lg leading-none shrink-0 w-5">×</button>
              )}
            </div>
          ))}
        </div>

        <button onClick={() => setParts(prev => [...prev, { category: categories[0] ?? "", amount: "" }])}
          className="text-xs text-blue-400 hover:underline">＋ 内訳を追加</button>

        {/* 差額 */}
        <div className={`rounded-lg px-3 py-2 text-sm flex justify-between ${
          balanced ? "bg-green-500/10 text-green-300" : "bg-amber-500/10 text-amber-300"
        }`}>
          <span>内訳の合計</span>
          <span className="font-semibold">
            {toJPY(entered)}
            {!balanced && <span className="ml-2">（残り {toJPY(remaining)}）</span>}
          </span>
        </div>

        {error && <div className="bg-red-500/10 text-red-300 rounded-lg px-3 py-2 text-sm">{error}</div>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-800 text-sm text-slate-400 hover:bg-slate-800">
            キャンセル
          </button>
          <button onClick={handleSave} disabled={saving || !balanced}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40">
            {saving ? "分割中..." : "分割する"}
          </button>
        </div>
      </div>
    </div>
  )
}
