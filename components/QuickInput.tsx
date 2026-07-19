"use client"

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react"

// 保存成功時に全画面へ通知するイベント名（ダッシュボード等が再取得に使う）
export const DATA_CHANGED_EVENT = "kakeibo:data-changed"

interface Card { id: number; name: string; card_type: string; color: string; has_csv: boolean }
interface CategoryRow { name: string; card_type: string; group_type?: string | null; sign?: string | null }

function effSign(r: CategoryRow): number {
  if (r.sign === "plus") return 1
  if (r.sign === "minus") return -1
  if (r.group_type === "収入") return 1
  if (r.group_type === "振替") return 0
  return -1
}

interface QuickInputContextType {
  open: (tab?: "expense" | "income") => void
}

const QuickInputContext = createContext<QuickInputContextType>({ open: () => {} })

export function useQuickInput() {
  return useContext(QuickInputContext)
}

export function QuickInputProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [tab, setTab] = useState<"expense" | "income">("expense")

  function open(t: "expense" | "income" = "expense") {
    setTab(t)
    setIsOpen(true)
  }

  return (
    <QuickInputContext.Provider value={{ open }}>
      {children}
      {isOpen && <QuickInputModal tab={tab} setTab={setTab} onClose={() => setIsOpen(false)} />}
    </QuickInputContext.Provider>
  )
}

