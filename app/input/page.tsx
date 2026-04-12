"use client"

import { useEffect, useState, useMemo } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"

interface Card { id: number; name: string; card_type: string; color: string }
interface CategoryRow { name: string; card_type: string }

export default function InputPage() {
  const [cards, setCards] = useState<Card[]>([])
  const [allCategoryRows, setAllCategoryRows] = useState<CategoryRow[]>([])
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
      const allCards: Card[] = (cardData.cards ?? []).filter((c: Card) => c.name !== "現金")
      setCards(allCards)
      if (allCards.length > 0) setCardId(allCards[0].id)
      const rows: CategoryRow[] = catData.rows ?? []
      setAllCategoryRows(rows)
    })
  }, [])

  // 選択中カードの card_type
  const selectedCardType = useMemo(() => {
    if (!cardId) return null
    return cards.find(c => c.id === cardId)?.card_type ?? null
  }, [cardId, cards])

  // 選択中カードに対応するカテゴリ一覧
  const filteredCategories = useMemo(() => {
    if (!selectedCardType) return allCategoryRows.map(r => r.name)
    return allCategoryRows
      .filter(r => r.card_type === selectedCardType)
      .map(r => r.name)
  }, [selectedCardType, allCategoryRows])

  // カードが変わったら先頭カテゴリにリセット
  useEffect(() => {
    if (filteredCategories.length > 0) {
      setCategory(filteredCategories[0])
    }
  }, [filteredCategories])

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

  const selectedCard = cards.find(c => c.id === cardId)

  return (
    <div className="pb-20">
      <PageHeader title="手動入力" />
      <main className="max-w-md mx-auto px-4 py-2">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-3 space-y-3">

          <p className="text-xs text-gray-500">現金・電子マネー等の支出を手動で記録します</p>

          {/* 用途（個人 or 共用） */}
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
            {selectedCard && (
              <p className="text-xs text-gray-400 mt-1 pl-1">
                {selectedCard.card_type === "joint" ? "共用カテゴリ" : "個人カテゴリ"}を表示中
              </p>
            )}
          </div>

          {/* 日付 */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">日付</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
              required
            />
          </div>

          {/* カテゴリ */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">カテゴリ</label>
            {filteredCategories.length === 0 ? (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                カテゴリが未設定です。設定 → カテゴリ から追加してください。
              </p>
            ) : (
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-800"
                required
              >
                {filteredCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
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
            disabled={loading || !cardId || filteredCategories.length === 0}
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
