"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"
import { useViewMode } from "@/components/ViewModeContext"

interface Card { id: number; name: string; card_type: string; color: string }
interface Recurring { id: number; day_of_month: number; card_id: number; card_name: string; color: string; category: string; amount: number; memo: string }
interface Category { name: string }
interface BudgetRow { category: string; card_type: string; budget: number }
interface StoreRule { id: number; keyword: string; category: string }

const GROUP_ORDER = ["収入", "支出", "振替", "投資", "貯蓄", "立替"]
const GROUP_COLORS: Record<string, { bg: string; text: string; border: string; light: string }> = {
  収入: { bg: "bg-green-500", text: "text-green-700", border: "border-l-green-400", light: "bg-green-50" },
  支出: { bg: "bg-blue-500",  text: "text-blue-700",  border: "border-l-blue-400",  light: "bg-blue-50"  },
  振替: { bg: "bg-gray-400",  text: "text-gray-600",  border: "border-l-gray-400",  light: "bg-gray-50"  },
  投資: { bg: "bg-purple-500",text: "text-purple-700",border: "border-l-purple-400",light: "bg-purple-50"},
  貯蓄: { bg: "bg-teal-500",  text: "text-teal-700",  border: "border-l-teal-400",  light: "bg-teal-50"  },
  立替: { bg: "bg-orange-400",text: "text-orange-700",border: "border-l-orange-400",light: "bg-orange-50"},
}

function toJPY(n: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n)
}

type Tab = "recurring" | "income" | "budget" | "category"

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="pb-20"><PageHeader title="設定" /><div className="text-center py-8 text-gray-500">読み込み中...</div><BottomNav /></div>}>
      <SettingsContent />
    </Suspense>
  )
}