// ─── モーダル本体 ────────────────────────────────────────────────
function QuickInputModal({ tab, setTab, onClose }: {
  tab: "expense" | "income"
  setTab: (t: "expense" | "income") => void
  onClose: () => void
}) {
  const today = new Date().toISOString().split("T")[0]

  const [cards, setCards] = useState<Card[]>([])
  const [catRows, setCatRows] = useState<CategoryRow[]>([])
  const [loaded, setLoaded] = useState(false)

  // ── 支出フォーム ──
  const [usageType, setUsageType] = useState<"self" | "joint">("self")
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null)
  const [date, setDate] = useState(today)
  const [category, setCategory] = useState("")
  const [amount, setAmount] = useState("")
  const [memo, setMemo] = useState("")

  // ── 入金フォーム ──
  const [incomeCardType, setIncomeCardType] = useState<"self" | "joint">("self")
  const [incomeDate, setIncomeDate] = useState(today)
  const [incomeCategory, setIncomeCategory] = useState("")
  const [incomeAmount, setIncomeAmount] = useState("")
  const [incomeMemo, setIncomeMemo] = useState("")

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    Promise.all([
      fetch("/api/cards").then(r => r.json()),
      fetch("/api/categories").then(r => r.json()),
    ]).then(([cardData, catData]) => {
      setCards(cardData.cards ?? [])
      setCatRows(catData.rows ?? [])
      setLoaded(true)
    })
  }, [])

  // 背景スクロール禁止
  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [])

  const usageCards = useMemo(
    () => cards.filter(c => c.card_type === usageType && !c.has_csv),
    [cards, usageType]
  )
  const selectedCard = useMemo(() => {
    if (selectedCardId) return cards.find(c => c.id === selectedCardId) ?? usageCards[0] ?? null
    return usageCards[0] ?? null
  }, [cards, selectedCardId, usageCards])

  const expenseCategories = useMemo(
    () => catRows.filter(r => r.card_type === usageType && effSign(r) < 0).map(r => r.name),
    [catRows, usageType]
  )
  const incomeCategories = useMemo(
    () => catRows.filter(r => r.card_type === incomeCardType && effSign(r) > 0).map(r => r.name),
    [catRows, incomeCardType]
  )

  useEffect(() => {
    if (expenseCategories.length > 0 && !expenseCategories.includes(category)) {
      setCategory(expenseCategories[0])
    }
    setSelectedCardId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usageType, expenseCategories])

  useEffect(() => {
    if (incomeCategories.length > 0 && !incomeCategories.includes(incomeCategory)) {
      setIncomeCategory(incomeCategories[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomeCardType, incomeCategories])

  function notifyDataChanged() {
    window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT))
  }

  async function handleSaveExpense() {
    if (!date || !selectedCard || !category || !amount) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, card_id: selectedCard.id, category, amount: Number(amount), memo }),
      })
      if (res.ok) {
        setMessage({ type: "success", text: `${category} ¥${Number(amount).toLocaleString()} を記録しました` })
        setAmount("")
        setMemo("")
        notifyDataChanged()
      } else {
        const d = await res.json()
        setMessage({ type: "error", text: d.error ?? "保存に失敗しました" })
      }
    } catch {
      setMessage({ type: "error", text: "通信エラーが発生しました" })
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveIncome() {
    if (!incomeDate || !incomeCategory || !incomeAmount) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch("/api/income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: incomeDate, amount: Number(incomeAmount), category: incomeCategory,
          memo: incomeMemo, card_type: incomeCardType,
        }),
      })
      if (res.ok) {
        setMessage({ type: "success", text: `${incomeCategory} ¥${Number(incomeAmount).toLocaleString()} を記録しました` })
        setIncomeAmount("")
        setIncomeMemo("")
        notifyDataChanged()
      } else {
        setMessage({ type: "error", text: "保存に失敗しました" })
      }
    } catch {
      setMessage({ type: "error", text: "通信エラーが発生しました" })
    } finally {
      setSaving(false)
    }
  }

  const amountInput = (value: string, onChange: (v: string) => void, ring: string) => (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">¥</span>
      <input
        type="text" inputMode="numeric" placeholder="0" autoComplete="off"
        value={value ? Number(value).toLocaleString("ja-JP") : ""}
        onChange={e => { const raw = e.target.value.replace(/,/g, ""); if (raw === "" || /^\d+$/.test(raw)) onChange(raw) }}
        className={`w-full border border-slate-700 rounded-xl pl-8 pr-3 py-3 text-lg font-semibold text-slate-100 focus:outline-none focus:ring-2 ${ring}`}
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* 背景 */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* シート */}
      <div className="relative w-full sm:max-w-md bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        {/* ヘッダー */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-4 pt-3 pb-2 rounded-t-2xl">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-2 sm:hidden" />
          <div className="flex items-center justify-between">
            <div className="flex rounded-lg bg-slate-800 p-0.5">
              <button onClick={() => { setTab("expense"); setMessage(null) }}
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${tab === "expense" ? "bg-slate-900 shadow-sm text-blue-400" : "text-slate-400"}`}>
                💸 支出
              </button>
              <button onClick={() => { setTab("income"); setMessage(null) }}
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${tab === "income" ? "bg-slate-900 shadow-sm text-green-400" : "text-slate-400"}`}>
                💰 入金
              </button>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-400 text-2xl leading-none px-2">×</button>
          </div>
        </div>

        <div className="px-4 py-4 space-y-4">
          {!loaded && <p className="text-center text-sm text-slate-500 py-8">読み込み中...</p>}

          {/* ═══ 支出 ═══ */}
          {loaded && tab === "expense" && (
            <>
              {/* 個人/共用 */}
              <div className="flex rounded-xl bg-slate-800 p-1 gap-1">
                {([["self", "個人", "text-indigo-400"], ["joint", "共用", "text-amber-400"]] as const).map(([k, label, color]) => (
                  <button key={k} type="button" onClick={() => setUsageType(k)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${usageType === k ? `bg-slate-900 shadow-sm ${color}` : "text-slate-400"}`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* 金額（最初に・大きく） */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">金額</label>
                {amountInput(amount, setAmount, "focus:ring-blue-500")}
              </div>

              {/* カテゴリ */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">カテゴリ</label>
                {expenseCategories.length === 0 ? (
                  <p className="text-xs text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2">カテゴリ未設定です。設定から追加してください。</p>
                ) : (
                  <div className="flex gap-1.5 flex-wrap">
                    {expenseCategories.map(c => (
                      <button key={c} type="button" onClick={() => setCategory(c)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          category === c ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}>
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 支払方法 */}
              {usageCards.length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">支払方法</label>
                  <div className="flex gap-2 flex-wrap">
                    {usageCards.map(c => (
                      <button key={c.id} type="button" onClick={() => setSelectedCardId(c.id)}
                        className="flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all"
                        style={{
                          borderColor: selectedCard?.id === c.id ? c.color : "#334155",
                          backgroundColor: selectedCard?.id === c.id ? c.color + "18" : "#1e293b",
                          color: selectedCard?.id === c.id ? c.color : "#94a3b8",
                        }}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 日付・メモ */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">日付</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="w-full border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">メモ（任意）</label>
                  <input type="text" value={memo} onChange={e => setMemo(e.target.value)} placeholder="例：スーパー"
                    className="w-full border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {message && (
                <div className={`text-sm rounded-lg px-3 py-2 ${message.type === "success" ? "bg-green-500/10 text-green-300" : "bg-red-500/10 text-red-300"}`}>
                  {message.type === "success" ? "✅ " : "❌ "}{message.text}
                </div>
              )}

              <button onClick={handleSaveExpense}
                disabled={saving || !selectedCard || !category || !amount}
                className="w-full bg-blue-600 text-white rounded-xl py-3 font-bold text-sm hover:bg-blue-700 disabled:opacity-40 transition-colors">
                {saving ? "保存中..." : "支出を記録する"}
              </button>
            </>
          )}

          {/* ═══ 入金 ═══ */}
          {loaded && tab === "income" && (
            <>
              <div className="flex rounded-xl bg-slate-800 p-1 gap-1">
                {([["self", "個人", "text-indigo-400"], ["joint", "共用", "text-amber-400"]] as const).map(([k, label, color]) => (
                  <button key={k} type="button" onClick={() => setIncomeCardType(k)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${incomeCardType === k ? `bg-slate-900 shadow-sm ${color}` : "text-slate-400"}`}>
                    {label}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">金額</label>
                {amountInput(incomeAmount, setIncomeAmount, "focus:ring-green-500")}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">カテゴリ</label>
                {incomeCategories.length === 0 ? (
                  <p className="text-xs text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2">入金カテゴリ未設定です。設定から追加してください。</p>
                ) : (
                  <div className="flex gap-1.5 flex-wrap">
                    {incomeCategories.map(c => (
                      <button key={c} type="button" onClick={() => setIncomeCategory(c)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          incomeCategory === c ? "border-green-500 bg-green-500/10 text-green-300" : "border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}>
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">日付</label>
                  <input type="date" value={incomeDate} onChange={e => setIncomeDate(e.target.value)}
                    className="w-full border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">メモ（任意）</label>
                  <input type="text" value={incomeMemo} onChange={e => setIncomeMemo(e.target.value)} placeholder="例：7月分給与"
                    className="w-full border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>

              {message && (
                <div className={`text-sm rounded-lg px-3 py-2 ${message.type === "success" ? "bg-green-500/10 text-green-300" : "bg-red-500/10 text-red-300"}`}>
                  {message.type === "success" ? "✅ " : "❌ "}{message.text}
                </div>
              )}

              <button onClick={handleSaveIncome}
                disabled={saving || !incomeCategory || !incomeAmount}
                className="w-full bg-green-600 text-white rounded-xl py-3 font-bold text-sm hover:bg-green-700 disabled:opacity-40 transition-colors">
                {saving ? "保存中..." : "入金を記録する"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
