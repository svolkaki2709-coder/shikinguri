"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"

interface Card { id: number; name: string; card_type: string; color: string }
interface Transaction {
  id: number
  date: string
  category: string
  amount: number
  memo: string
  source: string
  card_id: number
  card_name: string
  card_type: string
  color: string
}

function toJPY(n: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n)
}

export default function HistoryPage() {
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const router = useRouter()
  const searchParams = useSearchParams()

  const [cards, setCards] = useState<Card[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const [month, setMonthState] = useState(searchParams.get("month") ?? defaultMonth)
  const [cardId, setCardId] = useState(searchParams.get("card_id") ?? "")
  const [category, setCategory] = useState(searchParams.get("category") ?? "")
  const [keyword, setKeyword] = useState(searchParams.get("keyword") ?? "")

  function setMonth(m: string) {
    setMonthState(m)
    const p = new URLSearchParams(searchParams.toString())
    p.set("month", m)
    router.replace(`?${p.toString()}`, { scroll: false })
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/cards").then(r => r.json()),
      fetch("/api/categories").then(r => r.json()),
    ]).then(([cd, catd]) => {
      setCards(cd.cards ?? [])
      setCategories(catd.categories ?? [])
    })
  }, [])

  useEffect(() => {
    fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, cardId, category, keyword])

  async function fetchData() {
    setLoading(true)
    const params = new URLSearchParams()
    if (month) params.set("month", month)
    if (cardId) params.set("card_id", cardId)
    if (category) params.set("category", category)
    if (keyword) params.set("keyword", keyword)

    const data = await fetch(`/api/history?${params}`).then(r => r.json())
    setTransactions(data.transactions ?? [])
    setLoading(false)
  }

  async function handleDelete(id: number) {
    if (!confirm("この明細を削除しますか？")) return
    await fetch(`/api/transactions?id=${id}`, { method: "DELETE" })
    setTransactions(prev => prev.filter(t => t.id !== id))
  }

  async function handleCategoryChange(id: number, newCategory: string) {
    setEditingId(null)
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, category: newCategory }),
    })
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, category: newCategory } : t))
  }

  const total = transactions.reduce((s, t) => s + t.amount, 0)

  const grouped: Record<string, Transaction[]> = {}
  for (const t of transactions) {
    if (!grouped[t.date]) grouped[t.date] = []
    grouped[t.date].push(t)
  }
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className="pb-20">
      <PageHeader title="明細履歴" />
      <main className="max-w-md mx-auto px-4 py-2 space-y-2">
        {/* フィルター */}
        <div className="bg-white rounded-xl shadow-sm p-3 space-y-3">
          {/* カードタブ */}
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setCardId("")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                cardId === "" ? "bg-gray-700 text-white border-gray-700" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              すべて
            </button>
            {cards.map(c => (
              <button
                key={c.id}
                onClick={() => setCardId(String(c.id))}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                style={{
                  backgroundColor: cardId === String(c.id) ? c.color : "white",
                  borderColor: cardId === String(c.id) ? c.color : "#e5e7eb",
                  color: cardId === String(c.id) ? "white" : "#6b7280",
                }}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* 月選択 */}
          <div className="flex items-center gap-1 border rounded-lg px-1 py-1">
            <button onClick={() => { const [y,mo] = month.split("-").map(Number); const d = new Date(y, mo-2, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`) }}
              className="text-gray-600 hover:text-blue-600 px-1 font-bold text-base">‹</button>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="flex-1 text-center text-sm font-semibold text-gray-800 border-0 outline-none bg-transparent min-w-0" />
            <button onClick={() => { const [y,mo] = month.split("-").map(Number); const d = new Date(y, mo, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`) }}
              className="text-gray-600 hover:text-blue-600 px-1 font-bold text-base">›</button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-700 mb-1">カテゴリ</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full border rounded-lg px-2 py-1.5 text-sm bg-white">
                <option value="">すべて</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-700 mb-1">キーワード</label>
              <input type="text" value={keyword} onChange={e => setKeyword(e.target.value)}
                placeholder="メモ・カテゴリ"
                className="w-full border rounded-lg px-2 py-1.5 text-sm" />
            </div>
          </div>
        </div>

        {/* 合計 */}
        <div className="flex justify-between items-center px-1">
          <span className="text-sm text-gray-700">{transactions.length}件</span>
          <span className="text-base font-bold text-gray-800">{toJPY(total)}</span>
        </div>

        {loading && <div className="text-center py-4 text-gray-600">読み込み中...</div>}

        {!loading && sortedDates.map(date => {
          const dayTotal = grouped[date].reduce((s, t) => s + t.amount, 0)
          return (
            <div key={date} className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="flex justify-between items-center px-4 py-2 bg-gray-50 border-b">
                <span className="text-xs font-medium text-gray-600">{date}</span>
                <span className="text-xs font-semibold text-gray-600">{toJPY(dayTotal)}</span>
              </div>
              {grouped[date].map(t => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2 border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      {t.card_name && (
                        <span className="text-xs px-1.5 py-0.5 rounded text-white font-medium shrink-0"
                          style={{ backgroundColor: t.color ?? "#6366f1" }}>
                          {t.card_name}
                        </span>
                      )}
                      {editingId === t.id ? (
                        <select
                          autoFocus
                          value={t.category}
                          onChange={e => handleCategoryChange(t.id, e.target.value)}
                          onBlur={() => setEditingId(null)}
                          className="text-sm border border-blue-400 rounded px-1 py-0.5 bg-white text-gray-800 outline-none"
                        >
                          {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <button
                          onClick={() => setEditingId(t.id)}
                          className="text-sm font-medium text-gray-800 hover:text-blue-600 hover:underline truncate text-left"
                          title="タップしてカテゴリを変更"
                        >
                          {t.category}
                        </button>
                      )}
                      {t.source === "csv" && <span className="text-xs text-blue-400 shrink-0">CSV</span>}
                      {t.source === "recurring" && <span className="text-xs text-green-400 shrink-0">定期</span>}
                    </div>
                    {t.memo && <p className="text-xs text-gray-700 truncate">{t.memo}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold text-gray-800">{toJPY(t.amount)}</span>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="text-gray-300 hover:text-red-400 transition-colors text-xl leading-none w-6 text-center"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        })}

        {!loading && transactions.length === 0 && (
          <div className="text-center py-6 text-gray-600 text-sm">明細がありません</div>
        )}
      </main>
      <BottomNav />
    </div>
  )
}