function SettingsContent() {
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const router = useRouter()
  const searchParams = useSearchParams()
  const { mode } = useViewMode()
  const isPC = mode === "pc"

  const validTabs: Tab[] = ["recurring", "income", "budget", "category"]
  const initialTab = (searchParams.get("tab") as Tab | null)
  const [tab, setTabState] = useState<Tab>(validTabs.includes(initialTab as Tab) ? initialTab as Tab : "recurring")

  function setTab(t: Tab) {
    setTabState(t)
    const p = new URLSearchParams(searchParams.toString())
    p.set("tab", t)
    router.replace(`?${p.toString()}`, { scroll: false })
  }
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
  const [catViewType, setCatViewType] = useState<"self" | "joint">("self")
  const [newCatCardType, setNewCatCardType] = useState<"self" | "joint">("self")
  const [categoryRows, setCategoryRows] = useState<{ name: string; card_type: string; group_type: string | null }[]>([])
  const [storeRules, setStoreRules] = useState<StoreRule[]>([])
  const [ruleSearch, setRuleSearch] = useState("")
  const [newRuleKeyword, setNewRuleKeyword] = useState("")
  const [newRuleCategory, setNewRuleCategory] = useState("")
  const [ruleSaving, setRuleSaving] = useState(false)
  const [editingRule, setEditingRule] = useState<StoreRule | null>(null)
  const [uncategorizedMemos, setUncategorizedMemos] = useState<{ memo: string; count: number; card_type: string }[]>([])
  const [catMigrated, setCatMigrated] = useState(false)

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
      setCategoryRows((catd.rows ?? []).map((r: { name: string; card_type: string; group_type?: string | null }) => ({ ...r, group_type: r.group_type ?? null })))
      if (cats.length > 0) { setRCategory(cats[0]); setBudgetCategory(cats[0]) }
      setRecurring(recd.recurring ?? [])
      const bRaw: Array<{ category: string; cardType: string; budget: number }> = budgetData.budgets ?? []
      setExistingBudgets(bRaw.map(b => ({ category: b.category, card_type: b.cardType, budget: b.budget })))
    })
  }, [])

  useEffect(() => {
    if (tab === "category") {
      fetchStoreRules(ruleSearch)
      fetch("/api/uncategorized-memos").then(r => r.json()).then(d => setUncategorizedMemos(d.memos ?? []))
      // 初回のみ取引履歴から共用カテゴリを自動分類
      if (!catMigrated) {
        setCatMigrated(true)
        fetch("/api/categories", { method: "PATCH" }).then(r => r.json()).then(d => {
          setCategories(d.categories ?? [])
          setCategoryRows(d.rows ?? [])
        })
      }
    }
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
    await fetch("/api/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newCatName.trim(), card_type: newCatCardType }) })
    const data = await fetch("/api/categories").then(r => r.json())
    setCategories(data.categories ?? [])
    setCategoryRows(data.rows ?? [])
    setNewCatName("")
    setCatSaving(false)
  }

  async function handleDeleteCategory(name: string) {
    if (!confirm(`カテゴリ「${name}」を削除しますか？\n（このカテゴリが設定された明細はそのまま残ります）`)) return
    await fetch(`/api/categories?name=${encodeURIComponent(name)}`, { method: "DELETE" })
    setCategories(prev => prev.filter(c => c !== name))
    setCategoryRows(prev => prev.filter(r => r.name !== name))
  }

  async function handleSetGroupType(name: string, card_type: string, group_type: string | null) {
    await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, card_type, group_type }),
    })
    setCategoryRows(prev => prev.map(r => r.name === name ? { ...r, group_type } : r))
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
    // 未分類リストを再取得（適用済みのものが消える）
    fetch("/api/uncategorized-memos").then(r => r.json()).then(d => setUncategorizedMemos(d.memos ?? []))
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
    <div className={mode === "mobile" ? "pb-20" : ""}>
      <PageHeader title="設定" />
      <div className={isPC ? "px-6 py-4 space-y-4" : "max-w-md mx-auto px-4 py-2 space-y-3"}>
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
          <div className={isPC ? "grid grid-cols-2 gap-4 items-start" : "space-y-3"}>
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
          </div>
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
          <div className={isPC ? "grid grid-cols-2 gap-4 items-start" : "space-y-3"}>
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

          {/* 設定済み予算一覧（グループ別・カラーコーディング） */}
          {existingBudgets.length > 0 && (() => {
            // カテゴリのgroup_typeをlookup
            const groupTypeMap: Record<string, string | null> = {}
            for (const r of categoryRows) {
              groupTypeMap[`${r.name}:${r.card_type}`] = r.group_type
            }

            // グループ別に分類
            const grouped: Record<string, BudgetRow[]> = {}
            const ungrouped: BudgetRow[] = []
            for (const b of existingBudgets) {
              const gt = groupTypeMap[`${b.category}:${b.card_type}`] ?? null
              if (gt && GROUP_ORDER.includes(gt)) {
                if (!grouped[gt]) grouped[gt] = []
                grouped[gt].push(b)
              } else {
                ungrouped.push(b)
              }
            }
            const allGroups = [
              ...GROUP_ORDER.filter(g => grouped[g]?.length),
              ...(ungrouped.length ? ["未設定"] : []),
            ]
            const totalBudget = existingBudgets.reduce((s, b) => s + b.budget, 0)

            return (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 border-b flex justify-between items-center">
                  <h2 className="text-xs font-semibold text-gray-700">設定済み予算一覧</h2>
                  <span className="text-xs text-gray-400">クリックして編集</span>
                </div>
                {allGroups.map(group => {
                  const rows = group === "未設定" ? ungrouped : (grouped[group] ?? [])
                  const gc = GROUP_COLORS[group]
                  const groupTotal = rows.reduce((s, b) => s + b.budget, 0)
                  return (
                    <div key={group}>
                      {/* グループヘッダー */}
                      <div className={`flex items-center justify-between px-3 py-1.5 border-b border-l-2 ${gc ? `${gc.light} ${gc.border} ${gc.text}` : "bg-gray-50 border-l-gray-300 text-gray-500"}`}>
                        <div className="flex items-center gap-1.5">
                          {gc && <span className={`text-[10px] px-1 py-0.5 rounded text-white font-bold ${gc.bg}`}>{group}</span>}
                          {!gc && <span className="text-xs font-medium">{group}</span>}
                        </div>
                        <span className="text-xs font-semibold">{toJPY(groupTotal)}</span>
                      </div>
                      {/* カテゴリ行 */}
                      {rows.map(b => {
                        const key = `${b.category}:${b.card_type}`
                        const isEditing = editingBudgetKey === key
                        return (
                          <div
                            key={key}
                            className={`flex items-center justify-between px-3 py-2 border-b last:border-0 cursor-pointer transition-colors border-l-2 ${gc ? gc.border : "border-l-transparent"} ${isEditing ? "bg-blue-50" : `hover:${gc?.light ?? "bg-gray-50"}`}`}
                            onClick={() => handleEditBudget(b)}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${b.card_type === "joint" ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"}`}>
                                {b.card_type === "joint" ? "共" : "個"}
                              </span>
                              <span className={`text-xs ${isEditing ? "text-blue-700 font-medium" : "text-gray-700"}`}>{b.category}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium ${isEditing ? "text-blue-600" : "text-gray-700"}`}>{toJPY(b.budget)}</span>
                              {isEditing
                                ? <span className="text-blue-400 text-[10px] font-medium">編集中</span>
                                : <button
                                    onClick={e => { e.stopPropagation(); handleDeleteBudget(b.category, b.card_type) }}
                                    className="text-gray-300 hover:text-red-400 text-lg leading-none w-5">×</button>
                              }
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
                {/* 合計 */}
                <div className="flex justify-between items-center px-3 py-2 bg-gray-800 text-white">
                  <span className="text-xs font-bold">合計</span>
                  <span className="text-xs font-bold">{toJPY(totalBudget)}</span>
                </div>
              </div>
            )
          })()}
          </div>
        )}

        {/* === カテゴリ管理タブ === */}
        {tab === "category" && (() => {
          // 共通: カテゴリリストブロック
          const CategoryBlock = () => (
            <div className="bg-white rounded-xl shadow-sm p-3 space-y-2">
              <h2 className="text-xs font-semibold text-gray-700">カテゴリ一覧</h2>
              <div className="flex gap-1.5">
                <button type="button"
                  onClick={() => { setCatViewType("self"); setNewCatCardType("self") }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${catViewType === "self" ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-300 text-gray-600"}`}>
                  個人
                </button>
                <button type="button"
                  onClick={() => { setCatViewType("joint"); setNewCatCardType("joint") }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${catViewType === "joint" ? "bg-amber-500 text-white border-amber-500" : "border-gray-300 text-gray-600"}`}>
                  共用
                </button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                {(() => {
                  const visibleRows = categoryRows
                    .filter(r => catViewType === "joint" ? r.card_type === "joint" : r.card_type !== "joint")
                    .sort((a, b) => {
                      const ai = GROUP_ORDER.indexOf(a.group_type ?? "")
                      const bi = GROUP_ORDER.indexOf(b.group_type ?? "")
                      const aIdx = ai === -1 ? GROUP_ORDER.length : ai
                      const bIdx = bi === -1 ? GROUP_ORDER.length : bi
                      if (aIdx !== bIdx) return aIdx - bIdx
                      return a.name.localeCompare(b.name, "ja")
                    })
                  if (visibleRows.length === 0) return <p className="text-xs text-gray-400 px-3 py-3">なし</p>
                  return (
                    <>
                      <div className="grid grid-cols-[1fr_auto_auto] bg-gray-50 border-b text-xs text-gray-500 font-medium">
                        <div className="px-2 py-1">カテゴリ名</div>
                        <div className="px-2 py-1">グループ</div>
                        <div className="w-7"></div>
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {visibleRows.map(r => {
                          const gc = r.group_type ? GROUP_COLORS[r.group_type] : null
                          return (
                            <div key={`${r.name}-${r.card_type}`}
                              className={`grid grid-cols-[1fr_auto_auto] items-center border-b last:border-0 border-l-2 ${gc ? gc.border : "border-l-transparent"} ${gc ? gc.light : "hover:bg-gray-50"}`}>
                              <div className="flex items-center gap-1.5 px-2 py-1">
                                {gc && (
                                  <span className={`text-[10px] px-1 py-0.5 rounded font-bold text-white ${gc.bg}`}>
                                    {r.group_type}
                                  </span>
                                )}
                                <span className="text-xs text-gray-800">{r.name}</span>
                              </div>
                              <select
                                value={r.group_type ?? ""}
                                onChange={e => handleSetGroupType(r.name, r.card_type, e.target.value || null)}
                                className={`text-xs border-0 border-l bg-transparent py-1 px-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 ${gc ? gc.text : "text-gray-700"}`}
                              >
                                <option value="">—</option>
                                {GROUP_ORDER.map(g => <option key={g} value={g}>{g}</option>)}
                              </select>
                              <button onClick={() => handleDeleteCategory(r.name)}
                                className="w-7 py-1 text-gray-300 hover:text-red-500 text-base leading-none border-l text-center">×</button>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )
                })()}
              </div>
              <div className="flex gap-2 pt-1 border-t">
                <input type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAddCategory()}
                  placeholder={`新しい${catViewType === "joint" ? "共用" : "個人"}カテゴリ名`}
                  className="flex-1 border rounded-lg px-2 py-1.5 text-xs text-gray-800"
                />
                <button onClick={handleAddCategory} disabled={catSaving || !newCatName.trim()}
                  className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
                  追加
                </button>
              </div>
            </div>
          )

          // 共通: 振り分けルールブロック
          const RulesBlock = () => (
            <div className="bg-white rounded-xl shadow-sm p-3 space-y-2">
              <h2 className="text-xs font-semibold text-gray-700">自動振り分けルール</h2>
              <p className="text-xs text-gray-400">CSVインポート時、メモのキーワードからカテゴリを自動設定</p>
              <div className={`border rounded-lg p-2 space-y-2 ${editingRule ? "border-blue-400 bg-blue-50" : "border-gray-200"}`}>
                <p className="text-xs font-medium text-gray-600">{editingRule ? "ルールを編集" : "ルールを追加"}</p>
                <div className="flex gap-2">
                  <input
                    id="rule-keyword-input"
                    type="text"
                    value={newRuleKeyword}
                    onChange={e => setNewRuleKeyword(e.target.value)}
                    placeholder="キーワード（店舗名など）"
                    className="flex-1 border rounded px-2 py-1.5 text-xs text-gray-800 min-w-0"
                  />
                  <select
                    value={newRuleCategory}
                    onChange={e => setNewRuleCategory(e.target.value)}
                    className="border rounded px-2 py-1.5 text-xs text-gray-800 bg-white"
                  >
                    <option value="">カテゴリ選択</option>
                    {categoryRows
                      .filter(r => catViewType === "joint" ? r.card_type === "joint" : r.card_type !== "joint")
                      .map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  {editingRule && (
                    <button onClick={() => { setEditingRule(null); setNewRuleKeyword(""); setNewRuleCategory("") }}
                      className="flex-1 border border-gray-300 text-gray-600 rounded py-1.5 text-xs">
                      キャンセル
                    </button>
                  )}
                  <button
                    onClick={handleSaveRule}
                    disabled={ruleSaving || !newRuleKeyword.trim() || !newRuleCategory}
                    className="flex-1 bg-blue-600 text-white rounded py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    {ruleSaving ? "保存中..." : editingRule ? "更新" : "追加"}
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={ruleSearch}
                onChange={e => { setRuleSearch(e.target.value); fetchStoreRules(e.target.value) }}
                placeholder="検索..."
                className="w-full border rounded px-2 py-1.5 text-xs text-gray-800"
              />
              <div className="border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                {storeRules.length === 0 ? (
                  <p className="text-center py-4 text-xs text-gray-400">ルールがありません</p>
                ) : (
                  storeRules.map(r => (
                    <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 border-b last:border-0 hover:bg-gray-50">
                      <span className="flex-1 text-xs text-gray-800 truncate">{r.keyword}</span>
                      <span className="text-xs text-gray-400">→</span>
                      <span className="text-xs font-medium text-blue-600 w-20 truncate text-right">{r.category}</span>
                      <button
                        onClick={() => { setEditingRule(r); setNewRuleKeyword(r.keyword); setNewRuleCategory(r.category) }}
                        className="text-xs text-gray-400 hover:text-blue-500 px-1">
                        編集
                      </button>
                      <button onClick={() => handleDeleteRule(r.id)} className="text-gray-300 hover:text-red-400 text-lg leading-none w-5">×</button>
                    </div>
                  ))
                )}
              </div>
              <p className="text-xs text-gray-400 text-right">{storeRules.length}件</p>
            </div>
          )

          // 共通: 未分類メモブロック
          const filtered = uncategorizedMemos.filter(m =>
            catViewType === "joint" ? m.card_type === "joint" : m.card_type !== "joint"
          )
          const UncategorizedBlock = () => filtered.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-3">
              <h2 className="text-xs font-semibold text-gray-700 mb-2">未分類の明細</h2>
              <p className="text-xs text-gray-400 text-center py-4">未分類の明細はありません ✅</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-3 py-2 bg-orange-50 border-b border-orange-100 flex items-center justify-between">
                <h2 className="text-xs font-semibold text-orange-700">⚠ 未分類の明細（{filtered.length}件）</h2>
                <span className="text-xs text-orange-400">クリックしてルール追加</span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {filtered.map(m => (
                  <div key={`${m.memo}-${m.card_type}`}
                    className="flex items-center gap-2 px-3 py-1.5 border-b last:border-0 hover:bg-orange-50 cursor-pointer"
                    onClick={() => {
                      setNewRuleKeyword(m.memo)
                      setNewRuleCategory("")
                      setEditingRule(null)
                      setTimeout(() => { document.getElementById("rule-keyword-input")?.focus() }, 100)
                    }}>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${m.card_type === "joint" ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"}`}>
                      {m.card_type === "joint" ? "共" : "個"}
                    </span>
                    <span className="flex-1 text-xs text-gray-800 truncate">{m.memo}</span>
                    <span className="text-xs text-gray-400 shrink-0">{m.count}件</span>
                    <span className="text-xs text-blue-400 shrink-0">+ルール</span>
                  </div>
                ))}
              </div>
            </div>
          )

          return isPC ? (
            <div className="grid grid-cols-3 gap-4 items-start">
              {CategoryBlock()}
              {RulesBlock()}
              {UncategorizedBlock()}
            </div>
          ) : (
            <div className="space-y-3">
              {CategoryBlock()}
              {UncategorizedBlock()}
              {RulesBlock()}
            </div>
          )
        })()}
      </div>
      <BottomNav />
    </div>
  )
}
