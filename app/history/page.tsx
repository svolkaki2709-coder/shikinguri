"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"
import { useViewMode } from "@/components/ViewModeContext"

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
  return (
    <Suspense fallback={<div className="pb-20"><PageHeader title="明細履歴" /><div className="text-center py-8 text-gray-500">読み込み中...</div><BottomNav /></div>}>
      <HistoryContent />
    </Suspense>
  )
}

function HistoryContent() {
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const router = useRouter()
  const searchParams = useSearchParams()
  const { mode } = useViewMode()
  const isPC = mode === "pc"

  const [cards, setCards] = useState<Card[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)

  const [month, setMonthState] = useState(searchParams.get("month") ?? defaultMonth)
  const [cardId, setCardId] = useState(searchParams.get("card_id") ?? "")
  const [category, setCategory] = useState(searchParams.get("category") ?? "")
  const [keyword, setKeyword] = useState(searchParams.get("keyword") ?? "")

  // 編集モーダル
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [editForm, setEditForm] = useState({
    date: "", card_id: 0, category: "", amount: "", memo: ""
  })
  const [editSaving, setEditSaving] = useState(false)

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

  function openEditModal(t: Transaction) {
    setEditingTransaction(t)
    setEditForm({
      date: t.date,
      card_id: t.card_id,
      category: t.category,
      amount: t.amount.toLocaleString("ja-JP"),
      memo: t.memo ?? "",
    })
  }

  async function handleEditSave() {
    if (!editingTransaction) return
    setEditSaving(true)
    const amountNum = Number(editForm.amount.replace(/,/g, ""))
    const card = cards.find(c => c.id === Number(editForm.card_id))
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingTransaction.id,
        date: editForm.date,
        card_id: editForm.card_id,
        category: editForm.category,
        amount: amountNum,
        memo: editForm.memo,
      }),
    })
    setTransactions(prev => prev.map(t =>
      t.id === editingTransaction.id
        ? {
            ...t,
            date: editForm.date,
            card_id: Number(editForm.card_id),
            category: editForm.category,
            amount: amountNum,
            memo: editForm.memo,
            card_name: card?.name ?? t.card_name,
            card_type: card?.card_type ?? t.card_type,
            color: card?.color ?? t.color,
          }
        : t
    ))
    setEditSaving(false)
    setEditingTransaction(null)
  }

  const total = transactions.reduce((s, t) => s + t.amount, 0)

  const grouped: Record<string, Transaction[]> = {}
  for (const t of transactions) {
    if (!grouped[t.date]) grouped[t.date] = []
    grouped[t.date].push(t)
  }
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className={mode === "mobile" ? "pb-20" : ""}>
      <PageHeader title="明細履歴" />
      <div className={isPC ? "px-6 py-4" : "max-w-md mx-auto px-4 py-2"}>
        {/* フィルターバー */}
        <div className={`bg-white rounded-xl shadow-sm p-3 ${isPC ? "mb-4" : "mb-3 space-y-3"}`}>
          {isPC ? (
            <div className="flex items-center gap-3 flex-wrap">
              {/* カードフィルター */}
              <div className="flex gap-1.5 flex-wrap">
                <button onClick={() => setCardId("")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${cardId === "" ? "bg-gray-700 text-white border-gray-700" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
                  すべて
                </button>
                {cards.map(c => (
                  <button key={c.id} onClick={() => setCardId(String(c.id))}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all"
                    style={{
                      backgroundColor: cardId === String(c.id) ? c.color : "white",
                      borderColor: cardId === String(c.id) ? c.color : "#e5e7eb",
                      color: cardId === String(c.id) ? "white" : "#6b7280",
                    }}>
                    {c.name}
                  </button>
                ))}
              </div>
              {/* 月選択 */}
              <div className="flex items-center gap-1 border rounded-lg px-2 py-1 bg-white">
                <button onClick={() => { const [y,mo] = month.split("-").map(Number); const d = new Date(y, mo-2, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`) }}
                  className="text-gray-600 hover:text-blue-600 px-1 font-bold text-sm">‹</button>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                  className="text-center text-xs font-semibold text-gray-800 border-0 outline-none bg-transparent w-28" />
                <button onClick={() => { const [y,mo] = month.split("-").map(Number); const d = new Date(y, mo, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`) }}
                  className="text-gray-600 hover:text-blue-600 px-1 font-bold text-sm">›</button>
              </div>
              {/* カテゴリ */}
              <div className="flex items-center gap-1.5">
                <select value={category} onChange={e => setCategory(e.target.value)}
                  className="border rounded-lg px-2 py-1 text-xs bg-white text-gray-800">
                  <option value="">全カテゴリ</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={() => setCategory(category === "未分類" ? "" : "未分類")}
                  className={`text-xs px-2 py-1 rounded-lg border transition-all whitespace-nowrap ${category === "未分類" ? "bg-orange-500 text-white border-orange-500" : "text-orange-500 border-orange-300 hover:bg-orange-50"}`}>
                  ⚠ 未分類のみ
                </button>
              </div>
              {/* キーワード */}
              <input type="text" value={keyword} onChange={e => setKeyword(e.target.value)}
                placeholder="キーワード検索"
                className="border rounded-lg px-2 py-1 text-xs w-36" />
              {/* 件数 */}
              <div className="ml-auto flex items-center gap-3">
                <span className="text-xs text-gray-500">{transactions.length}件</span>
                <span className="text-sm font-bold text-gray-800">{toJPY(total)}</span>
              </div>
            </div>
          ) : (
            <>
              {/* モバイル: カードフィルター */}
              <div className="flex gap-1.5 flex-wrap">
                <button onClick={() => setCardId("")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${cardId === "" ? "bg-gray-700 text-white border-gray-700" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
                  すべて
                </button>
                {cards.map(c => (
                  <button key={c.id} onClick={() => setCardId(String(c.id))}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                    style={{
                      backgroundColor: cardId === String(c.id) ? c.color : "white",
                      borderColor: cardId === String(c.id) ? c.color : "#e5e7eb",
                      color: cardId === String(c.id) ? "white" : "#6b7280",
                    }}>
                    {c.name}
                  </button>
                ))}
              </div>
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs text-gray-700">カテゴリ</label>
                    <button onClick={() => setCategory(category === "未分類" ? "" : "未分類")}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-all ${category === "未分類" ? "bg-orange-500 text-white border-orange-500" : "text-orange-500 border-orange-300 hover:bg-orange-50"}`}>
                      未分類のみ
                    </button>
                  </div>
                  <select value={category} onChange={e => setCategory(e.target.value)}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm bg-white text-gray-800">
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
            </>
          )}
        </div>

        {!isPC && (
          <div className="flex justify-between items-center px-1 mb-2">
            <span className="text-sm text-gray-500">{transactions.length}件</span>
            <span className="text-base font-bold text-gray-800">{toJPY(total)}</span>
          </div>
        )}

        {loading && <div className="text-center py-4 text-gray-500 text-sm">読み込み中...</div>}

        {/* PC: テーブルビュー */}
        {!loading && isPC && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b text-gray-500">
                  <th className="text-left px-4 py-2 font-medium">日付</th>
                  <th className="text-left px-3 py-2 font-medium">支払方法</th>
                  <th className="text-left px-3 py-2 font-medium">カテゴリ</th>
                  <th className="text-left px-3 py-2 font-medium">メモ</th>
                  <th className="text-right px-3 py-2 font-medium">金額</th>
                  <th className="text-center px-3 py-2 font-medium w-16">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">明細がありません</td></tr>
                ) : (
                  transactions.map(t => (
                    <tr key={t.id} className={`hover:bg-gray-50 transition-colors ${t.category === "未分類" ? "bg-orange-50 hover:bg-orange-100" : ""}`}>
                      <td className="px-4 py-1.5 text-gray-600 whitespace-nowrap">{t.date}</td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${t.card_type === "joint" ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"}`}>
                            {t.card_type === "joint" ? "共用" : "個人"}
                          </span>
                          {t.card_name && (
                            <span className="text-xs px-1.5 py-0.5 rounded text-white font-medium whitespace-nowrap"
                              style={{ backgroundColor: t.color ?? "#6366f1" }}>
                              {t.card_name}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={`text-xs ${t.category === "未分類" ? "text-orange-500 font-semibold" : "text-gray-700"}`}>
                          {t.category === "未分類" ? "⚠ 未分類" : t.category}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-gray-500 max-w-xs truncate">{t.memo}</td>
                      <td className="px-3 py-1.5 text-right font-semibold text-gray-800 whitespace-nowrap">{toJPY(t.amount)}</td>
                      <td className="px-3 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => openEditModal(t)}
                            className="text-gray-300 hover:text-blue-500 text-sm leading-none" title="編集">✏</button>
                          <button onClick={() => handleDelete(t.id)}
                            className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile: カードビュー */}
        {!loading && !isPC && sortedDates.map(date => {
          const dayTotal = grouped[date].reduce((s, t) => s + t.amount, 0)
          return (
            <div key={date} className="bg-white rounded-xl shadow-sm overflow-hidden mb-2">
              <div className="flex justify-between items-center px-4 py-2 bg-gray-50 border-b">
                <span className="text-xs font-medium text-gray-600">{date}</span>
                <span className="text-xs font-semibold text-gray-600">{toJPY(dayTotal)}</span>
              </div>
              {grouped[date].map(t => (
                <div key={t.id} className={`flex items-center gap-3 px-4 py-2 border-b last:border-0 ${t.category === "未分類" ? "bg-orange-50" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${t.card_type === "joint" ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"}`}>
                        {t.card_type === "joint" ? "共用" : "個人"}
                      </span>
                      {t.card_name && (
                        <span className="text-xs px-1.5 py-0.5 rounded text-white font-medium shrink-0"
                          style={{ backgroundColor: t.color ?? "#6366f1" }}>
                          {t.card_name}
                        </span>
                      )}
                      <span className={`text-sm font-medium truncate ${
                        t.category === "未分類" ? "text-orange-500 font-semibold" : "text-gray-800"
                      }`}>
                        {t.category === "未分類" ? "⚠ 未分類" : t.category}
                      </span>
                      {t.source === "csv" && <span className="text-xs text-blue-400 shrink-0">CSV</span>}
                      {t.source === "recurring" && <span className="text-xs text-green-400 shrink-0">定期</span>}
                    </div>
                    {t.memo && <p className="text-xs text-gray-500 truncate">{t.memo}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-sm font-semibold text-gray-800">{toJPY(t.amount)}</span>
                    <button onClick={() => openEditModal(t)}
                      className="text-gray-300 hover:text-blue-500 transition-colors text-sm leading-none w-6 text-center" title="編集">✏</button>
                    <button onClick={() => handleDelete(t.id)}
                      className="text-gray-300 hover:text-red-400 transition-colors text-xl leading-none w-6 text-center">×</button>
                  </div>
                </div>
              ))}
            </div>
          )
        })}

        {!loading && transactions.length === 0 && !isPC && (
          <div className="text-center py-6 text-gray-500 text-sm">明細がありません</div>
        )}
      </div>
      <BottomNav />

      {/* 編集モーダル */}
      {editingTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={e => { if (e.target === e.currentTarget) setEditingTransaction(null) }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-gray-800">明細を編集</h2>
              <button onClick={() => setEditingTransaction(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            {/* 日付 */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">日付</label>
              <input type="date" value={editForm.date}
                onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white outline-none focus:ring-2 focus:ring-blue-400" />
            </div>

            {/* 支払方法 */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">支払方法</label>
              <select value={editForm.card_id}
                onChange={e => setEditForm(f => ({ ...f, card_id: Number(e.target.value) }))}
                className="w-full border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white outline-none focus:ring-2 focus:ring-blue-400">
                {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* カテゴリ */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">カテゴリ</label>
              <select value={editForm.category}
                onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white outline-none focus:ring-2 focus:ring-blue-400">
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* 金額 */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">金額</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">¥</span>
                <input
                  type="text" inputMode="numeric" value={editForm.amount}
                  onChange={e => {
                    const raw = e.target.value.replace(/,/g, "")
                    if (raw === "" || /^\d+$/.test(raw)) {
                      setEditForm(f => ({ ...f, amount: raw === "" ? "" : Number(raw).toLocaleString("ja-JP") }))
                    }
                  }}
                  className="w-full border rounded-lg pl-7 pr-3 py-2 text-sm text-gray-800 bg-white outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>

            {/* メモ */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">メモ</label>
              <input type="text" value={editForm.memo}
                onChange={e => setEditForm(f => ({ ...f, memo: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white outline-none focus:ring-2 focus:ring-blue-400" />
            </div>

            {/* ボタン */}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setEditingTransaction(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                キャンセル
              </button>
              <button onClick={handleEditSave} disabled={editSaving}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                {editSaving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
