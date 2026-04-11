"use client"

import { useEffect, useState } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"

export default function InputPage() {
  const [categories, setCategories] = useState<string[]>([])
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [category, setCategory] = useState("")
  const [amount, setAmount] = useState("")
  const [memo, setMemo] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => {
        setCategories(d.categories ?? [])
        if (d.categories?.length > 0) setCategory(d.categories[0])
      })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!date || !category || !amount) return

    setLoading(true)
    setMessage(null)

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, category, amount: Number(amount), memo }),
      })

      if (res.ok) {
        setMessage({ type: "success", text: "✅ 記録しました！" })
        setAmount("")
        setMemo("")
        setDate(new Date().toISOString().split("T")[0])
      } else {
        setMessage({ type: "error", text: "❌ 保存に失敗しました" })
      }
    } catch {
      setMessage({ type: "error", text: "❌ 通信エラーが発生しました" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pb-20">
      <PageHeader title="支出入力" />
      <main className="max-w-md mx-auto px-4 py-4">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-5 space-y-4">
          {/* 日付 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">日付</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* カテゴリ */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">カテゴリ</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              required
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* 金額 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">金額（円）</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">¥</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                min="0"
                className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {/* メモ */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">メモ（任意）</label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="内容のメモ..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* メッセージ */}
          {message && (
            <div
              className={`text-sm rounded-lg px-3 py-2 ${
                message.type === "success"
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}

          {/* 送信ボタン */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg py-3 font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "保存中..." : "記録する"}
          </button>
        </form>
      </main>
      <BottomNav />
    </div>
  )
}
