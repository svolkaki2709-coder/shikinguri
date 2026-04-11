"use client"

import { useEffect, useState } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts"

const PIE_COLORS = [
  "#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6",
  "#ec4899","#14b8a6","#f97316","#6366f1","#84cc16",
]

function toJPY(n: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n)
}

function fmt(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return n.toLocaleString()
}

interface CardSummary { cardId: number; cardName: string; cardType: string; color: string; total: number }
interface CategoryRow { category: string; amount: number }
interface MonthlyRow { month: string; total: number; jointTotal: number; selfTotal: number }
interface BudgetRow { category: string; cardType: string; budget: number; actual: number }
interface AssetRow { month: string; savings: number; investment: number; total: number }

type Tab = "monthly" | "budget" | "assets"

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

export default function DashboardPage() {
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const [month, setMonth] = useState(defaultMonth)
  const [apiError, setApiError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("monthly")
  const [loading, setLoading] = useState(true)

  // Monthly tab data
  const [cardSummary, setCardSummary] = useState<CardSummary[]>([])
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryRow[]>([])
  const [monthly, setMonthly] = useState<MonthlyRow[]>([])
  const [incomeTotal, setIncomeTotal] = useState(0)
  const [budgetVsActual, setBudgetVsActual] = useState<BudgetRow[]>([])

  // Assets tab data
  const [assets, setAssets] = useState<AssetRow[]>([])

  useEffect(() => {
    setLoading(true)
    setApiError(null)
    fetch(`/api/dashboard?month=${month}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setApiError(d.error); return }
        setCardSummary(d.cardSummary ?? [])
        setCategoryBreakdown(d.categoryBreakdown ?? [])
        setMonthly(d.monthly ?? [])
        setIncomeTotal(d.incomeTotal ?? 0)
        setBudgetVsActual(d.budgetVsActual ?? [])
      })
      .catch(e => setApiError(e.message))
      .finally(() => setLoading(false))
  }, [month])

  useEffect(() => {
    if (tab === "assets") {
      fetch("/api/assets").then(r => r.json()).then(d => setAssets(d.assets ?? []))
    }
  }, [tab])

  const [trendPeriod, setTrendPeriod] = useState<"6m" | "12m" | "year">("6m")
  const [trendFY, setTrendFY] = useState<number | null>(null)

  // 月データから利用可能な年を計算（1月〜12月）
  function getFY(month: string): number {
    return Number(month.split("-")[0])
  }
  const availableFYs = [...new Set(monthly.map(m => getFY(m.month)))].sort()

  // 期間に応じた表示データを選択
  function getTrendData(): MonthlyRow[] {
    if (trendPeriod === "6m") return monthly.slice(-6)
    if (trendPeriod === "12m") return monthly.slice(-12)
    // 年度別
    const fy = trendFY ?? availableFYs[availableFYs.length - 1]
    if (!fy) return monthly
    return monthly.filter(m => getFY(m.month) === fy)
  }
  const trendData = getTrendData()

  const totalExpense = cardSummary.reduce((s, c) => s + c.total, 0)
  const balance = incomeTotal - totalExpense

  const tabs: { key: Tab; label: string }[] = [
    { key: "monthly", label: "月次" },
    { key: "budget", label: "予算" },
    { key: "assets", label: "資産" },
  ]

  return (
    <div className="pb-20">
      <PageHeader title="ダッシュボード" />
      <main className="max-w-md mx-auto px-4 py-2 space-y-3">
        {/* 月選択 */}
        <div className="flex items-center gap-2 bg-white rounded-xl shadow-sm px-3 py-2">
          <button
            onClick={() => setMonth(prevMonth(month))}
            className="text-gray-600 hover:text-blue-600 px-2 py-1 rounded hover:bg-gray-100 text-lg font-bold"
          >‹</button>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="flex-1 text-center text-base font-semibold text-gray-800 border-0 outline-none bg-transparent"
          />
          <button
            onClick={() => setMonth(nextMonth(month))}
            className="text-gray-600 hover:text-blue-600 px-2 py-1 rounded hover:bg-gray-100 text-lg font-bold"
          >›</button>
        </div>

        {/* APIエラー表示 */}
        {apiError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
            エラー: {apiError}
          </div>
        )}

        {/* タブ */}
        <div className="flex rounded-xl bg-gray-100 p-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? "bg-white shadow-sm text-blue-600" : "text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && <div className="text-center py-6 text-gray-600">読み込み中...</div>}

        {/* === 月次タブ === */}
        {!loading && tab === "monthly" && (
          <>
            {/* 収支サマリー */}
            <div className="bg-white rounded-xl shadow-sm p-3">
              <p className="text-xs text-gray-700 mb-2">{month} 収支</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-gray-700">収入</p>
                  <p className="text-base font-bold text-green-600">{toJPY(incomeTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-700">支出</p>
                  <p className="text-base font-bold text-red-500">{toJPY(totalExpense)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-700">収支</p>
                  <p className={`text-base font-bold ${balance >= 0 ? "text-blue-600" : "text-red-600"}`}>
                    {balance >= 0 ? "+" : ""}{toJPY(balance)}
                  </p>
                </div>
              </div>
            </div>

            {/* カード別支出 */}
            <div className="bg-white rounded-xl shadow-sm p-3">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">カード別支出</h2>
              <div className="space-y-3">
                {cardSummary.map(c => (
                  <div key={c.cardId}>
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                        <span className="text-sm text-gray-700">{c.cardName}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: c.color + "22", color: c.color }}>
                          {c.cardType === "joint" ? "共用" : "個人"}
                        </span>
                      </div>
                      <span className="text-sm font-semibold">{toJPY(c.total)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full"
                        style={{ width: `${totalExpense > 0 ? (c.total / totalExpense) * 100 : 0}%`, backgroundColor: c.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* カテゴリ別円グラフ */}
            {categoryBreakdown.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-3">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">カテゴリ別内訳</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={categoryBreakdown} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={75} labelLine={false}>
                      {categoryBreakdown.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => toJPY(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 space-y-1">
                  {categoryBreakdown.map((c, i) => (
                    <div key={c.category} className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-gray-700">{c.category}</span>
                      </div>
                      <span className="font-medium">{toJPY(c.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 月別推移 */}
            {monthly.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-3">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <h2 className="text-sm font-semibold text-gray-700">月別推移</h2>
                  <div className="flex items-center gap-1">
                    {(["6m", "12m", "year"] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => setTrendPeriod(p)}
                        className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                          trendPeriod === p ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {p === "6m" ? "6ヶ月" : p === "12m" ? "12ヶ月" : "年度別"}
                      </button>
                    ))}
                    {trendPeriod === "year" && availableFYs.length > 0 && (
                      <select
                        value={trendFY ?? availableFYs[availableFYs.length - 1]}
                        onChange={e => setTrendFY(Number(e.target.value))}
                        className="border rounded px-1.5 py-0.5 text-xs bg-white text-gray-800 ml-1"
                      >
                        {availableFYs.map(fy => (
                          <option key={fy} value={fy}>{fy}年（1月〜12月）</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={trendData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => v.replace(/^\d{4}-/, "")} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${fmt(Number(v))}`} />
                    <Tooltip formatter={(v) => toJPY(Number(v))} labelFormatter={v => String(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="selfTotal" stackId="a" fill="#6366f1" name="個人" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="jointTotal" stackId="a" fill="#f59e0b" name="共用" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}

        {/* === 予算タブ === */}
        {!loading && tab === "budget" && (
          <div className="bg-white rounded-xl shadow-sm p-3">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">予算 vs 実績</h2>
            {budgetVsActual.length === 0 ? (
              <p className="text-center text-gray-600 text-sm py-6">予算が設定されていません</p>
            ) : (
              <div className="space-y-3">
                {budgetVsActual.map(b => {
                  const pct = b.budget > 0 ? Math.min((b.actual / b.budget) * 100, 100) : 0
                  const over = b.actual > b.budget
                  return (
                    <div key={`${b.category}-${b.cardType}`}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700">{b.category}</span>
                        <span className={over ? "text-red-500 font-semibold" : "text-gray-700"}>
                          {toJPY(b.actual)} / {toJPY(b.budget)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${over ? "bg-red-400" : "bg-blue-400"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* === 資産タブ === */}
        {tab === "assets" && (
          <>
            {assets.length > 0 && (
              <>
                <div className="bg-white rounded-xl shadow-sm p-3">
                  <p className="text-xs text-gray-700 mb-1">最新資産合計（{assets[assets.length - 1]?.month}）</p>
                  <p className="text-3xl font-bold text-blue-600">{toJPY(assets[assets.length - 1]?.total ?? 0)}</p>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-center">
                    <div className="bg-green-50 rounded-lg p-2">
                      <p className="text-xs text-gray-700">貯金</p>
                      <p className="text-sm font-bold text-green-600">{toJPY(assets[assets.length - 1]?.savings ?? 0)}</p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-2">
                      <p className="text-xs text-gray-700">投資 (NISA)</p>
                      <p className="text-sm font-bold text-purple-600">{toJPY(assets[assets.length - 1]?.investment ?? 0)}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-3">
                  <h2 className="text-sm font-semibold text-gray-700 mb-3">資産推移</h2>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={assets} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => v.replace(/^\d{4}-/, "")} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${fmt(Number(v))}`} />
                      <Tooltip formatter={(v) => toJPY(Number(v))} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="savings" stroke="#10b981" name="貯金" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="investment" stroke="#8b5cf6" name="投資" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="total" stroke="#3b82f6" name="合計" dot={false} strokeWidth={2} strokeDasharray="4 2" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
            {assets.length === 0 && (
              <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-600 text-sm">
                資産データがありません。<br />「資産」ページから入力してください。
              </div>
            )}
          </>
        )}
      </main>
      <BottomNav />
    </div>
  )
}
