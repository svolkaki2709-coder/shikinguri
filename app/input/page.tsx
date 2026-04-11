"use client"

import { useEffect, useState } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"

interface Card { id: number; name: string; card_type: string; color: string }

export default function InputPage() {
  const [cards, setCards] = useState<Card[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [cardId, setCardId] = useState<number | null>(null)
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [category, setCategory] = useState("")
  const [amount, setAmount] = useState("")
  const [memo, setMemo] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    Promise.all([
      fetch("/api/cards").then(r => r.json()),
      fetch("/api/categories").then(r => r.json()),
    ]).then(([cardData, catData]) => {
      // 「現金」カードを除外して表示
      const allCards: Card[] = (cardData.cards ?? []).filter((c: Card) => c.name !== "現金")
      setCards(allCards)
      if (allCards.length > 0) setCardId(allCards[0].id)
      const cats = catData.categories ?? []
      setCategories(cats)
      if (cats.length > 0) setCategory(cats[0])
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!date || !cardId || !category || !amount) return

    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, card_id: cardId, category, amount: Number(amount), memo }),
      })
      if (res.ok) {
        setMessage({ type: "success", text: "記録しました" })
        setAmount("")
        setMemo("")
        setDate(new Date().toISOString().split("T")[0])
      } else {
        const d = await res.json()
        setMessage({ type: "error", text: d.error ?? "保存に失敗しました" })
      }
    } catch {
      setMessage({ type: "error", text: "通信エラーが発生しました" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pb-20">
      <PageHeader title="手動入力" />
      <main className="max-w-md mx-auto px-4 py-2">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-3 space-y-3">

          <p className="text-xs text-gray-500">現金・電子マネー等の支出を手動で記録します</p>

          {/* 用途（どのカード枠に入れるか） */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">用途</label>
            <div className="flex gap-2">
              {cards.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCardId(c.id)}
                  className="flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all"
                  style={{
                    borderColor: cardId === c.id ? c.color : "#e5e7eb",
                    backgroundColor: cardId === c.id ? c.color + "18" : "white",
                    color: cardId === c.id ? c.color : "#6b7280",
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {/* 日付 */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">日付</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* カテゴリ */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">カテゴリ</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-800"
              required
            >
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* 金額 */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">金額（円）</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm">¥</span>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                min="1"
                className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
                required
              />
            </div>
          </div>

          {/* メモ */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">メモ（任意）</label>
            <input
              type="text"
              value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder="例：スーパーで食材"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
            />
          </div>

          {message && (
            <div className={`text-sm rounded-lg px-3 py-2 ${message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {message.type === "success" ? "✅ " : "❌ "}{message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !cardId}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "保存中..." : "記録する"}
          </button>
        </form>
      </main>
      <BottomNav />
    </div>
  )
}
