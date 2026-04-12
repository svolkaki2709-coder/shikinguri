"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"
import { useViewMode } from "@/components/ViewModeContext"

interface Card { id: number; name: string; card_type: string; color: string }
interface Recurring { id: number; day_of_month: number; card_id: number; card_name: string; color: string; category: string; amount: number; memo: string }
interface Category { name: string }
interface BudgetRow { category: string; card_type: string; budget: number; is_monthly?: boolean }
interface IncomeRecord { id: number; date: string; amount: number; category: string; memo: string }
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
  const [monthIncomeRecords, setMonthIncomeRecords] = useState<IncomeRecord[]>([])

  // PDF確認パネル
  interface PayslipItem { key: string; label: string; amount: number; checked: boolean; type: "income" | "transaction"; category: string }
  const [parsedPayslipItems, setParsedPayslipItems] = useState<PayslipItem[] | null>(null)
  const [payslipMonth, setPayslipMonth] = useState<string | null>(null)
  const [payslipCardId, setPayslipCardId] = useState<number | null>(null)
  const [payslipSaving, setPayslipSaving] = useState(false)

  // 予算フォーム
  const [budgetCategory, setBudgetCategory] = useState("")
  const [budgetAmount, setBudgetAmount] = useState("")
  const [budgetCardType, setBudgetCardType] = useState("self")
  const [budgetMonth, setBudgetMonth] = useState<string | null>(null)  // null=毎月共通
  const [budgetSaving, setBudgetSaving] = useState(false)
  const [budgetMsg, setBudgetMsg] = useState("")
  const [existingBudgets, setExistingBudgets] = useState<BudgetRow[]>([])
  const [editingBudgetKey, setEditingBudgetKey] = useState<string | null>(null)
  const [budgetViewMonth, setBudgetViewMonth] = useState(defaultMonth)  // 一覧の表示月

  // カテゴリ管理
  const [newCatName, setNewCatName] = useState("")
  const [catSaving, setCatSaving] = useState(false)
  const [catViewType, setCatViewType] = useState<"self" | "joint">("self")
  const [newCatCardType, setNewCatCardType] = useState<"self" | "joint">("self")
  const [categoryRows, setCategoryRows] = useState<{ name: string; card_type: string; group_type: string | null; sort_order: number | null }[]>([])
  // ドラッグ&ドロップ
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
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
      setCategoryRows((catd.rows ?? []).map((r: { name: string; card_type: string; group_type?: string | null; sort_order?: number | null }) => ({ ...r, group_type: r.group_type ?? null, sort_order: r.sort_order ?? null })))
      if (cats.length > 0) { setRCategory(cats[0]); setBudgetCategory(cats[0]) }
      setRecurring(recd.recurring ?? [])
      const bRaw: Array<{ category: string; cardType: string; budget: number; isMonthly?: boolean }> = budgetData.budgets ?? []
      setExistingBudgets(bRaw.map(b => ({ category: b.category, card_type: b.cardType, budget: b.budget, is_monthly: b.isMonthly ?? false })))
    })
  }, [])

  useEffect(() => {
    if (tab === "category") {
      fetchStoreRules(ruleSearch)
      fetch("/api/uncategorized-memos").then(r => r.json()).then(d => setUncategorizedMemos(d.memos ?? []))
      // 初回のみ取引履歴から共用カテゴリを自動分類
      if (!catMigrated) {
        setCatMigrated(true)
        fetch("/api/categories", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }).then(r => r.json()).then(d => {
          setCategories(d.categories ?? [])
          setCategoryRows((d.rows ?? []).map((r: { name: string; card_type: string; group_type?: string | null; sort_order?: number | null }) => ({ ...r, group_type: r.group_type ?? null, sort_order: r.sort_order ?? null })))
        })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // 収入タブ or 月が変わったら記録一覧を再取得
  useEffect(() => {
    if (tab === "income") fetchMonthIncomes(incomeMonth)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomeMonth, tab])

  // 表示月が変わったら予算一覧を再取得
  useEffect(() => {
    if (tab === "budget") refreshBudgets()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetViewMonth, tab])

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

  async function fetchMonthIncomes(m?: string) {
    const target = m ?? incomeMonth
    const d = await fetch(`/api/income?month=${target}`).then(r => r.json())
    setMonthIncomeRecords(d.incomes ?? [])
  }

  async function handleDeleteIncome(id: number) {
    if (!confirm("この収入記録を削除しますか？")) return
    await fetch(`/api/income?id=${id}`, { method: "DELETE" })
    setMonthIncomeRecords(prev => prev.filter(r => r.id !== id))
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
    await fetchMonthIncomes()
  }

  async function handlePayslipBulkRegister() {
    if (!parsedPayslipItems) return
    setPayslipSaving(true)
    const month = payslipMonth ?? incomeMonth
    const date = `${month}-01`
    const checkedItems = parsedPayslipItems.filter(i => i.checked)

    await Promise.all(checkedItems.map(async item => {
      if (item.type === "income") {
        await fetch("/api/income", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, amount: item.amount, category: item.category, memo: "給与明細より" }),
        })
      } else {
        if (!payslipCardId) return
        await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, card_id: payslipCardId, category: item.category, amount: item.amount, memo: "給与明細より" }),
        })
      }
    }))

    if (payslipMonth) setIncomeMonth(payslipMonth)
    setParsedPayslipItems(null)
    setPayslipMonth(null)
    setPayslipSaving(false)
    await fetchMonthIncomes(month)
  }

  async function handleSaveBudget() {
    if (!budgetCategory || !budgetAmount) return
    setBudgetSaving(true)
    setBudgetMsg("")
    await fetch("/api/budget", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: budgetCategory, amount: Number(budgetAmount), card_type: budgetCardType, month: budgetMonth }),
    })
    setBudgetMsg(budgetMonth ? `${budgetMonth}の予算を設定しました` : "共通予算を設定しました")
    setBudgetAmount("")
    setBudgetSaving(false)
    setEditingBudgetKey(null)
    await refreshBudgets()
  }

  async function refreshBudgets() {
    const d = await fetch(`/api/budget?month=${budgetViewMonth}`).then(r => r.json())
    const bRaw: Array<{ category: string; cardType: string; budget: number; isMonthly?: boolean }> = d.budgets ?? []
    setExistingBudgets(bRaw.map(b => ({ category: b.category, card_type: b.cardType, budget: b.budget, is_monthly: b.isMonthly ?? false })))
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
    setCategoryRows(prev => prev.map(r => r.name === name && r.card_type === card_type ? { ...r, group_type } : r))
  }

  // ドラッグ&ドロップによる並び替え
  async function handleReorder(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return
    // 表示中の種別の行を取得（現在の並び順で）
    const visibleRows = categoryRows
      .filter(r => catViewType === "joint" ? r.card_type === "joint" : r.card_type !== "joint")
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
    const other = categoryRows.filter(r => catViewType === "joint" ? r.card_type !== "joint" : r.card_type === "joint")

    // 並び替え
    const reordered = [...visibleRows]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)

    // sort_orderを1から振り直し
    const updated = reordered.map((r, i) => ({ ...r, sort_order: i + 1 }))

    // 楽観的更新
    setCategoryRows([...other, ...updated])

    // APIへ保存
    await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reorder",
        updates: updated.map(r => ({ name: r.name, card_type: r.card_type, sort_order: r.sort_order })),
      }),
    })
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
          <div className={isPC ? "grid grid-cols-2 gap-4 items-start" : "space-y-3"}>
            {/* Col1: PDF確認パネル or 通常フォーム */}
            {parsedPayslipItems ? (
              <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-800">📄 給与明細取込プレビュー</h2>
                    {payslipMonth && <p className="text-xs text-gray-400 mt-0.5">{payslipMonth}分</p>}
                  </div>
                  <button onClick={() => { setParsedPayslipItems(null); setPayslipMonth(null) }}
                    className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100">
                    ✕ キャンセル
                  </button>
                </div>

                {/* 支出登録先カード（所得税・立替用） */}
                {parsedPayslipItems.some(i => i.type === "transaction") && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">支出登録先カード（所得税・立替用）</label>
                    <select value={payslipCardId ?? ""}
                      onChange={e => setPayslipCardId(Number(e.target.value))}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-800 bg-white">
                      {cards.filter(c => c.card_type === "self").map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 登録項目一覧 */}
                <div className="border rounded-lg overflow-hidden divide-y">
                  {parsedPayslipItems.map((item, i) => (
                    <label key={item.key}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={item.checked}
                        onChange={e => setParsedPayslipItems(prev => prev!.map((p, j) => j === i ? { ...p, checked: e.target.checked } : p))}
                        className="w-4 h-4 accent-indigo-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${item.type === "income" ? "bg-green-100 text-green-700" : "bg-red-50 text-red-600"}`}>
                            {item.type === "income" ? "収入" : "支出"}
                          </span>
                          <span className="text-xs font-medium text-gray-800">{item.label}</span>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">カテゴリ: {item.category}</p>
                      </div>
                      <span className="text-sm font-semibold text-gray-800 shrink-0">
                        ¥{item.amount.toLocaleString()}
                      </span>
                    </label>
                  ))}
                </div>

                <button onClick={handlePayslipBulkRegister}
                  disabled={payslipSaving || !parsedPayslipItems.some(i => i.checked)}
                  className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">
                  {payslipSaving ? "登録中..." : `${parsedPayslipItems.filter(i => i.checked).length}件を一括登録`}
                </button>
              </div>
            ) : (
              /* 通常フォーム */
              <div className="bg-white rounded-xl shadow-sm p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-700">収入を記録</h2>
                  <label className="flex items-center gap-1 cursor-pointer bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors">
                    <span>📄 給与明細PDF</span>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={async e => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const fd = new FormData()
                        fd.append("file", file)
                        const res = await fetch("/api/import-payslip", { method: "POST", body: fd })
                        const d = await res.json()
                        if (d.error) { alert("PDF解析エラー: " + d.error); return }
                        const selfCard = cards.find(c => c.card_type === "self")
                        setPayslipCardId(selfCard?.id ?? null)
                        setPayslipMonth(d.paymentMonth ?? null)
                        const items: PayslipItem[] = []
                        if (d.netPay) items.push({ key: "income", label: "差引総支給額（給与）", amount: d.netPay, checked: true, type: "income", category: "給与" })
                        if (d.incomeTax) items.push({ key: "incomeTax", label: "所得税", amount: d.incomeTax, checked: true, type: "transaction", category: "給与源泉" })
                        if (d.residentTax) items.push({ key: "residentTax", label: "住民税", amount: d.residentTax, checked: true, type: "transaction", category: "住民税" })
                        if (d.travelReimbursement) items.push({ key: "travel", label: "営業交通費（立替）", amount: d.travelReimbursement, checked: true, type: "transaction", category: "立替" })
                        setParsedPayslipItems(items.length > 0 ? items : null)
                        if (items.length === 0) alert("PDF から金額を取得できませんでした。手動で入力してください。")
                        e.target.value = ""
                      }}
                    />
                  </label>
                </div>
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
                      placeholder="0" className="w-full border rounded-lg pl-7 pr-3 py-2 text-sm text-gray-800" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-700 mb-1 block">メモ（任意）</label>
                  <input type="text" value={incomeMemo} onChange={e => setIncomeMemo(e.target.value)}
                    placeholder="例：3月分給与"
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-800" />
                </div>
                {incomeMsg && <p className="text-xs text-green-600">✅ {incomeMsg}</p>}
                <button onClick={handleSaveIncome} disabled={incomeSaving || !incomeAmount}
                  className="w-full bg-green-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">
                  {incomeSaving ? "保存中..." : "収入を記録"}
                </button>
              </div>
            )}

            {/* 入力済み一覧 */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-3 py-2 bg-green-50 border-b border-green-100 flex items-center justify-between">
                <h2 className="text-xs font-semibold text-green-700">{payslipMonth ?? incomeMonth} の収入記録</h2>
                {monthIncomeRecords.length > 0 && (
                  <span className="text-xs font-bold text-green-700">
                    合計 {new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(
                      monthIncomeRecords.reduce((s, r) => s + r.amount, 0)
                    )}
                  </span>
                )}
              </div>
              {monthIncomeRecords.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-6">この月の収入記録はありません</p>
              ) : (
                monthIncomeRecords.map(r => (
                  <div key={r.id} className="flex items-center gap-2 px-3 py-2.5 border-b last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium shrink-0">
                          {r.category}
                        </span>
                        {r.memo && <span className="text-xs text-gray-500 truncate">{r.memo}</span>}
                      </div>
                      <p className="text-xs text-gray-400">{r.date}</p>
                    </div>
                    <span className="text-sm font-semibold text-gray-800 shrink-0">
                      {new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(r.amount)}
                    </span>
                    <button onClick={() => handleDeleteIncome(r.id)}
                      className="text-gray-300 hover:text-red-400 text-xl leading-none w-6 shrink-0">×</button>
                  </div>
                ))
              )}
            </div>
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
                  onClick={() => {
                    setBudgetCardType("self")
                    if (editingBudgetKey) setEditingBudgetKey(null)
                    // カテゴリを個人の先頭に切り替え
                    const firstSelf = categoryRows.filter(r => r.card_type === "self")[0]
                    if (firstSelf) setBudgetCategory(firstSelf.name)
                    setBudgetAmount("")
                    setBudgetMsg("")
                  }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${budgetCardType === "self" ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-300 text-gray-600"}`}>
                  個人
                </button>
                <button type="button"
                  onClick={() => {
                    setBudgetCardType("joint")
                    if (editingBudgetKey) setEditingBudgetKey(null)
                    // カテゴリを共用の先頭に切り替え
                    const firstJoint = categoryRows.filter(r => r.card_type === "joint")[0]
                    if (firstJoint) setBudgetCategory(firstJoint.name)
                    setBudgetAmount("")
                    setBudgetMsg("")
                  }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${budgetCardType === "joint" ? "bg-amber-500 text-white border-amber-500" : "border-gray-300 text-gray-600"}`}>
                  共用
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-700 mb-1 block">カテゴリ</label>
              <select value={budgetCategory} onChange={e => setBudgetCategory(e.target.value)}
                disabled={!!editingBudgetKey}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-50 disabled:text-gray-600 text-gray-800">
                {categoryRows
                  .filter(r => r.card_type === budgetCardType)
                  .sort((a, b) => {
                    const ai = GROUP_ORDER.indexOf(a.group_type ?? "")
                    const bi = GROUP_ORDER.indexOf(b.group_type ?? "")
                    const aIdx = ai === -1 ? GROUP_ORDER.length : ai
                    const bIdx = bi === -1 ? GROUP_ORDER.length : bi
                    return aIdx !== bIdx ? aIdx - bIdx : a.name.localeCompare(b.name, "ja")
                  })
                  .map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
              </select>
            </div>
            {/* 適用期間：毎月共通 / この月だけ */}
            <div>
              <label className="text-xs text-gray-700 mb-1 block">適用期間</label>
              <div className="flex gap-2 mb-2">
                <button type="button"
                  onClick={() => setBudgetMonth(null)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${budgetMonth === null ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600"}`}>
                  🔁 毎月共通
                </button>
                <button type="button"
                  onClick={() => setBudgetMonth(budgetViewMonth)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${budgetMonth !== null ? "bg-purple-600 text-white border-purple-600" : "border-gray-300 text-gray-600"}`}>
                  📅 この月だけ
                </button>
              </div>
              {budgetMonth !== null && (
                <input type="month" value={budgetMonth} onChange={e => setBudgetMonth(e.target.value)}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm bg-white text-gray-800" />
              )}
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

          {/* 右列: 月ナビ + 予算一覧 */}
          <div className="space-y-2">
          {/* 表示月ナビ */}
          <div className="flex items-center gap-1 bg-white rounded-lg border px-2 py-1.5">
            <button onClick={() => { const [y,mo] = budgetViewMonth.split("-").map(Number); const d = new Date(y, mo-2, 1); setBudgetViewMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`) }}
              className="text-gray-600 hover:text-blue-600 px-1 font-bold">‹</button>
            <input type="month" value={budgetViewMonth} onChange={e => setBudgetViewMonth(e.target.value)}
              className="flex-1 text-center text-xs font-semibold text-gray-800 border-0 outline-none bg-transparent" />
            <button onClick={() => { const [y,mo] = budgetViewMonth.split("-").map(Number); const d = new Date(y, mo, 1); setBudgetViewMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`) }}
              className="text-gray-600 hover:text-blue-600 px-1 font-bold">›</button>
          </div>

          {/* 設定済み予算一覧（budgetCardTypeでフィルタ・グループ別カラーコーディング） */}
          {(() => {
            // 左トグルで選択中の種別のみ表示
            const filteredBudgets = existingBudgets.filter(b => b.card_type === budgetCardType)
            const isJoint = budgetCardType === "joint"

            // カテゴリのgroup_typeをlookup
            const groupTypeMap: Record<string, string | null> = {}
            for (const r of categoryRows) {
              groupTypeMap[`${r.name}:${r.card_type}`] = r.group_type
            }

            // グループ別に分類
            const grouped: Record<string, BudgetRow[]> = {}
            const ungrouped: BudgetRow[] = []
            for (const b of filteredBudgets) {
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
            const totalBudget = filteredBudgets.reduce((s, b) => s + b.budget, 0)

            if (filteredBudgets.length === 0) return (
              <div className="bg-white rounded-xl shadow-sm p-6 text-center text-gray-400 text-xs">
                {isJoint ? "共用" : "個人"}の予算がまだ設定されていません
              </div>
            )

            return (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className={`px-3 py-2 border-b flex justify-between items-center ${isJoint ? "bg-amber-50" : "bg-indigo-50"}`}>
                  <h2 className={`text-xs font-semibold ${isJoint ? "text-amber-700" : "text-indigo-700"}`}>
                    {isJoint ? "共用" : "個人"}の設定済み予算
                  </h2>
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
                          {gc
                            ? <span className={`text-[10px] px-1 py-0.5 rounded text-white font-bold ${gc.bg}`}>{group}</span>
                            : <span className="text-xs font-medium">{group}</span>
                          }
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
                            className={`flex items-center justify-between px-3 py-2 border-b last:border-0 cursor-pointer transition-colors border-l-2 ${gc ? gc.border : "border-l-transparent"} ${isEditing ? "bg-blue-50" : "hover:bg-gray-50"}`}
                            onClick={() => handleEditBudget(b)}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs ${isEditing ? "text-blue-700 font-medium" : "text-gray-700"}`}>{b.category}</span>
                              {b.is_monthly && (
                                <span className="text-[10px] px-1 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">月別</span>
                              )}
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
                <div className={`flex justify-between items-center px-3 py-2 ${isJoint ? "bg-amber-600" : "bg-indigo-700"} text-white`}>
                  <span className="text-xs font-bold">{isJoint ? "共用" : "個人"} 合計</span>
                  <span className="text-xs font-bold">{toJPY(totalBudget)}</span>
                </div>
              </div>
            )
          })()}
          </div>{/* /右列 */}
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
                  // sort_order順で並べる（ドラッグ&ドロップで変更可能）
                  const visibleRows = categoryRows
                    .filter(r => catViewType === "joint" ? r.card_type === "joint" : r.card_type !== "joint")
                    .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
                  if (visibleRows.length === 0) return <p className="text-xs text-gray-400 px-3 py-3">なし</p>
                  return (
                    <>
                      <div className="grid grid-cols-[18px_1fr_auto_auto] bg-gray-50 border-b text-xs text-gray-500 font-medium">
                        <div></div>
                        <div className="px-2 py-1">カテゴリ名</div>
                        <div className="px-2 py-1">グループ</div>
                        <div className="w-7"></div>
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {visibleRows.map((r, idx) => {
                          const gc = r.group_type ? GROUP_COLORS[r.group_type] : null
                          const isDragging = dragIdx === idx
                          const isDragOver = dragOverIdx === idx && dragIdx !== idx
                          return (
                            <div
                              key={`${r.name}-${r.card_type}`}
                              draggable
                              onDragStart={() => setDragIdx(idx)}
                              onDragOver={e => { e.preventDefault(); setDragOverIdx(idx) }}
                              onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
                              onDrop={() => {
                                if (dragIdx !== null) handleReorder(dragIdx, idx)
                                setDragIdx(null)
                                setDragOverIdx(null)
                              }}
                              className={`grid grid-cols-[18px_1fr_auto_auto] items-center border-b last:border-0 border-l-2 transition-all
                                ${gc ? gc.border : "border-l-transparent"}
                                ${isDragging ? "opacity-40 bg-blue-50" : gc ? gc.light : "hover:bg-gray-50"}
                                ${isDragOver ? "border-t-2 border-t-blue-400" : ""}
                              `}
                            >
                              {/* ドラッグハンドル */}
                              <span className="flex items-center justify-center text-gray-300 cursor-grab active:cursor-grabbing select-none text-sm h-full">
                                ⠿
                              </span>
                              <div className="flex items-center gap-1.5 px-2 py-1.5">
                                {gc && (
                                  <span className={`text-[10px] px-1 py-0.5 rounded font-bold text-white shrink-0 ${gc.bg}`}>
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
