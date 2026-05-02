"use client"

import { useEffect, useState } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"
import { useViewMode } from "@/components/ViewModeContext"
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
interface AssetRow { month: string; savings: number; investment: number; total: number }

type Tab = "monthly" | "assets"

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
  const { mode } = useViewMode()
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const [month, setMonth] = useState(defaultMonth)
  const [apiError, setApiError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("monthly")
  const [viewType, setViewType] = useState<"self" | "joint">("self")
  const [loading, setLoading] = useState(true)

  const [cardSummary, setCardSummary] = useState<CardSummary[]>([])
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryRow[]>([])
  const [monthly, setMonthly] = useState<MonthlyRow[]>([])
  const [incomeTotal, setIncomeTotal] = useState(0)
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

  function getFY(m: string): number { return Number(m.split("-")[0]) }
  const availableFYs = [...new Set(monthly.map(m => getFY(m.month)))].sort()

  function getTrendData(): MonthlyRow[] {
    if (trendPeriod === "6m") return monthly.slice(-6)
    if (trendPeriod === "12m") return monthly.slice(-12)
    const fy = trendFY ?? availableFYs[availableFYs.length - 1]
    if (!fy) return monthly
    return monthly.filter(m => getFY(m.month) === fy)
  }
  const trendData = getTrendData()

  const selfCards = cardSummary.filter(c => c.cardType === "self")
  const jointCards = cardSummary.filter(c => c.cardType === "joint")
  const selfTotal = selfCards.reduce((s, c) => s + c.total, 0)
  const jointTotal = jointCards.reduce((s, c) => s + c.total, 0)
  const totalExpense = cardSummary.reduce((s, c) => s + c.total, 0)

  const viewCards = viewType === "self" ? selfCards : jointCards
  const viewTotal = viewType === "self" ? selfTotal : jointTotal
  const viewColor = viewType === "self" ? "#6366f1" : "#f59e0b"
  const viewBarKey = viewType === "self" ? "selfTotal" : "jointTotal"

  const tabs: { key: Tab; label: string }[] = [
    { key: "monthly", label: "月次" },
    { key: "assets", label: "資産" },
  ]

  const isPC = mode === "pc"

  const MonthlyContent = () => (
    <>
      <div className="flex rounded-lg bg-gray-100 p-0.5 mb-3">
        {[
          { key: "self" as const, label: "個人", color: "text-indigo-600" },
          { key: "joint" as const, label: "共用", color: "text-amber-600" },
        ].map(v => (
          <button key={v.key} onClick={() => setViewType(v.key)}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${viewType === v.key ? `bg-white shadow-sm ${v.color}` : "text-gray-500"}`}>
            {v.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-3">
        <p className="text-xs text-gray-500 mb-2">{month} — {viewType === "self" ? "個人" : "共用"}</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          {viewType === "self" && (
            <div>
              <p className="text-xs text-gray-500">収入</p>
              <p className="text-sm font-bold text-green-600">{toJPY(incomeTotal)}</p>
            </div>
          )}
          {viewType === "joint" && (
            <div>
              <p className="text-xs text-gray-500">共用収入</p>
              <p className="text-sm font-bold text-green-600">—</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-500">支出</p>
            <p className="text-sm font-bold text-red-500">{toJPY(viewTotal)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">{viewType === "self" ? "収支" : "全体比"}</p>
            {viewType === "self" ? (
              <p className={`text-sm font-bold ${incomeTotal - viewTotal >= 0 ? "text-blue-600" : "text-red-600"}`}>
                {incomeTotal - viewTotal >= 0 ? "+" : ""}{toJPY(incomeTotal - viewTotal)}
              </p>
            ) : (
              <p className="text-sm font-bold text-gray-600">
                {totalExpense > 0 ? `${Math.round((jointTotal / totalExpense) * 100)}%` : "—"}
              </p>
            )}
          </div>
        </div>
      </div>

      {viewCards.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-3">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xs font-semibold text-gray-700">支払方法別内訳</h2>
            <span className="text-xs font-bold text-gray-800">{toJPY(viewTotal)}</span>
          </div>
          {viewCards.map(c => (
            <div key={c.cardId} className="flex items-center gap-2 mb-1.5 last:mb-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
              <span className="text-xs text-gray-700 flex-1 truncate">{c.cardName}</span>
              <span className="text-xs font-medium text-gray-800">{toJPY(c.total)}</span>
            </div>
          ))}
          {viewCards.length > 1 && (
            <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
              {viewCards.map((c) => {
                const pct = viewTotal > 0 ? (c.total / viewTotal) * 100 : 0
                return (
                  <div
                    key={c.cardId}
                    className="inline-block h-1.5 first:rounded-l-full last:rounded-r-full"
                    style={{ width: `${pct}%`, backgroundColor: c.color }}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}
    </>
  )

  const ChartsContent = () => (
    <>
      {categoryBreakdown.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-3">
          <h2 className="text-xs font-semibold text-gray-700 mb-2">カテゴリ別内訳</h2>
          <div className={`flex ${isPC ? "gap-4 items-center" : "flex-col"}`}>
            <ResponsiveContainer width={isPC ? 140 : "100%"} height={isPC ? 140 : 160}>
              <PieChart>
                <Pie data={categoryBreakdown} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={isPC ? 60 : 65} labelLine={false}>
                  {categoryBreakdown.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => toJPY(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
            <div className={`${isPC ? "flex-1 space-y-1" : "mt-2 space-y-1"}`}>
              {categoryBreakdown.slice(0, isPC ? 8 : 10).map((c, i) => (
                <div key={c.category} className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-gray-700 truncate max-w-[100px]">{c.category}</span>
                  </div>
                  <span className="font-medium text-gray-800">{toJPY(c.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {monthly.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-3">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
            <h2 className="text-xs font-semibold text-gray-700">月別推移</h2>
            <div className="flex items-center gap-1">
              {(["6m", "12m", "year"] as const).map(p => (
                <button key={p} onClick={() => setTrendPeriod(p)}
                  className={`px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${trendPeriod === p ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {p === "6m" ? "6M" : p === "12m" ? "12M" : "年度"}
                </button>
              ))}
              {trendPeriod === "year" && availableFYs.length > 0 && (
                <select value={trendFY ?? availableFYs[availableFYs.length - 1]}
                  onChange={e => setTrendFY(Number(e.target.value))}
                  className="border rounded px-1.5 py-0.5 text-xs bg-white text-gray-800 ml-1">
                  {availableFYs.map(fy => <option key={fy} value={fy}>{fy}年</option>)}
                </select>
              )}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={trendData} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => v.replace(/^\d{4}-/, "")} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${fmt(Number(v))}`} />
              <Tooltip formatter={(v) => toJPY(Number(v))} labelFormatter={v => String(v)} />
              <Bar dataKey={viewBarKey} fill={viewColor} name={viewType === "self" ? "個人" : "共用"} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  )

  return (
    <div className={mode === "mobile" ? "pb-20" : ""}>
      <PageHeader title="ダッシュボード" />
      <div className={isPC ? "px-6 py-4" : "max-w-md mx-auto px-4 py-2"}>
        {/* 月選択 */}
        <div className={`flex items-center gap-2 bg-white rounded-xl shadow-sm px-3 py-2 ${isPC ? "mb-4" : "mb-3"}`}>
          <button onClick={() => setMonth(prevMonth(month))}
            className="text-gray-600 hover:text-blue-600 px-2 py-1 rounded hover:bg-gray-100 text-lg font-bold">‹</button>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="flex-1 text-center text-sm font-semibold text-gray-800 border-0 outline-none bg-transparent" />
          <button onClick={() => setMonth(nextMonth(month))}
            className="text-gray-600 hover:text-blue-600 px-2 py-1 rounded hover:bg-gray-100 text-lg font-bold">›</button>
        </div>

        {apiError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 mb-3">
            エラー: {apiError}
          </div>
        )}

        {/* タブ */}
        <div className={`flex rounded-xl bg-gray-100 p-1 ${isPC ? "mb-4 max-w-xs" : "mb-3"}`}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? "bg-white shadow-sm text-blue-600" : "text-gray-600"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading && <div className="text-center py-6 text-gray-500 text-sm">読み込み中...</div>}

        {/* === 月次タブ === */}
        {!loading && tab === "monthly" && (
          isPC ? (
            <div className="grid grid-cols-[360px_1fr] gap-4 items-start">
              <div className="space-y-3">
                <MonthlyContent />
              </div>
              <div className="space-y-3">
                <ChartsContent />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <MonthlyContent />
              <ChartsContent />
            </div>
          )
        )}

        {/* === 資産タブ === */}
        {tab === "assets" && (
          <div className={isPC ? "grid grid-cols-[280px_1fr] gap-4 items-start" : "space-y-3"}>
            {assets.length > 0 ? (
              <>
                <div className="bg-white rounded-xl shadow-sm p-3">
                  <p className="text-xs text-gray-500 mb-1">最新資産（{assets[assets.length - 1]?.month}）</p>
                  <p className="text-2xl font-bold text-blue-600">{toJPY(assets[assets.length - 1]?.total ?? 0)}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                    <div className="bg-green-50 rounded-lg p-2">
                      <p className="text-xs text-gray-500">貯金</p>
                      <p className="text-sm font-bold text-green-600">{toJPY(assets[assets.length - 1]?.savings ?? 0)}</p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-2">
                      <p className="text-xs text-gray-500">投資</p>
                      <p className="text-sm font-bold text-purple-600">{toJPY(assets[assets.length - 1]?.investment ?? 0)}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-3">
                  <h2 className="text-xs font-semibold text-gray-700 mb-2">資産推移</h2>
                  <ResponsiveContainer width="100%" height={200}>
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
            ) : (
              <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-500 text-sm col-span-2">
                資産データがありません。「資産」ページから入力してください。
              </div>
            )}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  )
}
