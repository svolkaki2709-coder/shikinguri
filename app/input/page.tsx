"use client"

import { useEffect, useState, useMemo } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"

interface Card { id: number; name: string; card_type: string; color: string; has_csv: boolean }
interface CategoryRow { name: string; card_type: string; group_type?: string | null }
interface PendingRecurring {
  id: number
  day_of_month: number
  card_id: number
  card_name: string
  color: string
  category: string
  amount: number
  memo: string
}
interface IncomeRecord { id: number; date: string; amount: number; category: string; memo: string }

export default function InputPage() {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  // メインタブ: 支出 / 収入
  const [mainTab, setMainTab] = useState<"expense" | "income">("expense")

  // カード・カテゴリ共通
  const [cards, setCards] = useState<Card[]>([])
  const [allCategoryRows, setAllCategoryRows] = useState<CategoryRow[]>([])

  // ── 支出フォーム ──
  const [usageType, setUsageType] = useState<"joint" | "self">("self")
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null)
  const [date, setDate] = useState(now.toISOString().split("T")[0])
  const [category, setCategory] = useState("")
  const [amount, setAmount] = useState("")
  const [memo, setMemo] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // 定期支出候補
  const [pendingRecurring, setPendingRecurring] = useState<PendingRecurring[]>([])
  const [confirmingId, setConfirmingId] = useState<number | null>(null)

  // ── 収入フォーム ──
  const [incomeCardType, setIncomeCardType] = useState<"self" | "joint">("self")
  const [incomeMonth, setIncomeMonth] = useState(currentMonth)
  const [incomeAmount, setIncomeAmount] = useState("")
  const [incomeCategory, setIncomeCategory] = useState("給与")
  const [incomeMemo, setIncomeMemo] = useState("")
  const [incomeSaving, setIncomeSaving] = useState(false)
  const [incomeMsg, setIncomeMsg] = useState("")
  const [monthIncomeRecords, setMonthIncomeRecords] = useState<IncomeRecord[]>([])

  useEffect(() => {
    Promise.all([
      fetch("/api/cards").then(r => r.json()),
      fetch("/api/categories").then(r => r.json()),
      fetch(`/api/recurring?pending=true&month=${currentMonth}`).then(r => r.json()),
    ]).then(([cardData, catData, recurringData]) => {
      setCards(cardData.cards ?? [])
      setAllCategoryRows(catData.rows ?? [])
      setPendingRecurring(recurringData.recurring ?? [])
    })
  }, [currentMonth])

  // 収入タブの履歴取得
  useEffect(() => {
    if (mainTab !== "income") return
    fetch(`/api/income?month=${incomeMonth}&card_type=${incomeCardType}`)
      .then(r => r.json())
      .then(d => setMonthIncomeRecords(d.incomes ?? []))
  }, [mainTab, incomeMonth, incomeCardType])

  // usageType に対応するカード一覧（CSV管理カードは除外）
  const usageCards = useMemo(() => {
    return cards.filter(c => c.card_type === usageType && !c.has_csv)
  }, [cards, usageType])

  // 選択中カード（selectedCardId が null なら先頭カードを使用）
  const selectedCard = useMemo(() => {
    if (selectedCardId) return cards.find(c => c.id === selectedCardId) ?? usageCards[0] ?? null
    return usageCards[0] ?? null
  }, [cards, selectedCardId, usageCards])

  // カテゴリの実効符号（+1=収入, -1=支出, 0=振替）
  function effSign(r: CategoryRow): number {
    if (r.sign === "plus") return 1
    if (r.sign === "minus") return -1
    if (r.group_type === "収入") return 1
    if (r.group_type === "振替") return 0
    return -1
  }

  // 支出カテゴリ一覧（マイナス符号のみ）
  const filteredCategories = useMemo(() => {
    return allCategoryRows
      .filter(r => r.card_type === usageType && effSign(r) < 0)
      .map(r => r.name)
  }, [usageType, allCategoryRows])

  // 収入カテゴリ一覧（プラス符号のみ）
  const incomeCategories = useMemo(() => {
    return allCategoryRows
      .filter(r => r.card_type === incomeCardType && effSign(r) > 0)
      .map(r => r.name)
  }, [incomeCardType, allCategoryRows])

  // 収入カテゴリ変更時のデフォルト（DBの先頭カテゴリ）
  useEffect(() => {
    if (incomeCategories.length > 0) setIncomeCategory(incomeCategories[0])
  }, [incomeCardType, incomeCategories])

  // usageType が変わったらカテゴリ・支払方法をリセット
  useEffect(() => {
    if (filteredCategories.length > 0) setCategory(filteredCategories[0])
    setSelectedCardId(null)
  }, [usageType, filteredCategories])

  // ── 支出登録 ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!date || !selectedCard || !category || !amount) return
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, card_id: selectedCard.id, category, amount: Number(amount), memo }),
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

  // ── 定期支出候補の確定 ──
  async function handleConfirmRecurring(r: PendingRecurring) {
    setConfirmingId(r.id)
    try {
      const day = String(r.day_of_month).padStart(2, "0")
      const txDate = `${currentMonth}-${day}`
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: txDate, card_id: r.card_id, category: r.category, amount: r.amount, memo: r.memo, source: "recurring" }),
      })
      if (res.ok) {
        setPendingRecurring(prev => prev.filter(p => p.id !== r.id))
        setMessage({ type: "success", text: `「${r.category}」を登録しました` })
      } else {
        setMessage({ type: "error", text: "登録に失敗しました" })
      }
    } catch {
      setMessage({ type: "error", text: "通信エラーが発生しました" })
    } finally {
      setConfirmingId(null)
    }
  }

  // ── 収入登録 ──
  async function handleSaveIncome() {
    if (!incomeAmount) return
    setIncomeSaving(true)
    setIncomeMsg("")
    await fetch("/api/income", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: `${incomeMonth}-01`, amount: Number(incomeAmount.replace(/,/g, "")), category: incomeCategory, memo: incomeMemo, card_type: incomeCardType }),
    })
    setIncomeMsg("保存しました")
    setIncomeAmount("")
    setIncomeMemo("")
    setIncomeSaving(false)
    const d = await fetch(`/api/income?month=${incomeMonth}&card_type=${incomeCardType}`).then(r => r.json())
    setMonthIncomeRecords(d.incomes ?? [])
  }

  async function handleDeleteIncome(id: number) {
    if (!confirm("この収入記録を削除しますか？")) return
    await fetch(`/api/income?id=${id}`, { method: "DELETE" })
    setMonthIncomeRecords(prev => prev.filter(r => r.id !== id))
  }

  function prevMonth(m: string) {
    const [y, mo] = m.split("-").map(Number)
    const d = new Date(y, mo - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  }
  function nextMonth(m: string) {
    const [y, mo] = m.split("-").map(Number)
    const d = new Date(y, mo, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  }

  const jointColor = cards.find(c => c.card_type === "joint")?.color ?? "#f59e0b"
  const selfColor = cards.find(c => c.card_type === "self")?.color ?? "#6366f1"

  return (
    <div className="pb-20">
      <PageHeader title="入力" />
      <main className="max-w-md mx-auto px-4 py-2 space-y-3">

        {/* メインタブ: 支出 / 収入 */}
        <div className="flex rounded-xl bg-gray-100 p-1">
          <button onClick={() => setMainTab("expense")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${mainTab === "expense" ? "bg-white shadow-sm text-blue-600" : "text-gray-600"}`}>
            💸 支出
          </button>
          <button onClick={() => setMainTab("income")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${mainTab === "income" ? "bg-white shadow-sm text-green-600" : "text-gray-600"}`}>
            💰 収入
          </button>
        </div>

        {/* ═══ 支出タブ ═══ */}
        {mainTab === "expense" && (
          <>
            {/* 定期支出候補 */}
            {pendingRecurring.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-amber-700">📋 今月の定期支出（未登録）</p>
                {pendingRecurring.map(r => (
                  <div key={r.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-amber-100">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] px-1.5 py-0.5 rounded text-white font-bold shrink-0"
                        style={{ backgroundColor: r.color ?? "#6366f1" }}>
                        {r.card_name}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{r.category}</p>
                        <p className="text-[10px] text-gray-400">{r.day_of_month}日{r.memo ? ` / ${r.memo}` : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-xs font-semibold text-gray-700">¥{r.amount.toLocaleString("ja-JP")}</span>
                      <button onClick={() => handleConfirmRecurring(r)} disabled={confirmingId === r.id}
                        className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-lg font-semibold disabled:opacity-50 transition-colors">
                        {confirmingId === r.id ? "..." : "確定"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 支出フォーム */}
            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-4 space-y-4">
              <p className="text-xs text-gray-500">現金・電子マネー・PayPay等、カード以外の支出を記録します</p>

              {/* 共用 / 個人 トグル */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">用途</label>
                <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
                  <button type="button" onClick={() => setUsageType("joint")}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all"
                    style={{
                      backgroundColor: usageType === "joint" ? jointColor + "22" : "transparent",
                      color: usageType === "joint" ? jointColor : "#6b7280",
                      boxShadow: usageType === "joint" ? `0 0 0 2px ${jointColor}` : "none",
                    }}>
                    共用
                  </button>
                  <button type="button" onClick={() => setUsageType("self")}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all"
                    style={{
                      backgroundColor: usageType === "self" ? selfColor + "22" : "transparent",
                      color: usageType === "self" ? selfColor : "#6b7280",
                      boxShadow: usageType === "self" ? `0 0 0 2px ${selfColor}` : "none",
                    }}>
                    個人
                  </button>
                </div>
              </div>

              {/* 支払方法 */}
              {usageCards.length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">支払方法</label>
                  <div className="flex gap-2 flex-wrap">
                    {usageCards.map(c => (
                      <button key={c.id} type="button"
                        onClick={() => setSelectedCardId(c.id)}
                        className="flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all"
                        style={{
                          borderColor: selectedCard?.id === c.id ? c.color : "#e5e7eb",
                          backgroundColor: selectedCard?.id === c.id ? c.color + "18" : "white",
                          color: selectedCard?.id === c.id ? c.color : "#6b7280",
                        }}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 日付 */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">日付</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required />
              </div>

              {/* カテゴリ */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">カテゴリ</label>
                {filteredCategories.length === 0 ? (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                    カテゴリが未設定です。設定 → カテゴリ から追加してください。
                  </p>
                ) : (
                  <select value={category} onChange={e => setCategory(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required>
                    {filteredCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
              </div>

              {/* 金額 */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">金額（円）</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm">¥</span>
                  <input type="text" inputMode="numeric"
                    value={amount ? Number(amount.replace(/,/g, "")).toLocaleString("ja-JP") : ""}
                    onChange={e => { const raw = e.target.value.replace(/,/g, ""); if (raw === "" || /^\d+$/.test(raw)) setAmount(raw) }}
                    placeholder="0"
                    className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required />
                </div>
              </div>

              {/* メモ */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">メモ（任意）</label>
                <input type="text" value={memo} onChange={e => setMemo(e.target.value)}
                  placeholder="例：スーパーで食材"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {message && (
                <div className={`text-sm rounded-lg px-3 py-2 ${message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  {message.type === "success" ? "✅ " : "❌ "}{message.text}
                </div>
              )}

              <button type="submit" disabled={loading || !selectedCard || filteredCategories.length === 0}
                className="w-full bg-blue-600 text-white rounded-lg py-2.5 font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {loading ? "保存中..." : "記録する"}
              </button>
            </form>
          </>
        )}

        {/* ═══ 収入タブ ═══ */}
        {mainTab === "income" && (
          <div className="space-y-3">
            {/* 収入フォーム */}
            <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">

              {/* 個人 / 共用 トグル */}
              <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
                <button type="button" onClick={() => setIncomeCardType("self")}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${incomeCardType === "self" ? "bg-white shadow-sm text-indigo-600" : "text-gray-600"}`}>
                  個人収入
                </button>
                <button type="button" onClick={() => setIncomeCardType("joint")}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${incomeCardType === "joint" ? "bg-white shadow-sm text-amber-600" : "text-gray-600"}`}>
                  共用入金
                </button>
              </div>

              {/* 月 */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">月</label>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setIncomeMonth(prevMonth(incomeMonth))}
                    className="text-gray-500 hover:text-blue-600 px-2 py-1.5 rounded-lg hover:bg-gray-100 font-bold">‹</button>
                  <input type="month" value={incomeMonth} onChange={e => setIncomeMonth(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 text-center focus:outline-none focus:ring-2 focus:ring-green-500" />
                  <button type="button" onClick={() => setIncomeMonth(nextMonth(incomeMonth))}
                    className="text-gray-500 hover:text-blue-600 px-2 py-1.5 rounded-lg hover:bg-gray-100 font-bold">›</button>
                </div>
              </div>

              {/* カテゴリ */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">カテゴリ</label>
                {incomeCategories.length > 0 ? (
                  <div className="flex gap-2 flex-wrap">
                    {incomeCategories.map(cat => (
                      <button key={cat} type="button" onClick={() => setIncomeCategory(cat)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                          incomeCategory === cat
                            ? incomeCardType === "self"
                              ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                              : "border-amber-500 bg-amber-50 text-amber-700"
                            : "border-gray-200 text-gray-600"
                        }`}>
                        {cat}
                      </button>
                    ))}
                  </div>
                ) : (
                  <select value={incomeCategory} onChange={e => setIncomeCategory(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500">
                    <option value="">カテゴリを選択</option>
                  </select>
                )}
              </div>

              {/* 金額 */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">金額（円）</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm">¥</span>
                  <input type="text" inputMode="numeric"
                    value={incomeAmount ? Number(incomeAmount.replace(/,/g, "")).toLocaleString("ja-JP") : ""}
                    onChange={e => { const raw = e.target.value.replace(/,/g, ""); if (raw === "" || /^\d+$/.test(raw)) setIncomeAmount(raw) }}
                    placeholder="0"
                    className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>

              {/* メモ */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">メモ（任意）</label>
                <input type="text" value={incomeMemo} onChange={e => setIncomeMemo(e.target.value)}
                  placeholder="例：3月分給与"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>

              {incomeMsg && <p className="text-xs text-green-600">✅ {incomeMsg}</p>}

              <button onClick={handleSaveIncome} disabled={incomeSaving || !incomeAmount}
                className="w-full bg-green-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors">
                {incomeSaving ? "保存中..." : "収入を記録"}
              </button>
            </div>

            {/* 収入履歴 */}
            {monthIncomeRecords.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <p className="text-xs font-semibold text-gray-600 px-4 py-2.5 border-b bg-gray-50">
                  {incomeMonth} の収入記録
                </p>
                {monthIncomeRecords.map(r => (
                  <div key={r.id} className="flex items-center justify-between px-4 py-2.5 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{r.category}</p>
                      {r.memo && <p className="text-xs text-gray-400">{r.memo}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-green-600">
                        +¥{Number(r.amount).toLocaleString("ja-JP")}
                      </span>
                      <button onClick={() => handleDeleteIncome(r.id)}
                        className="text-gray-300 hover:text-red-400 text-xl leading-none w-6">×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {monthIncomeRecords.length === 0 && (
              <p className="text-center text-xs text-gray-400 py-4">この月の収入記録はありません</p>
            )}
          </div>
        )}

      </main>
      <BottomNav />
    </div>
  )
}
