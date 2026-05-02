"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"
import { useViewMode } from "@/components/ViewModeContext"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from "recharts"

// ─── ユーティリティ ───────────────────────────────────────────────
function toJPY(n: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n)
}
function toJPYShort(n: number) {
  if (n === 0) return "—"
  return n.toLocaleString()
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

// ─── 定数 ───────────────────────────────────────────────────────
const GROUP_COLORS: Record<string, { header: string; row: string; text: string; border: string; progress: string }> = {
  収入: { header: "bg-green-600 text-white",  row: "bg-green-50",  text: "text-green-700",  border: "border-l-green-400",  progress: "bg-green-500"  },
  支出: { header: "bg-blue-600 text-white",   row: "bg-blue-50",   text: "text-blue-700",   border: "border-l-blue-400",   progress: "bg-blue-500"   },
  振替: { header: "bg-gray-500 text-white",   row: "bg-gray-50",   text: "text-gray-600",   border: "border-l-gray-400",   progress: "bg-gray-400"   },
  投資: { header: "bg-purple-600 text-white", row: "bg-purple-50", text: "text-purple-700", border: "border-l-purple-400", progress: "bg-purple-500" },
  貯蓄: { header: "bg-teal-600 text-white",   row: "bg-teal-50",   text: "text-teal-700",   border: "border-l-teal-400",   progress: "bg-teal-500"   },
  立替: { header: "bg-orange-500 text-white", row: "bg-orange-50", text: "text-orange-700", border: "border-l-orange-400", progress: "bg-orange-400" },
}

const GROUP_ORDER = ["収入", "支出", "振替", "投資", "貯蓄", "立替"]

// ─── 型定義 ─────────────────────────────────────────────────────
interface BudgetRow {
  category: string
  cardType: string
  budget: number
  actual: number
  isMonthly?: boolean
  groupType: string | null
  sortOrder: number | null
  sign: string | null
}

function getEffectiveSign(b: BudgetRow): number {
  if (b.sign === "plus") return 1
  if (b.sign === "minus") return -1
  if (b.sign === "neutral") return 0
  // sign未設定 → group_typeで推測
  if (b.groupType === "収入") return 1
  if (b.groupType === "振替") return 0
  if (b.groupType === "立替") return b.category.includes("精算") ? 1 : -1
  return -1  // 支出・投資・貯蓄・未設定
}

interface CategoryData {
  name: string
  cardType: string
  groupType: string | null
  sortOrder: number
  budget: number
  yearBudget: number
  yearActual: number
  byMonth: Record<string, { budget: number; actual: number }>
}

type MainTab = "monthly" | "yearly"
type ViewMode = "budget" | "actual" | "diff" | "both"
type DisplayMode = "table" | "chart"

// ─── メインページ ────────────────────────────────────────────────
export default function BudgetPage() {
  const { mode } = useViewMode()
  const isPC = mode === "pc"
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const [mainTab, setMainTab] = useState<MainTab>("monthly")

  // ── 月次タブ用 state ──
  const [month, setMonth] = useState(defaultMonth)
  const [cardTypeFilter, setCardTypeFilter] = useState<"self" | "joint">("self")
  const [monthlyLoading, setMonthlyLoading] = useState(true)
  const [budgets, setBudgets] = useState<BudgetRow[]>([])
  const [incomeTotal, setIncomeTotal] = useState(0)
  const [jointIncomeTotal, setJointIncomeTotal] = useState(0)

  // ── 年次タブ用 state ──
  const currentYear = now.getFullYear()
  const [year, setYear] = useState(currentYear)
  const [yearCardTypeFilter, setYearCardTypeFilter] = useState<"self" | "joint">("self")
  const [viewMode, setViewMode] = useState<ViewMode>("actual")
  const [displayMode, setDisplayMode] = useState<DisplayMode>("table")
  const [yearlyLoading, setYearlyLoading] = useState(true)
  const [months, setMonths] = useState<string[]>([])
  const [categories, setCategories] = useState<CategoryData[]>([])
  const [incomeByMonth, setIncomeByMonth] = useState<Record<string, number>>({})

  // ─── データ取得: 月次 ──────────────────────────────────────────
  useEffect(() => {
    setMonthlyLoading(true)
    Promise.all([
      fetch(`/api/budget?month=${month}`).then(r => r.json()),
      fetch(`/api/income?month=${month}&card_type=self`).then(r => r.json()),
      fetch(`/api/income?month=${month}&card_type=joint`).then(r => r.json()),
    ]).then(([budgetData, incomeData, jointIncomeData]) => {
      setBudgets(budgetData.budgets ?? [])
      setIncomeTotal(incomeData.total ?? 0)
      setJointIncomeTotal(jointIncomeData.total ?? 0)
    }).finally(() => setMonthlyLoading(false))
  }, [month])

  // ─── データ取得: 年次 ──────────────────────────────────────────
  useEffect(() => {
    setYearlyLoading(true)
    const from = `${year}-01`
    const to = `${year}-12`
    fetch(`/api/budget-table?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => {
        setMonths(d.months ?? [])
        setCategories(d.categories ?? [])
        setIncomeByMonth(d.incomeByMonth ?? {})
      })
      .finally(() => setYearlyLoading(false))
  }, [year])

  // ─── 月次: グループ集計 ────────────────────────────────────────
  const filteredBudgets = useMemo(() =>
    budgets
      .filter(b => b.cardType === cardTypeFilter)
      .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999)),
    [budgets, cardTypeFilter]
  )

  const monthlyGroups = useMemo(() => {
    const map = new Map<string, BudgetRow[]>()
    for (const b of filteredBudgets) {
      const g = b.groupType ?? "未分類"
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(b)
    }
    const result: Array<{ group: string; rows: BudgetRow[] }> = []
    for (const g of [...GROUP_ORDER, "未分類"]) {
      if (map.has(g)) result.push({ group: g, rows: map.get(g)! })
    }
    for (const [g, rows] of map) {
      if (![...GROUP_ORDER, "未分類"].includes(g)) result.push({ group: g, rows })
    }
    return result
  }, [filteredBudgets])

  // サマリー計算（選択中の cardTypeFilter に連動）
  const selfRows = budgets.filter(b => b.cardType === "self")
  const jointRows = budgets.filter(b => b.cardType === "joint")
  // 支出のみ（sign=-1）の実績・予算合計（収入カテゴリを除外）
  const selfActual = selfRows.filter(r => getEffectiveSign(r) === -1).reduce((s, r) => s + r.actual, 0)
  const jointActual = jointRows.filter(r => getEffectiveSign(r) === -1).reduce((s, r) => s + r.actual, 0)
  const selfBudget = selfRows.filter(r => getEffectiveSign(r) === -1).reduce((s, r) => s + r.budget, 0)
  const jointBudget = jointRows.filter(r => getEffectiveSign(r) === -1).reduce((s, r) => s + r.budget, 0)
  // 個人: 収入 - 個人支出、共用: 入金 - 共用支出（入金があれば入金ベース、なければ予算ベース）
  const selfBalance = incomeTotal - selfActual
  const jointBalance = jointIncomeTotal > 0 ? jointIncomeTotal - jointActual : jointBudget - jointActual

  // ─── 年次: フィルタ・グループ集計 ─────────────────────────────
  const yearFiltered = useMemo(() =>
    categories.filter(c => c.cardType === yearCardTypeFilter),
    [categories, yearCardTypeFilter]
  )

  const yearGroups = useMemo(() => {
    const map = new Map<string, CategoryData[]>()
    for (const c of yearFiltered) {
      const g = c.groupType ?? "未分類"
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(c)
    }
    const ORDER = [...GROUP_ORDER, "未分類"]
    const result: Array<{ group: string; rows: CategoryData[] }> = []
    for (const g of ORDER) {
      if (map.has(g)) result.push({ group: g, rows: map.get(g)! })
    }
    for (const [g, rows] of map) {
      if (!ORDER.includes(g)) result.push({ group: g, rows })
    }
    return result
  }, [yearFiltered])

  const monthlyIncome = useMemo(() =>
    months.map(m => incomeByMonth[m] ?? 0),
    [months, incomeByMonth]
  )
  const yearIncome = monthlyIncome.reduce((s, v) => s + v, 0)

  const chartGroups = useMemo(() =>
    yearGroups.filter(g => g.group !== "収入" && g.group !== "振替"),
    [yearGroups]
  )

  const chartData = useMemo(() => {
    return months.map(m => {
      const point: Record<string, number | string> = { month: m.replace(/^\d{4}-/, "") + "月" }
      for (const { group, rows } of yearGroups) {
        if (group === "収入" || group === "振替") continue
        point[group] = rows.reduce((s, r) => s + (r.byMonth[m]?.actual ?? 0), 0)
      }
      point["予算"] = yearFiltered
        .filter(r => r.groupType !== "収入" && r.groupType !== "振替")
        .reduce((s, r) => s + (r.byMonth[m]?.budget ?? 0), 0)
      if (yearCardTypeFilter === "self") {
        point["収入"] = incomeByMonth[m] ?? 0
      }
      return point
    })
  }, [months, yearGroups, yearFiltered, incomeByMonth, yearCardTypeFilter])

  // ─── インライン予算編集 ────────────────────────────────────────
  const [editingBudget, setEditingBudget] = useState<{
    category: string; cardType: string; value: string; periodType: "monthly" | "this_month"
  } | null>(null)

  async function handleBudgetSave(
    category: string, cardType: string, value: string,
    periodType: "monthly" | "this_month" = "monthly"
  ) {
    const amount = Number(value.replace(/,/g, ""))
    if (isNaN(amount) || value.trim() === "") { setEditingBudget(null); return }
    await fetch("/api/budget", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category, amount, card_type: cardType,
        month: periodType === "this_month" ? month : null,
        is_from_month: false,
      }),
    })
    setBudgets(prev => prev.map(b =>
      b.category === category && b.cardType === cardType ? { ...b, budget: amount } : b
    ))
    setCategories(prev => prev.map(c =>
      c.name === category && c.cardType === cardType ? { ...c, budget: amount, yearBudget: amount * 12 } : c
    ))
    setEditingBudget(null)
  }

  // ─── 年次テーブル: 月別予算インライン編集 ─────────────────────
  const [editingMonthBudget, setEditingMonthBudget] = useState<{
    category: string; cardType: string; month: string; value: string
  } | null>(null)

  async function handleMonthBudgetSave(category: string, cardType: string, m: string, value: string) {
    const amount = Number(value.replace(/,/g, ""))
    if (isNaN(amount) || value.trim() === "") { setEditingMonthBudget(null); return }
    await fetch("/api/budget", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, amount, card_type: cardType, month: m, is_from_month: false }),
    })
    setCategories(prev => prev.map(c => {
      if (c.name !== category || c.cardType !== cardType) return c
      const newByMonth = { ...c.byMonth, [m]: { ...(c.byMonth[m] ?? { actual: 0 }), budget: amount } }
      const newYearBudget = months.reduce((s, mo) => s + (newByMonth[mo]?.budget ?? 0), 0)
      return { ...c, byMonth: newByMonth, yearBudget: newYearBudget, budget: amount }
    }))
    setEditingMonthBudget(null)
  }

  // ─── ドラッグ状態 ─────────────────────────────────────────────
  const [dragItem, setDragItem] = useState<{ group: string; idx: number } | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<{ group: string; idx: number } | null>(null)

  // ─── グループ変更ハンドラ ──────────────────────────────────────
  async function handleSetGroupType(category: string, cardType: string, groupType: string | null) {
    await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: category, card_type: cardType, group_type: groupType }),
    })
    setBudgets(prev => prev.map(b =>
      b.category === category && b.cardType === cardType
        ? { ...b, groupType }
        : b
    ))
  }

  // ─── 並び替えハンドラ ─────────────────────────────────────────
  async function handleReorderDrop(group: string, toIdx: number) {
    if (!dragItem || dragItem.group !== group || dragItem.idx === toIdx) {
      setDragItem(null)
      setDragOverIdx(null)
      return
    }
    const fromIdx = dragItem.idx
    const groupRows = monthlyGroups.find(g => g.group === group)?.rows ?? []
    const newRows = [...groupRows]
    const [moved] = newRows.splice(fromIdx, 1)
    newRows.splice(toIdx, 0, moved)

    // ローカル state を即時反映
    const baseOrder = Math.min(...newRows.map(r => r.sortOrder ?? 0))
    setBudgets(prev => {
      const updated = [...prev]
      newRows.forEach((row, i) => {
        const idx = updated.findIndex(b => b.category === row.category && b.cardType === row.cardType)
        if (idx >= 0) updated[idx] = { ...updated[idx], sortOrder: baseOrder + i }
      })
      return updated
    })

    // API 更新
    await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reorder",
        items: newRows.map((row, i) => ({
          name: row.category,
          card_type: row.cardType,
          sort_order: baseOrder + i,
        })),
      }),
    })
    setDragItem(null)
    setDragOverIdx(null)
  }

  // ─── 月次タブ: グループカードレンダリング ────────────────────
  const renderMonthlyGroupCard = (group: string, rows: BudgetRow[]) => {
    const gc = GROUP_COLORS[group]
    const gBudget = rows.reduce((s, b) => s + b.budget, 0)
    const gActual = rows.reduce((s, b) => s + b.actual, 0)
    const gDiff = gBudget - gActual

    return (
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {/* グループヘッダー */}
        <div className={`px-3 py-2 flex items-center justify-between ${gc?.header ?? "bg-gray-700 text-white"}`}>
          <span className="text-xs font-bold">{group}</span>
          <div className="flex gap-3 text-xs font-semibold">
            <span>予算 {toJPY(gBudget)}</span>
            <span>実績 {toJPY(gActual)}</span>
            <span className={gDiff < 0 ? "text-red-200" : "opacity-90"}>
              {gDiff >= 0 ? "+" : ""}{toJPY(gDiff)}
            </span>
          </div>
        </div>

        {/* カテゴリ行 */}
        <div className="divide-y divide-gray-100">
          {rows.map((b, rowIdx) => {
            const sign = getEffectiveSign(b)
            // sign=-1(支出): 予算-実績 が正なら余り、負なら超過
            // sign=+1(収入/精算): 実績-予算 が正なら余剰、負なら不足
            // sign=0(振替): 差額表示なし
            const effectiveDiff = sign === 1 ? b.actual - b.budget : b.budget - b.actual
            const hasBudget = b.budget > 0
            const isBad = hasBudget && sign !== 0 && effectiveDiff < 0
            const pct = hasBudget ? Math.min((b.actual / b.budget) * 100, 100) : 0
            const isDraggingOver = dragOverIdx?.group === group && dragOverIdx.idx === rowIdx
            const isDragging = dragItem?.group === group && dragItem.idx === rowIdx
            const diffLabel = sign === 1
              ? (isBad ? "▲不足 " : "+余剰 ")
              : (isBad ? "▲超過 " : "+残り ")
            return (
              <div
                key={`${b.category}-${b.cardType}`}
                draggable
                onDragStart={() => setDragItem({ group, idx: rowIdx })}
                onDragOver={e => { e.preventDefault(); setDragOverIdx({ group, idx: rowIdx }) }}
                onDragEnd={() => { setDragItem(null); setDragOverIdx(null) }}
                onDrop={() => handleReorderDrop(group, rowIdx)}
                className={`px-3 py-2.5 border-l-4 cursor-grab active:cursor-grabbing transition-opacity ${
                  gc?.border ?? "border-l-gray-300"
                } ${gc?.row ?? "bg-white"} ${isDragging ? "opacity-40" : "opacity-100"} ${
                  isDraggingOver ? "border-t-2 border-t-blue-400" : ""
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {/* ドラッグハンドル */}
                    <span className="text-gray-400 text-xs cursor-grab shrink-0 select-none font-bold tracking-tighter">⋮⋮</span>
                    <span className={`text-xs font-medium truncate ${gc?.text ?? "text-gray-700"}`}>{b.category}</span>
                    {/* グループ変更ドロップダウン */}
                    <select
                      value={b.groupType ?? ""}
                      onChange={e => handleSetGroupType(b.category, b.cardType, e.target.value || null)}
                      onClick={e => e.stopPropagation()}
                      onDragStart={e => e.stopPropagation()}
                      className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-400 hover:text-gray-700 hover:border-gray-400 cursor-pointer outline-none focus:ring-1 focus:ring-blue-300 transition-colors shrink-0"
                    >
                      <option value="">グループ未設定</option>
                      {GROUP_ORDER.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  {sign !== 0 && hasBudget && (
                    <span className={`text-xs font-semibold shrink-0 ml-2 ${isBad ? "text-red-500" : "text-green-600"}`}>
                      {diffLabel}{toJPY(Math.abs(effectiveDiff))}
                    </span>
                  )}
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5 mb-1">
                  <div
                    className={`h-1.5 rounded-full ${isBad ? "bg-red-400" : (gc?.progress ?? "bg-blue-500")}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[11px] text-gray-500">
                  <span>実績 {toJPY(b.actual)}</span>
                  {editingBudget?.category === b.category && editingBudget?.cardType === b.cardType ? (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
                      {/* 毎月 / 今月 トグル */}
                      <div className="flex rounded overflow-hidden border border-gray-200 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setEditingBudget({ ...editingBudget, periodType: "monthly" })}
                          className={`px-1.5 py-0.5 transition-colors ${editingBudget.periodType === "monthly" ? "bg-blue-500 text-white" : "bg-white text-gray-500"}`}
                        >毎月</button>
                        <button
                          type="button"
                          onClick={() => setEditingBudget({ ...editingBudget, periodType: "this_month" })}
                          className={`px-1.5 py-0.5 transition-colors border-l border-gray-200 ${editingBudget.periodType === "this_month" ? "bg-purple-500 text-white" : "bg-white text-gray-500"}`}
                        >今月</button>
                      </div>
                      <input
                        type="text"
                        autoFocus
                        value={editingBudget.value}
                        onChange={e => setEditingBudget({ ...editingBudget, value: e.target.value })}
                        onBlur={() => handleBudgetSave(b.category, b.cardType, editingBudget.value, editingBudget.periodType)}
                        onKeyDown={e => {
                          if (e.key === "Enter") handleBudgetSave(b.category, b.cardType, editingBudget.value, editingBudget.periodType)
                          if (e.key === "Escape") setEditingBudget(null)
                        }}
                        className="w-20 text-right text-xs border border-blue-400 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                      />
                    </div>
                  ) : (
                    <span
                      onClick={e => { e.stopPropagation(); setEditingBudget({ category: b.category, cardType: b.cardType, value: b.budget > 0 ? String(b.budget) : "", periodType: "monthly" }) }}
                      className="cursor-pointer hover:text-blue-600 hover:underline"
                      title="クリックして予算を編集"
                    >
                      予算 {b.budget > 0 ? toJPY(b.budget) : "—"}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ─── JSX ────────────────────────────────────────────────────────
  return (
    <div className={mode === "mobile" ? "pb-20" : ""}>
      <PageHeader title="予算管理" />
      <div className={isPC ? "px-6 py-4" : "px-3 py-2"}>

        {/* メインタブ切替 */}
        <div className="flex rounded-xl bg-gray-100 p-1 mb-3">
          {([["monthly", "月次"], ["yearly", "年次"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setMainTab(k)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mainTab === k ? "bg-white shadow-sm text-blue-600" : "text-gray-600"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════
            月次タブ
        ═══════════════════════════════════════════════════════ */}
        {mainTab === "monthly" && (
          <div className="space-y-3">
            {/* 月選択 */}
            <div className="flex items-center gap-2 bg-white rounded-xl shadow-sm px-3 py-2">
              <button onClick={() => setMonth(prevMonth(month))}
                className="text-gray-600 hover:text-blue-600 px-2 py-1 rounded hover:bg-gray-100 text-lg font-bold">‹</button>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                className="flex-1 text-center text-sm font-semibold text-gray-800 border-0 outline-none bg-transparent" />
              <button onClick={() => setMonth(nextMonth(month))}
                className="text-gray-600 hover:text-blue-600 px-2 py-1 rounded hover:bg-gray-100 text-lg font-bold">›</button>
            </div>

            {/* 収支サマリーカード（個人/共用で切替） */}
            {cardTypeFilter === "self" ? (
              <div className={`grid ${isPC ? "grid-cols-4" : "grid-cols-2"} gap-2`}>
                <div className="bg-white rounded-xl shadow-sm p-3 text-center">
                  <p className="text-[11px] text-gray-500 mb-1">収入</p>
                  <p className="text-sm font-bold text-green-600">{toJPY(incomeTotal)}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-3 text-center">
                  <p className="text-[11px] text-gray-500 mb-1">支出実績</p>
                  <p className={`text-sm font-bold ${selfActual > selfBudget && selfBudget > 0 ? "text-red-500" : "text-gray-800"}`}>
                    {toJPY(selfActual)}
                  </p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-3 text-center">
                  <p className="text-[11px] text-gray-500 mb-1">予算合計</p>
                  <p className="text-sm font-bold text-gray-700">{toJPY(selfBudget)}</p>
                </div>
                <div className={`rounded-xl shadow-sm p-3 text-center ${selfBalance >= 0 ? "bg-blue-50" : "bg-red-50"}`}>
                  <p className="text-[11px] text-gray-500 mb-1">収支差額</p>
                  <p className={`text-sm font-bold ${selfBalance >= 0 ? "text-blue-600" : "text-red-500"}`}>
                    {selfBalance >= 0 ? "+" : ""}{toJPY(selfBalance)}
                  </p>
                </div>
              </div>
            ) : (
              <div className={`grid ${isPC ? "grid-cols-4" : "grid-cols-2"} gap-2`}>
                <div className="bg-white rounded-xl shadow-sm p-3 text-center">
                  <p className="text-[11px] text-gray-500 mb-1">入金</p>
                  <p className="text-sm font-bold text-green-600">{toJPY(jointIncomeTotal)}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-3 text-center">
                  <p className="text-[11px] text-gray-500 mb-1">支出実績</p>
                  <p className={`text-sm font-bold ${jointActual > jointBudget && jointBudget > 0 ? "text-red-500" : "text-gray-800"}`}>
                    {toJPY(jointActual)}
                  </p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-3 text-center">
                  <p className="text-[11px] text-gray-500 mb-1">予算合計</p>
                  <p className="text-sm font-bold text-gray-700">{toJPY(jointBudget)}</p>
                </div>
                <div className={`rounded-xl shadow-sm p-3 text-center ${jointBalance >= 0 ? "bg-amber-50" : "bg-red-50"}`}>
                  <p className="text-[11px] text-gray-500 mb-1">収支差額</p>
                  <p className={`text-sm font-bold ${jointBalance >= 0 ? "text-amber-600" : "text-red-500"}`}>
                    {jointBalance >= 0 ? "+" : ""}{toJPY(jointBalance)}
                  </p>
                </div>
              </div>
            )}

            {/* 個人/共用トグル */}
            <div className="flex rounded-lg bg-gray-100 p-0.5">
              {([["self", "個人"] as const, ["joint", "共用"] as const]).map(([k, label]) => (
                <button key={k} onClick={() => setCardTypeFilter(k)}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    cardTypeFilter === k
                      ? k === "self" ? "bg-white text-indigo-600 shadow-sm" : "bg-white text-amber-600 shadow-sm"
                      : "text-gray-500"
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            {monthlyLoading && (
              <div className="text-center py-8 text-gray-400 text-sm">読み込み中...</div>
            )}

            {!monthlyLoading && filteredBudgets.length === 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6 text-center space-y-3">
                <p className="text-gray-600 text-sm">予算が設定されていません</p>
                <Link href="/settings"
                  className="inline-block bg-blue-600 text-white text-sm px-4 py-2 rounded-lg">
                  設定から予算を追加する
                </Link>
              </div>
            )}

            {!monthlyLoading && filteredBudgets.length > 0 && (
              isPC ? (
                /* PC: CSS columns で高さを自動バランス */
                <div style={{ columnCount: 2, columnGap: "1rem" }}>
                  {monthlyGroups.map(({ group, rows }) => (
                    <div key={group} style={{ breakInside: "avoid" as const, marginBottom: "0.75rem" }}>
                      {renderMonthlyGroupCard(group, rows)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {monthlyGroups.map(({ group, rows }) => (
                    <div key={group}>{renderMonthlyGroupCard(group, rows)}</div>
                  ))}
                </div>
              )
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            年次タブ
        ═══════════════════════════════════════════════════════ */}
        {mainTab === "yearly" && (
          <div className="space-y-3">
            {/* コントロールバー */}
            <div className="flex flex-wrap items-center gap-2">
              {/* 年選択 */}
              <div className="flex items-center gap-1 bg-white border rounded-lg px-2 py-1.5">
                <button onClick={() => setYear(y => y - 1)}
                  className="text-gray-600 hover:text-blue-600 px-1 font-bold text-sm">‹</button>
                <span className="text-sm font-semibold text-gray-800 w-16 text-center">{year}年</span>
                <button onClick={() => setYear(y => y + 1)}
                  className="text-gray-600 hover:text-blue-600 px-1 font-bold text-sm">›</button>
              </div>

              {/* 個人/共用 */}
              <div className="flex rounded-lg bg-gray-100 p-0.5">
                {([["self", "個人"] as const, ["joint", "共用"] as const]).map(([k, label]) => (
                  <button key={k} onClick={() => setYearCardTypeFilter(k)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      yearCardTypeFilter === k
                        ? k === "self" ? "bg-white text-indigo-600 shadow-sm" : "bg-white text-amber-600 shadow-sm"
                        : "text-gray-500"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* テーブル/グラフ切替 */}
              <div className="flex rounded-lg bg-gray-100 p-0.5">
                {([["table", "テーブル"], ["chart", "グラフ"]] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setDisplayMode(k)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      displayMode === k ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* 表示モード（テーブル時のみ） */}
              {displayMode === "table" && (
                <div className="flex rounded-lg bg-gray-100 p-0.5">
                  {([["budget", "予算"], ["actual", "実績"], ["diff", "差額"], ["both", "両方"]] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setViewMode(k)}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        viewMode === k ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              <span className="text-xs text-gray-400 ml-auto">{months.length}ヶ月</span>
            </div>

            {yearlyLoading && (
              <div className="text-center py-12 text-gray-400 text-sm">読み込み中...</div>
            )}

            {/* ── グラフ表示 ── */}
            {!yearlyLoading && displayMode === "chart" && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4">
                {/* 月次 実績 vs 予算 積み上げバーチャート */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-600 mb-3">月次支出: グループ別実績 vs 予算</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="25%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        tickFormatter={v => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : String(v)}
                        width={44}
                      />
                      <Tooltip
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(v: any) => v != null ? [`¥${Number(v).toLocaleString()}`] : ["—"]}
                        contentStyle={{ fontSize: 11 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="予算" fill="#94a3b8" opacity={0.35} radius={[3, 3, 0, 0]} />
                      {chartGroups.map(({ group }) => {
                        const colorMap: Record<string, string> = {
                          支出: "#6366f1", 投資: "#a855f7", 貯蓄: "#14b8a6", 立替: "#f97316",
                        }
                        return (
                          <Bar key={group} dataKey={group} stackId="actual"
                            fill={colorMap[group] ?? "#64748b"}
                            radius={group === chartGroups[chartGroups.length - 1].group ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                          />
                        )
                      })}
                      {yearCardTypeFilter === "self" && (
                        <Bar dataKey="収入" fill="#22c55e" opacity={0.7} radius={[3, 3, 0, 0]} />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* 月次収支バランス（個人のみ） */}
                {yearCardTypeFilter === "self" && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-600 mb-3">月次収支バランス（収入 − 支出実績）</h3>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart
                        data={chartData.map(d => {
                          const expense = chartGroups.reduce((s, { group }) => s + (Number(d[group]) || 0), 0)
                          return { month: d.month, 収支: (Number(d["収入"]) || 0) - expense }
                        })}
                        margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          tickFormatter={v => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : v < -10000 ? `-${(Math.abs(v) / 10000).toFixed(0)}万` : String(v)}
                          width={44}
                        />
                        <Tooltip
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(v: any) => v != null ? [`¥${Number(v).toLocaleString()}`] : ["—"]}
                          contentStyle={{ fontSize: 11 }}
                        />
                        <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1.5} />
                        <Bar dataKey="収支" fill="#22c55e" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* 年間サマリー */}
                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100">
                  {chartGroups.map(({ group, rows }) => {
                    const actual = rows.reduce((s, r) => s + r.yearActual, 0)
                    const budget = rows.reduce((s, r) => s + r.yearBudget, 0)
                    const over = actual > budget && budget > 0
                    return (
                      <div key={group} className={`rounded-lg p-2.5 ${GROUP_COLORS[group]?.row ?? "bg-gray-50"}`}>
                        <p className={`text-[10px] font-semibold ${GROUP_COLORS[group]?.text ?? "text-gray-600"}`}>{group}</p>
                        <p className={`text-sm font-bold mt-0.5 ${over ? "text-red-500" : "text-gray-800"}`}>
                          {actual.toLocaleString()}
                        </p>
                        {budget > 0 && (
                          <p className="text-[10px] text-gray-400">予算 {budget.toLocaleString()}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── テーブル表示 ── */}
            {!yearlyLoading && displayMode === "table" && (
              <div className="overflow-x-auto rounded-xl shadow-sm border border-gray-200 bg-white">
                <table className="text-xs border-collapse" style={{ minWidth: `${140 + months.length * 90 + 100}px` }}>
                  <thead>
                    <tr className="bg-gray-800 text-white sticky top-0 z-10">
                      <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-gray-800 z-20 min-w-[140px]">
                        カテゴリ
                      </th>
                      {months.map(m => (
                        <th key={m} className={`text-right px-2 py-2 font-medium min-w-[90px] ${
                          m === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}` ? "bg-blue-700" : ""
                        }`}>
                          {m.replace(/^\d{4}-/, "")}月
                        </th>
                      ))}
                      <th className="text-right px-3 py-2 font-semibold min-w-[100px] bg-gray-700">年計</th>
                    </tr>

                    {/* 収入行は収入グループ内カテゴリ行に統合したため非表示 */}
                  </thead>

                  <tbody>
                    {yearGroups.map(({ group, rows }) => {
                      const gc = GROUP_COLORS[group]
                      const groupYearBudget = rows.reduce((s, r) => s + r.yearBudget, 0)
                      const groupYearActual = rows.reduce((s, r) => s + r.yearActual, 0)
                      const groupDiff = groupYearBudget - groupYearActual

                      return (
                        <>
                          {/* グループヘッダー行 */}
                          <tr key={`grp-${group}`} className={`border-b ${gc?.header ?? "bg-gray-700 text-white"}`}>
                            <td className={`sticky left-0 px-3 py-1 font-bold text-xs ${gc?.header ?? "bg-gray-700 text-white"}`}>
                              {group}
                            </td>
                            {months.map(m => {
                              const mBudget = rows.reduce((s, r) => s + (r.byMonth[m]?.budget ?? 0), 0)
                              const mActual = rows.reduce((s, r) => s + (r.byMonth[m]?.actual ?? 0), 0)
                              const diff = mBudget - mActual
                              return (
                                <td key={m} className="text-right px-2 py-1 font-semibold">
                                  {viewMode === "budget" && <span className="opacity-80">{toJPYShort(mBudget)}</span>}
                                  {viewMode === "actual" && <span>{toJPYShort(mActual)}</span>}
                                  {viewMode === "diff" && (
                                    <span className={diff < 0 ? "text-red-200" : "opacity-80"}>
                                      {diff >= 0 ? "+" : ""}{toJPYShort(diff)}
                                    </span>
                                  )}
                                  {viewMode === "both" && (
                                    <span className="text-[10px]">
                                      <span>{toJPYShort(mActual)}</span>
                                      <br />
                                      <span className={diff < 0 ? "text-red-200" : "opacity-70"}>
                                        {diff >= 0 ? "+" : ""}{toJPYShort(diff)}
                                      </span>
                                    </span>
                                  )}
                                </td>
                              )
                            })}
                            <td className="text-right px-3 py-1 font-bold bg-black/10">
                              {viewMode === "budget" && toJPYShort(groupYearBudget)}
                              {viewMode === "actual" && toJPYShort(groupYearActual)}
                              {viewMode === "diff" && (
                                <span className={groupDiff < 0 ? "text-red-200" : ""}>
                                  {groupDiff >= 0 ? "+" : ""}{toJPYShort(groupDiff)}
                                </span>
                              )}
                              {viewMode === "both" && (
                                <span className="text-[10px]">
                                  <span>{toJPYShort(groupYearActual)}</span>
                                  <br />
                                  <span className={groupDiff < 0 ? "text-red-200" : "opacity-80"}>
                                    {groupDiff >= 0 ? "+" : ""}{toJPYShort(groupDiff)}
                                  </span>
                                </span>
                              )}
                            </td>
                          </tr>

                          {/* カテゴリ行 */}
                          {rows.map(row => {
                            const diff = row.yearBudget - row.yearActual
                            return (
                              <tr key={`${row.name}-${row.cardType}`}
                                className={`border-b border-gray-100 hover:bg-yellow-50 transition-colors ${gc?.row ?? "bg-white"}`}>
                                <td className={`sticky left-0 px-3 py-1.5 ${gc?.row ?? "bg-white"} border-r border-gray-100`}>
                                  <span className={`font-medium ${gc?.text ?? "text-gray-700"}`}>{row.name}</span>
                                </td>
                                {months.map(m => {
                                  const { budget: mb, actual: ma } = row.byMonth[m] ?? { budget: 0, actual: 0 }
                                  const mdiff = mb - ma
                                  const isOver = ma > mb && mb > 0
                                  const isEditingCell = editingMonthBudget?.category === row.name && editingMonthBudget?.cardType === row.cardType && editingMonthBudget?.month === m
                                  return (
                                    <td key={m} className={`text-right px-2 py-1 group/cell ${isOver && viewMode === "actual" ? "bg-red-50" : ""}`}>
                                      {viewMode === "budget" && (
                                        isEditingCell ? (
                                          <input
                                            type="text"
                                            autoFocus
                                            value={editingMonthBudget.value}
                                            onChange={e => setEditingMonthBudget({ ...editingMonthBudget, value: e.target.value })}
                                            onBlur={() => handleMonthBudgetSave(row.name, row.cardType, m, editingMonthBudget.value)}
                                            onKeyDown={e => {
                                              if (e.key === "Enter") handleMonthBudgetSave(row.name, row.cardType, m, editingMonthBudget.value)
                                              if (e.key === "Escape") setEditingMonthBudget(null)
                                            }}
                                            className="w-16 text-right border border-blue-400 rounded px-1 py-0 outline-none bg-white text-gray-800 text-xs"
                                          />
                                        ) : (
                                          <span
                                            onClick={() => setEditingMonthBudget({ category: row.name, cardType: row.cardType, month: m, value: mb > 0 ? String(mb) : "" })}
                                            className={`font-medium cursor-pointer hover:text-blue-500 hover:underline ${mb > 0 ? "text-gray-700" : "text-gray-200 opacity-0 group-hover/cell:opacity-100"}`}
                                            title="クリックして予算を設定"
                                          >
                                            {mb > 0 ? toJPYShort(mb) : "+ 予算"}
                                          </span>
                                        )
                                      )}
                                      {viewMode === "actual" && (
                                        <span className={`font-medium ${isOver ? "text-red-500" : ma > 0 ? "text-gray-800" : "text-gray-300"}`}>
                                          {ma > 0 ? toJPYShort(ma) : "—"}
                                        </span>
                                      )}
                                      {viewMode === "diff" && (
                                        <span className={`font-medium ${mb === 0 ? "text-gray-300" : mdiff < 0 ? "text-red-500" : "text-green-600"}`}>
                                          {mb > 0 ? `${mdiff >= 0 ? "+" : ""}${toJPYShort(mdiff)}` : "—"}
                                        </span>
                                      )}
                                      {viewMode === "both" && (
                                        <span className="text-[10px] leading-snug block">
                                          {/* 実績行 */}
                                          <span className={`block font-medium ${isOver ? "text-red-500" : ma > 0 ? "text-gray-800" : "text-gray-300"}`}>
                                            {ma > 0 ? toJPYShort(ma) : "—"}
                                          </span>
                                          {/* 予算行（クリックで編集） */}
                                          {isEditingCell ? (
                                            <input
                                              type="text"
                                              autoFocus
                                              value={editingMonthBudget.value}
                                              onChange={e => setEditingMonthBudget({ ...editingMonthBudget, value: e.target.value })}
                                              onBlur={() => handleMonthBudgetSave(row.name, row.cardType, m, editingMonthBudget.value)}
                                              onKeyDown={e => {
                                                if (e.key === "Enter") handleMonthBudgetSave(row.name, row.cardType, m, editingMonthBudget.value)
                                                if (e.key === "Escape") setEditingMonthBudget(null)
                                              }}
                                              className="w-16 text-right border border-blue-400 rounded px-1 py-0 outline-none bg-white text-gray-800"
                                            />
                                          ) : (
                                            <span
                                              onClick={() => setEditingMonthBudget({ category: row.name, cardType: row.cardType, month: m, value: mb > 0 ? String(mb) : "" })}
                                              className={`block cursor-pointer hover:text-blue-500 hover:underline ${mb > 0 ? (mdiff < 0 ? "text-red-400" : "text-blue-400") : "text-gray-200 opacity-0 group-hover/cell:opacity-100"}`}
                                              title="クリックして予算を設定"
                                            >
                                              {mb > 0 ? `予${toJPYShort(mb)}` : "+ 予算"}
                                            </span>
                                          )}
                                        </span>
                                      )}
                                    </td>
                                  )
                                })}
                                {/* 年計 */}
                                <td className="text-right px-3 py-1.5 bg-gray-50 border-l border-gray-100">
                                  {viewMode === "budget" && (
                                    <span className="font-semibold text-gray-700">
                                      {row.yearBudget > 0 ? toJPYShort(row.yearBudget) : "—"}
                                    </span>
                                  )}
                                  {viewMode === "actual" && (
                                    <span className={`font-semibold ${row.yearActual > row.yearBudget && row.yearBudget > 0 ? "text-red-500" : "text-gray-800"}`}>
                                      {row.yearActual > 0 ? toJPYShort(row.yearActual) : "—"}
                                    </span>
                                  )}
                                  {viewMode === "diff" && (
                                    <span className={`font-semibold ${row.yearBudget === 0 ? "text-gray-300" : diff < 0 ? "text-red-500" : "text-green-600"}`}>
                                      {row.yearBudget > 0 ? `${diff >= 0 ? "+" : ""}${toJPYShort(diff)}` : "—"}
                                    </span>
                                  )}
                                  {viewMode === "both" && (
                                    <span className="text-[10px] leading-tight">
                                      <span className={`block font-semibold ${row.yearActual > 0 ? "text-gray-800" : "text-gray-300"}`}>
                                        {row.yearActual > 0 ? toJPYShort(row.yearActual) : "—"}
                                      </span>
                                      {row.yearBudget > 0 && (
                                        <span className={`block font-medium ${diff < 0 ? "text-red-500" : "text-green-600"}`}>
                                          {diff >= 0 ? "+" : ""}{toJPYShort(diff)}
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* 凡例 */}
            {!yearlyLoading && (
              <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                <span>赤背景 = 予算超過</span>
                <span className="text-red-400">赤文字 = 超過額</span>
                <span className="text-green-500">緑文字 = 余剰</span>
                <span className="text-blue-400">青ヘッダー = 当月</span>
              </div>
            )}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  )
}
