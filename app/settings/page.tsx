"use client"

import { useEffect, useState } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"

interface Card { id: number; name: string; card_type: string; color: string }
interface Recurring { id: number; day_of_month: number; card_id: number; card_name: string; color: string; category: string; amount: number; memo: string }
interface Category { name: string }
interface BudgetRow { category: string; card_type: string; budget: number }

function toJPY(n: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n)
}

type Tab = "recurring" | "income" | "budget"

export default function SettingsPage() {
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const [tab, setTab] = useState<Tab>("recurring")
  const [cards, setCards] = useState<Card[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [recurring, setRecurring] = useState<Recurring[]>([])

  // 定期支出フォーム
  const [rDay, setRDay] = useState("1")
  const [rCardId, setRCardId] = useState<number | null>(null)
  const [rCategory, setRCategory] = useState("")
  const [rAmount, setRAmount] = useState("")
  const [rMemo, setRMemo] = useState("")
  const [rSaving, setRSaving] = useState(false)

  // 収入フォーム
  const [incomeMonth, setIncomeMonth] = useState(defaultMonth)
  const [incomeAmount, setIncomeAmount] = useState("")
  const [incomeCategory, setIncomeCategory] = useState("給与")
  const [incomeMemo, setIncomeMemo] = useState("")
  const [incomeSaving, setIncomeSaving] = useState(false)
  const [incomeMsg, setIncomeMsg] = useState("")

  // 予算フォーム
  const [budgetCategory, setBudgetCategory] = useState("")
  const [budgetAmount, setBudgetAmount] = useState("")
  const [budgetCardType, setBudgetCardType] = useState("self")
  const [budgetSaving, setBudgetSaving] = useState(false)
  const [budgetMsg, setBudgetMsg] = useState("")
  const [existingBudgets, setExistingBudgets] = useState<BudgetRow[]>([])

  useEffect(() => {
    Promise.all([
      fetch("/api/cards").then(r => r.json()),
      fetch("/api/categories").then(r => r.json()),
      fetch("/api/recurring").then(r => r.json()),
      fetch("/api/budget").then(r => r.json()),
    ]).then(([cd, catd, recd, budgetData]) => {
      const c = cd.cards ?? []
      setCards(c)
      if (c.length > 0) setRCardId(c[0].id)
      const cats = catd.categories ?? []
      setCategories(cats)
      if (cats.length > 0) { setRCategory(cats[0]); setBudgetCategory(cats[0]) }
      setRecurring(recd.recurring ?? [])
      const bRaw: Array<{ category: string; cardType: string; budget: number }> = budgetData.budgets ?? []
      setExistingBudgets(bRaw.map(b => ({ category: b.category, card_type: b.cardType, budget: b.budget })))
    })
  }, [])

  async function handleAddRecurring() {
    if (!rCardId || !rCategory || !rAmount) return
    setRSaving(true)
    await fetch("/api/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day_of_month: Number(rDay), card_id: rCardId, category: rCategory, amount: Number(rAmount), memo: rMemo }),
    })
    setRAmount("")
    setRMemo("")
    const d = await fetch("/api/recurring").then(r => r.json())
    setRecurring(d.recurring ?? [])
    setRSaving(false)
  }

  async function handleDeleteRecurring(id: number) {
    if (!confirm("定期支出を削除しますか？")) return
    await fetch(`/api/recurring?id=${id}`, { method: "DELETE" })
    setRecurring(prev => prev.filter(r => r.id !== id))
  }

  async function handleGenerateRecurring() {
    const m = prompt("生成する月を入力してください（例: 2025-01）", defaultMonth)
    if (!m) return
    const res = await fetch("/api/recurring", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: m }),
    })
    const d = await res.json()
    alert(`${d.count}件の定期支出を ${m} に生成しました`)
  }

  async function handleSaveIncome() {
    if (!incomeAmount) return
    setIncomeSaving(true)
    setIncomeMsg("")
    await fetch("/api/income", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: `${incomeMonth}-01`, amount: Number(incomeAmount), category: incomeCategory, memo: incomeMemo }),
    })
    setIncomeMsg("保存しました")
    setIncomeAmount("")
    setIncomeMemo("")
    setIncomeSaving(false)
  }

  async function handleSaveBudget() {
    if (!budgetCategory || !budgetAmount) return
    setBudgetSaving(true)
    setBudgetMsg("")
    await fetch("/api/budget", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: budgetCategory, amount: Number(budgetAmount), card_type: budgetCardType }),
    })
    setBudgetMsg("保存しました")
    setBudgetAmount("")
    setBudgetSaving(false)
    // 一覧を更新
    const d = await fetch("/api/budget").then(r => r.json())
    const bRaw: Array<{ category: string; cardType: string; budget: number }> = d.budgets ?? []
    setExistingBudgets(bRaw.map(b => ({ category: b.category, card_type: b.cardType, budget: b.budget })))
  }

  async function handleDeleteBudget(category: string, cardType: string) {
    if (!confirm(`「${category}」の予算を削除しますか？`)) return
    await fetch(`/api/budget?category=${encodeURIComponent(category)}&card_type=${cardType}`, { method: "DELETE" })
    setExistingBudgets(prev => prev.filter(b => !(b.category === category && b.card_type === cardType)))
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "recurring", label: "定期支出" },
    { key: "income", label: "収入入力" },
    { key: "budget", label: "予算設定" },
  ]

  return (
    <div className="pb-20">
      <PageHeader title="設定" />
      <main className="max-w-md mx-auto px-4 py-4 space-y-4">
        {/* タブ */}
        <div className="flex rounded-xl bg-gray-100 p-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? "bg-white shadow-sm text-blue-600" : "text-gray-500"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* === 定期支出タブ === */}
        {tab === "recurring" && (
          <>
            <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">定期支出を追加</h2>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="text-xs text-gray-500 mb-1 block">引き落とし日</label>
                  <select value={rDay} onChange={e => setRDay(e.target.value)}
                    className="w-full border rounded-lg px-2 py-2 text-sm bg-white">
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>{d}日</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">カード</label>
                  <div className="flex gap-1">
                    {cards.map(c => (
                      <button key={c.id} type="button" onClick={() => setRCardId(c.id)}
                        className="flex-1 py-2 rounded-lg text-xs font-medium border transition-all"
                        style={{
                          borderColor: rCardId === c.id ? c.color : "#e5e7eb",
                          backgroundColor: rCardId === c.id ? c.color + "18" : "white",
                          color: rCardId === c.id ? c.color : "#6b7280",
                        }}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">カテゴリ</label>
                  <select value={rCategory} onChange={e => setRCategory(e.target.value)}
                    className="w-full border rounded-lg px-2 py-2 text-sm bg-white">
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">金額（円）</label>
                  <input type="number" value={rAmount} onChange={e => setRAmount(e.target.value)}
                    placeholder="0" className="w-full border rounded-lg px-2 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">メモ（任意）</label>
                <input type="text" value={rMemo} onChange={e => setRMemo(e.target.value)}
                  placeholder="例：Netflix サブスク"
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <button onClick={handleAddRecurring} disabled={rSaving || !rCardId || !rAmount}
                className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">
                {rSaving ? "追加中..." : "定期支出を追加"}
              </button>
            </div>

            {/* 定期支出一覧 */}
            {recurring.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b flex justify-between items-center">
                  <h2 className="text-sm font-semibold text-gray-700">登録済み定期支出</h2>
                  <button onClick={handleGenerateRecurring}
                    className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium">
                    今月分を生成
                  </button>
                </div>
                {recurring.map(r => (
                  <div key={r.id} className="flex items-center px-4 py-3 border-b last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs px-1.5 py-0.5 rounded text-white"
                          style={{ backgroundColor: r.color ?? "#6366f1" }}>
                          {r.card_name}
                        </span>
                        <span className="text-sm font-medium text-gray-800">{r.category}</span>
                      </div>
                      <p className="text-xs text-gray-400">{r.day_of_month}日 {r.memo && `/ ${r.memo}`}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-700">{toJPY(r.amount)}</span>
                      <button onClick={() => handleDeleteRecurring(r.id)}
                        className="text-gray-300 hover:text-red-400 text-xl leading-none w-6">×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* === 収入入力タブ === */}
        {tab === "income" && (
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">収入を記録</h2>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">月</label>
              <div className="flex items-center gap-1 border rounded-lg px-2 py-1">
                <button onClick={() => setIncomeMonth(m => { const [y,mo] = m.split("-").map(Number); const d = new Date(y, mo-2, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}` })}
                  className="text-gray-600 hover:text-blue-600 px-1 font-bold text-base">‹</button>
                <input type="month" value={incomeMonth} onChange={e => setIncomeMonth(e.target.value)}
                  className="flex-1 text-center text-sm font-semibold text-gray-800 border-0 outline-none bg-transparent min-w-0" />
                <button onClick={() => setIncomeMonth(m => { const [y,mo] = m.split("-").map(Number); const d = new Date(y, mo, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}` })}
                  className="text-gray-600 hover:text-blue-600 px-1 font-bold text-base">›</button>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">種別</label>
              <div className="flex gap-2">
                {["給与", "副収入", "その他"].map(cat => (
                  <button key={cat} type="button" onClick={() => setIncomeCategory(cat)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${incomeCategory === cat ? "bg-green-600 text-white border-green-600" : "border-gray-300 text-gray-600"}`}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">金額（円）</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">¥</span>
                <input type="number" value={incomeAmount} onChange={e => setIncomeAmount(e.target.value)}
                  placeholder="0" className="w-full border rounded-lg pl-7 pr-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">メモ（任意）</label>
              <input type="text" value={incomeMemo} onChange={e => setIncomeMemo(e.target.value)}
                placeholder="例：3月分給与"
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            {incomeMsg && <p className="text-xs text-green-600">✅ {incomeMsg}</p>}
            <button onClick={handleSaveIncome} disabled={incomeSaving || !incomeAmount}
              className="w-full bg-green-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">
              {incomeSaving ? "保存中..." : "収入を記録"}
            </button>
          </div>
        )}

        {/* === 予算設定タブ === */}
        {tab === "budget" && (
          <>
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">予算を設定</h2>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">対象</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setBudgetCardType("self")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${budgetCardType === "self" ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-300 text-gray-600"}`}>
                  個人
                </button>
                <button type="button" onClick={() => setBudgetCardType("joint")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${budgetCardType === "joint" ? "bg-amber-500 text-white border-amber-500" : "border-gray-300 text-gray-600"}`}>
                  共用
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">カテゴリ</label>
              <select value={budgetCategory} onChange={e => setBudgetCategory(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">月間予算（円）</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">¥</span>
                <input type="number" value={budgetAmount} onChange={e => setBudgetAmount(e.target.value)}
                  placeholder="0" className="w-full border rounded-lg pl-7 pr-3 py-2 text-sm" />
              </div>
            </div>
            {budgetMsg && <p className="text-xs text-green-600">✅ {budgetMsg}</p>}
            <button onClick={handleSaveBudget} disabled={budgetSaving || !budgetCategory || !budgetAmount}
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">
              {budgetSaving ? "保存中..." : "予算を設定"}
            </button>
          </div>

          {/* 設定済み予算一覧 */}
          {existingBudgets.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b">
                <h2 className="text-sm font-semibold text-gray-700">設定済み予算</h2>
              </div>
              {["self", "joint"].map(ct => {
                const rows = existingBudgets.filter(b => b.card_type === ct)
                if (rows.length === 0) return null
                return (
                  <div key={ct}>
                    <div className={`px-4 py-1.5 text-xs font-semibold ${ct === "joint" ? "bg-amber-50 text-amber-600" : "bg-indigo-50 text-indigo-600"}`}>
                      {ct === "joint" ? "共用カード" : "個人カード"}
                    </div>
                    {rows.map(b => (
                      <div key={b.category} className="flex items-center justify-between px-4 py-2.5 border-b last:border-0">
                        <span className="text-sm text-gray-700">{b.category}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-600">{toJPY(b.budget)}</span>
                          <button onClick={() => handleDeleteBudget(b.category, b.card_type)}
                            className="text-gray-300 hover:text-red-400 text-xl leading-none w-6">×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
          </>
        )}
      </main>
      <BottomNav />
    </div>
  )
}
