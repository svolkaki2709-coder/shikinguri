"use client"

import { useEffect, useState } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"

interface Card { id: number; name: string; card_type: string; color: string }

const CASH_CARD = { name: "現金", card_type: "self", color: "#10b981", sort_order: 0 }

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
    ]).then(async ([cardData, catData]) => {
      let allCards: Card[] = cardData.cards ?? []

      // 「現金」カードがなければ自動作成
      let cashCard = allCards.find(c => c.name === "現金")
      if (!cashCard) {
        const res = await fetch("/api/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(CASH_CARD),
        })
        const d = await res.json()
        if (d.card) {
          cashCard = d.card
          allCards = [d.card, ...allCards]
        }
      }

      setCards(allCards)
      setCardId(cashCard?.id ?? allCards[0]?.id ?? null)

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

  const cashCard = cards.find(c => c.name === "現金")

  return (
    <div className="pb-20">
      <PageHeader title="手動入力" />
      <main className="max-w-md mx-auto px-4 py-2">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-3 space-y-3">

          <div>
            <p className="text-xs text-gray-500 mb-2">💡 カードはCSV取り込み。ここでは現金・電子マネーなどを手動記録</p>
          </div>

          {/* 支払方法 */}
          {cashCard && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              <span className="text-base">💴</span>
              <span className="text-sm font-semibold text-emerald-700">現金・電子マネー</span>
            </div>
          )}

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
