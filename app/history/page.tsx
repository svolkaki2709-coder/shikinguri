"use client"

import { useEffect, useState, useCallback } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"

interface Transaction {
  date: string
  category: string
  amount: number
  memo: string
}

function toJPY(n: number) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(n)
}

export default function HistoryPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [keyword, setKeyword] = useState("")
  const [category, setCategory] = useState("")
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []))
  }, [])

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (keyword) params.set("keyword", keyword)
    if (category) params.set("category", category)
    if (month) params.set("month", month)

    const res = await fetch(`/api/history?${params}`)
    const data = await res.json()
    setTransactions(data.transactions ?? [])
    setLoading(false)
  }, [keyword, category, month])

  useEffect(() => {
    const id = setTimeout(fetchHistory, 400)
    return () => clearTimeout(id)
  }, [fetchHistory])

  const total = transactions.reduce((s, t) => s + t.amount, 0)

  return (
    <div className="pb-20">
      <PageHeader title="明細履歴" />
      <main className="max-w-md mx-auto px-4 py-4 space-y-3">
        {/* フィルター */}
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">年月</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">カテゴリ</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">すべて</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">キーワード</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="メモやカテゴリで検索..."
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* 合計 */}
        <div className="bg-blue-50 rounded-xl px-4 py-3 flex justify-between items-center">
          <span className="text-sm text-blue-700">{transactions.length}件</span>
          <span className="font-bold text-blue-800">{toJPY(total)}</span>
        </div>

        {/* 一覧 */}
        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">読み込み中...</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">該当データなし</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
            {transactions.map((t, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{t.date}</span>
                    <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                      {t.category}
                    </span>
                  </div>
                  {t.memo && (
                    <p className="text-sm text-gray-700 mt-0.5 truncate">{t.memo}</p>
                  )}
                </div>
                <span className="ml-3 font-semibold text-gray-800 shrink-0">
                  {toJPY(t.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  )
}
