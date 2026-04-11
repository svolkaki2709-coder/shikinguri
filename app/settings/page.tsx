"use client"

import { useEffect, useState } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"

interface Card { id: number; name: string; card_type: string; color: string }
interface Recurring { id: number; day_of_month: number; card_id: number; card_name: string; color: string; category: string; amount: number; memo: string }
interface Category { name: string }
interface BudgetRow { category: string; card_type: string; budget: number }
interface StoreRule { id: number; keyword: string; category: string }

function toJPY(n: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n)
}

type Tab = "recurring" | "income" | "budget" | "category"

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
  const [editingBudgetKey, setEditingBudgetKey] = useState<string | null>(null)

  // カテゴリ管理
  const [newCatName, setNewCatName] = useState("")
  const [catSaving, setCatSaving] = useState(false)
  const [storeRules, setStoreRules] = useState<StoreRule[]>([])
  const [ruleSearch, setRuleSearch] = useState("")
  const [newRuleKeyword, setNewRuleKeyword] = useState("")
  const [newRuleCategory, setNewRuleCategory] = useState("")
  const [ruleSaving, setRuleSaving] = useState(false)
  const [editingRule, setEditingRule] = useState<StoreRule | null>(null)

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

  useEffect(() => {
    if (tab === "category") fetchStoreRules(ruleSearch)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

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
    setEditingBudgetKey(null)
    // 一覧を更新
    const d = await fetch("/api/budget").then(r => r.json())
    const bRaw: Array<{ category: string; cardType: string; budget: number }> = d.budgets ?? []
    setExistingBudgets(bRaw.map(b => ({ category: b.category, card_type: b.cardType, budget: b.budget })))
  }

  function handleEditBudget(b: BudgetRow) {
    setBudgetCardType(b.card_type)
    setBudgetCategory(b.category)
    setBudgetAmount(String(b.budget))
    setBudgetMsg("")
    setEditingBudgetKey(`${b.category}:${b.card_type}`)
  }

  function handleCancelEditBudget() {
    setEditingBudgetKey(null)
    setBudgetAmount("")
    setBudgetMsg("")
  }

  async function handleDeleteBudget(category: string, cardType: string) {
    if (!confirm(`「${category}」の予算を削除しますか？`)) return
    await fetch(`/api/budget?category=${encodeURIComponent(category)}&card_type=${cardType}`, { method: "DELETE" })
    setExistingBudgets(prev => prev.filter(b => !(b.category === category && b.card_type === cardType)))
  }

  async function fetchStoreRules(q = "") {
    const data = await fetch(`/api/store-rules?q=${encodeURIComponent(q)}`).then(r => r.json())
    setStoreRules(data.rules ?? [])
  }

  async function handleAddCategory() {
    if (!newCatName.trim()) return
    setCatSaving(true)
    await fetch("/api/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newCatName.trim() }) })
    const data = await fetch("/api/categories").then(r => r.json())
    setCategories(data.categories ?? [])
    setNewCatName("")
    setCatSaving(false)
  }

  async function handleDeleteCategory(name: string) {
    if (!confirm(`カテゴリ「${name}」を削除しますか？\n（このカテゴリが設定された明細はそのまま残ります）`)) return
    await fetch(`/api/categories?name=${encodeURIComponent(name)}`, { method: "DELETE" })
    setCategories(prev => prev.filter(c => c !== name))
  }

  async function handleSaveRule() {
    if (!newRuleKeyword.trim() || !newRuleCategory) return
    setRuleSaving(true)
    if (editingRule) {
      await fetch("/api/store-rules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingRule.id, keyword: newRuleKeyword, category: newRuleCategory }) })
      setEditingRule(null)
    } else {
      await fetch("/api/store-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyword: newRuleKeyword, category: newRuleCategory }) })
    }
    setNewRuleKeyword("")
    setNewRuleCategory("")
    setRuleSaving(false)
    fetchStoreRules(ruleSearch)
  }

  async function handleDeleteRule(id: number) {
    if (!confirm("このルールを削除しますか？")) return
    await fetch(`/api/store-rules?id=${id}`, { method: "DELETE" })
    setStoreRules(prev => prev.filter(r => r.id !== id))
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "recurring", label: "定期支出" },
    { key: "income", label: "収入入力" },
    { key: "budget", label: "予算設定" },
    { key: "category", label: "カテゴリ" },
  ]

  return (
    <div className="pb-20">
      <PageHeader title="設定" />
      <main className="max-w-md mx-auto px-4 py-2 space-y-3">
        {/* タブ */}
        <div className="flex rounded-xl bg-gray-100 p-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? "bg-white shadow-sm text-blue-600" : "text-gray-700"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* === 定期支出タブ === */}
        {tab === "recurring" && (
          <>
            <div className="bg-white rounded-xl shadow-sm p-3 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">定期支出を追加</h2>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="text-xs text-gray-700 mb-1 block">引き落とし日</label>
                  <select value={rDay} onChange={e => setRDay(e.target.value)}
                    className="w-full border rounded-lg px-2 py-2 text-sm bg-white">
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>{d}日</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-700 mb-1 block">カード</label>
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
                  <label className="text-xs text-gray-700 mb-1 block">カテゴリ</label>
                  <select value={rCategory} onChange={e => setRCategory(e.target.value)}
                    className="w-full border rounded-lg px-2 py-2 text-sm bg-white">
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-700 mb-1 block">金額（円）</label>
                  <input type="number" value={rAmount} onChange={e => setRAmount(e.target.value)}
                    placeholder="0" className="w-full border rounded-lg px-2 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-700 mb-1 block">メモ（任意）</label>
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
                  <div key={r.id} className="flex items-center px-4 py-2 border-b last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs px-1.5 py-0.5 rounded text-white"
                          style={{ backgroundColor: r.color ?? "#6366f1" }}>
                          {r.card_name}
                        </span>
                        <span className="text-sm font-medium text-gray-800">{r.category}</span>
                      </div>
                      <p className="text-xs text-gray-700">{r.day_of_month}日 {r.memo && `/ ${r.memo}`}</p>
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
          <div className="bg-white rounded-xl shadow-sm p-3 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">収入を記録</h2>
            <div>
              <label className="text-xs text-gray-700 mb-1 block">月</label>
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
              <label className="text-xs text-gray-700 mb-1 block">種別</label>
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
              <label className="text-xs text-gray-700 mb-1 block">金額（円）</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm">¥</span>
                <input type="number" value={incomeAmount} onChange={e => setIncomeAmount(e.target.value)}
                  placeholder="0" className="w-full border rounded-lg pl-7 pr-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-700 mb-1 block">メモ（任意）</label>
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
          <div className={`bg-white rounded-xl shadow-sm p-3 space-y-3 ${editingBudgetKey ? "ring-2 ring-blue-400" : ""}`}>
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-700">
                {editingBudgetKey ? "予算を編集" : "予算を追加"}
              </h2>
              {editingBudgetKey && (
                <button onClick={handleCancelEditBudget} className="text-xs text-gray-500 hover:text-gray-700">
                  キャンセル
                </button>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-700 mb-1 block">対象</label>
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => { setBudgetCardType("self"); if (editingBudgetKey) setEditingBudgetKey(null) }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${budgetCardType === "self" ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-300 text-gray-600"}`}>
                  個人
                </button>
                <button type="button"
                  onClick={() => { setBudgetCardType("joint"); if (editingBudgetKey) setEditingBudgetKey(null) }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${budgetCardType === "joint" ? "bg-amber-500 text-white border-amber-500" : "border-gray-300 text-gray-600"}`}>
                  共用
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-700 mb-1 block">カテゴリ</label>
              <select value={budgetCategory} onChange={e => setBudgetCategory(e.target.value)}
                disabled={!!editingBudgetKey}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-50 disabled:text-gray-600">
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-700 mb-1 block">月間予算（円）</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm">¥</span>
                <input type="number" value={budgetAmount} onChange={e => setBudgetAmount(e.target.value)}
                  placeholder="0" className="w-full border rounded-lg pl-7 pr-3 py-2 text-sm" />
              </div>
            </div>
            {budgetMsg && <p className="text-xs text-green-600">✅ {budgetMsg}</p>}
            <button onClick={handleSaveBudget} disabled={budgetSaving || !budgetCategory || !budgetAmount}
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">
              {budgetSaving ? "保存中..." : editingBudgetKey ? "金額を更新" : "予算を設定"}
            </button>
          </div>

          {/* 設定済み予算一覧（選択中の用途のみ表示） */}
          {(() => {
            const filteredBudgets = existingBudgets.filter(b => b.card_type === budgetCardType)
            if (filteredBudgets.length === 0) return null
            const isJoint = budgetCardType === "joint"
            return (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className={`px-4 py-2 border-b flex justify-between items-center ${isJoint ? "bg-amber-50" : "bg-indigo-50"}`}>
                  <h2 className={`text-sm font-semibold ${isJoint ? "text-amber-600" : "text-indigo-600"}`}>
                    {isJoint ? "共用" : "個人"}の設定済み予算
                  </h2>
                  <span className="text-xs text-gray-500">行をタップして編集</span>
                </div>
                {filteredBudgets.map(b => {
                  const key = `${b.category}:${b.card_type}`
                  const isEditing = editingBudgetKey === key
                  return (
                    <div
                      key={b.category}
                      className={`flex items-center justify-between px-4 py-2.5 border-b last:border-0 cursor-pointer transition-colors ${isEditing ? "bg-blue-50" : "hover:bg-gray-50"}`}
                      onClick={() => handleEditBudget(b)}
                    >
                      <span className={`text-sm ${isEditing ? "text-blue-700 font-medium" : "text-gray-700"}`}>{b.category}</span>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-medium ${isEditing ? "text-blue-600" : "text-gray-700"}`}>{toJPY(b.budget)}</span>
                        {isEditing
                          ? <span className="text-blue-400 text-xs font-medium">編集中</span>
                          : <button
                              onClick={e => { e.stopPropagation(); handleDeleteBudget(b.category, b.card_type) }}
                              className="text-gray-300 hover:text-red-400 text-xl leading-none w-6">×</button>
                        }
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
          </>
        )}

        {/* === カテゴリ管理タブ === */}
        {tab === "category" && (
          <>
            {/* カテゴリ一覧 */}
            <div className="bg-white rounded-xl shadow-sm p-3 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">カテゴリ一覧</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAddCategory()}
                  placeholder="新しいカテゴリ名"
                  className="flex-1 border rounded-lg px-3 py-1.5 text-sm text-gray-800"
                />
                <button
                  onClick={handleAddCategory}
                  disabled={catSaving || !newCatName.trim()}
                  className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                >
                  追加
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {categories.map(c => (
                  <div key={c} className="flex items-center gap-1 bg-gray-100 rounded-full pl-2.5 pr-1 py-0.5">
                    <span className="text-xs text-gray-700">{c}</span>
                    <button onClick={() => handleDeleteCategory(c)} className="text-gray-400 hover:text-red-500 text-sm leading-none w-4">×</button>
                  </div>
                ))}
              </div>
            </div>

            {/* 自動振り分けルール */}
            <div className="bg-white rounded-xl shadow-sm p-3 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">自動振り分けルール</h2>
              <p className="text-xs text-gray-500">CSVインポート時、メモ欄のキーワードからカテゴリを自動設定します</p>

              {/* 新規ルール追加／編集 */}
              <div className={`border rounded-lg p-2.5 space-y-2 ${editingRule ? "border-blue-400 bg-blue-50" : "border-gray-200"}`}>
                <p className="text-xs font-medium text-gray-600">{editingRule ? "ルールを編集" : "ルールを追加"}</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newRuleKeyword}
                    onChange={e => setNewRuleKeyword(e.target.value)}
                    placeholder="キーワード（店舗名など）"
                    className="flex-1 border rounded-lg px-2 py-1.5 text-xs text-gray-800"
                  />
                  <select
                    value={newRuleCategory}
                    onChange={e => setNewRuleCategory(e.target.value)}
                    className="border rounded-lg px-2 py-1.5 text-xs text-gray-800 bg-white"
                  >
                    <option value="">カテゴリ選択</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  {editingRule && (
                    <button onClick={() => { setEditingRule(null); setNewRuleKeyword(""); setNewRuleCategory("") }}
                      className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-1.5 text-xs">
                      キャンセル
                    </button>
                  )}
                  <button
                    onClick={handleSaveRule}
                    disabled={ruleSaving || !newRuleKeyword.trim() || !newRuleCategory}
                    className="flex-1 bg-blue-600 text-white rounded-lg py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    {ruleSaving ? "保存中..." : editingRule ? "更新" : "追加"}
                  </button>
                </div>
              </div>

              {/* 検索 */}
              <input
                type="text"
                value={ruleSearch}
                onChange={e => { setRuleSearch(e.target.value); fetchStoreRules(e.target.value) }}
                placeholder="キーワード・カテゴリで検索"
                className="w-full border rounded-lg px-3 py-1.5 text-sm text-gray-800"
              />

              {/* ルール一覧 */}
              <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                {storeRules.length === 0 ? (
                  <p className="text-center py-4 text-sm text-gray-500">ルールがありません</p>
                ) : (
                  storeRules.map(r => (
                    <div key={r.id} className="flex items-center gap-2 px-3 py-2 border-b last:border-0 hover:bg-gray-50">
                      <span className="flex-1 text-xs text-gray-800 truncate">{r.keyword}</span>
                      <span className="text-xs text-gray-400">→</span>
                      <span className="text-xs font-medium text-blue-600 w-24 truncate text-right">{r.category}</span>
                      <button
                        onClick={() => { setEditingRule(r); setNewRuleKeyword(r.keyword); setNewRuleCategory(r.category) }}
                        className="text-xs text-gray-400 hover:text-blue-500 px-1"
                      >
                        編集
                      </button>
                      <button onClick={() => handleDeleteRule(r.id)} className="text-gray-300 hover:text-red-400 text-lg leading-none w-5">×</button>
                    </div>
                  ))
                )}
              </div>
              <p className="text-xs text-gray-400 text-right">{storeRules.length}件</p>
            </div>
          </>
        )}
      </main>
      <BottomNav />
    </div>
  )
}
