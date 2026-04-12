"use client"

import { useEffect, useState, useMemo } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"
import { useViewMode } from "@/components/ViewModeContext"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from "recharts"

function toJPY(n: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n)
}
function toJPYShort(n: number) {
  if (n === 0) return "—"
  return n.toLocaleString()
}

const GROUP_COLORS: Record<string, { header: string; row: string; text: string }> = {
  収入: { header: "bg-green-600 text-white",    row: "bg-green-50",    text: "text-green-700"  },
  支出: { header: "bg-blue-600 text-white",     row: "bg-blue-50",     text: "text-blue-700"   },
  振替: { header: "bg-gray-500 text-white",     row: "bg-gray-50",     text: "text-gray-600"   },
  投資: { header: "bg-purple-600 text-white",   row: "bg-purple-50",   text: "text-purple-700" },
  貯蓄: { header: "bg-teal-600 text-white",     row: "bg-teal-50",     text: "text-teal-700"   },
  立替: { header: "bg-orange-500 text-white",   row: "bg-orange-50",   text: "text-orange-700" },
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

type ViewMode = "actual" | "diff" | "both"
type DisplayMode = "table" | "chart"

export default function BudgetTablePage() {
  const { mode } = useViewMode()
  const now = new Date()
  const currentYear = now.getFullYear()

  const [year, setYear] = useState(currentYear)
  const [cardTypeFilter, setCardTypeFilter] = useState<"self" | "joint">("self")
  const [viewMode, setViewMode] = useState<ViewMode>("actual")
  const [displayMode, setDisplayMode] = useState<DisplayMode>("table")
  const [loading, setLoading] = useState(true)

  const [months, setMonths] = useState<string[]>([])
  const [categories, setCategories] = useState<CategoryData[]>([])
  const [incomeByMonth, setIncomeByMonth] = useState<Record<string, number>>({})

  useEffect(() => {
    setLoading(true)
    const from = `${year}-01`
    const to   = `${year}-12`
    fetch(`/api/budget-table?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => {
        setMonths(d.months ?? [])
        setCategories(d.categories ?? [])
        setIncomeByMonth(d.incomeByMonth ?? {})
      })
      .finally(() => setLoading(false))
  }, [year])

  // フィルタ済みカテゴリ（個人/共用）
  const filtered = useMemo(() =>
    categories.filter(c => c.cardType === cardTypeFilter),
    [categories, cardTypeFilter]
  )

  // グループ別に分類
  const groups = useMemo(() => {
    const map = new Map<string, CategoryData[]>()
    for (const c of filtered) {
      const g = c.groupType ?? "未分類"
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(c)
    }
    // グループ順: GROUP_COLORS の順 + 未分類
    const ORDER = ["収入", "支出", "振替", "投資", "貯蓄", "立替", "未分類"]
    const result: Array<{ group: string; rows: CategoryData[] }> = []
    for (const g of ORDER) {
      if (map.has(g)) result.push({ group: g, rows: map.get(g)! })
    }
    for (const [g, rows] of map) {
      if (!ORDER.includes(g)) result.push({ group: g, rows })
    }
    return result
  }, [filtered])

  // 月ごと収支
  const monthlyIncome = useMemo(() =>
    months.map(m => incomeByMonth[m] ?? 0),
    [months, incomeByMonth]
  )
  const yearIncome = monthlyIncome.reduce((s, v) => s + v, 0)

  // グラフ用データ: 月ごとの グループ別実績 + 予算合計
  const chartData = useMemo(() => {
    return months.map(m => {
      const point: Record<string, number | string> = { month: m.replace(/^\d{4}-/, "") + "月" }
      // グループ別実績
      for (const { group, rows } of groups) {
        if (group === "収入" || group === "振替") continue  // 収支グラフでは除外
        point[group] = rows.reduce((s, r) => s + (r.byMonth[m]?.actual ?? 0), 0)
      }
      // 予算合計（振替・収入を除く）
      point["予算"] = filtered
        .filter(r => r.groupType !== "収入" && r.groupType !== "振替")
        .reduce((s, r) => s + (r.byMonth[m]?.budget ?? 0), 0)
      // 収入
      if (cardTypeFilter === "self") {
        point["収入"] = incomeByMonth[m] ?? 0
      }
      return point
    })
  }, [months, groups, filtered, incomeByMonth, cardTypeFilter])

  // グラフで使うグループ（収入・振替を除く）
  const chartGroups = useMemo(() =>
    groups.filter(g => g.group !== "収入" && g.group !== "振替"),
    [groups]
  )

  const isPC = mode === "pc"

  return (
    <div className={mode === "mobile" ? "pb-20" : ""}>
      <PageHeader title="予実一覧" />
      <div className={isPC ? "px-4 py-3" : "px-2 py-2"}>

        {/* コントロールバー */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
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
            {([["self", "個人"], ["joint", "共用"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setCardTypeFilter(k)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  cardTypeFilter === k
                    ? k === "self" ? "bg-white text-indigo-600 shadow-sm" : "bg-white text-amber-600 shadow-sm"
                    : "text-gray-500"
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* テーブル/グラフ切替 */}
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            {([["table", "📋 テーブル"], ["chart", "📊 グラフ"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setDisplayMode(k)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  displayMode === k ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* テーブル表示モード（テーブル時のみ） */}
          {displayMode === "table" && (
            <div className="flex rounded-lg bg-gray-100 p-0.5">
              {([["actual", "実績"], ["diff", "差額"], ["both", "両方"]] as const).map(([k, label]) => (
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

        {loading && <div className="text-center py-12 text-gray-400 text-sm">読み込み中...</div>}

        {/* === グラフ表示 === */}
        {!loading && displayMode === "chart" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4">
            {/* 月次 実績 vs 予算 積み上げバーチャート */}
            <div>
              <h3 className="text-xs font-semibold text-gray-600 mb-3">月次支出: グループ別実績 vs 予算</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  barCategoryGap="25%">
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
                  {/* 予算ライン（透過バー） */}
                  <Bar dataKey="予算" fill="#94a3b8" opacity={0.35} radius={[3, 3, 0, 0]} />
                  {/* グループ別実績（積み上げ） */}
                  {chartGroups.map(({ group }) => {
                    const gc = GROUP_COLORS[group]
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
                  {/* 収入ライン（個人のみ） */}
                  {cardTypeFilter === "self" && (
                    <Bar dataKey="収入" fill="#22c55e" opacity={0.7} radius={[3, 3, 0, 0]} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 月次差額（収支バランス）折れ線チャート */}
            {cardTypeFilter === "self" && (
              <div>
                <h3 className="text-xs font-semibold text-gray-600 mb-3">月次収支バランス（収入 − 支出実績）</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={chartData.map(d => {
                    const expense = chartGroups.reduce((s, { group }) => s + (Number(d[group]) || 0), 0)
                    return { month: d.month, 収支: (Number(d["収入"]) || 0) - expense }
                  })} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
                    <Bar dataKey="収支"
                      fill="#22c55e"
                      radius={[3, 3, 0, 0]}
                      // 赤/緑で色分け
                      label={false}
                    />
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
                      <p className="text-[10px] text-gray-400">
                        予算 {budget.toLocaleString()}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!loading && displayMode === "table" && (
          <div className="overflow-x-auto rounded-xl shadow-sm border border-gray-200 bg-white">
            <table className="text-xs border-collapse" style={{ minWidth: `${180 + months.length * 90 + 100}px` }}>
              <thead>
                <tr className="bg-gray-800 text-white sticky top-0 z-10">
                  {/* 固定左列 */}
                  <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-gray-800 z-20 min-w-[140px]">
                    カテゴリ
                  </th>
                  <th className="text-right px-2 py-2 font-semibold min-w-[84px]">月予算</th>
                  {/* 月列 */}
                  {months.map(m => (
                    <th key={m} className={`text-right px-2 py-2 font-medium min-w-[90px] ${
                      m === `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}` ? "bg-blue-700" : ""
                    }`}>
                      {m.replace(/^\d{4}-/, "")}月
                    </th>
                  ))}
                  {/* 年合計 */}
                  <th className="text-right px-3 py-2 font-semibold min-w-[100px] bg-gray-700">年計</th>
                </tr>

                {/* 収入行（個人のみ表示） */}
                {cardTypeFilter === "self" && (
                  <tr className="bg-green-50 border-b border-green-200">
                    <td className="sticky left-0 bg-green-50 px-3 py-1.5 font-semibold text-green-700">
                      収入
                    </td>
                    <td className="text-right px-2 py-1.5 text-green-600 font-medium">—</td>
                    {months.map(m => {
                      const inc = incomeByMonth[m] ?? 0
                      return (
                        <td key={m} className="text-right px-2 py-1.5 font-medium text-green-700">
                          {inc > 0 ? toJPYShort(inc) : <span className="text-gray-300">—</span>}
                        </td>
                      )
                    })}
                    <td className="text-right px-3 py-1.5 font-bold text-green-700 bg-green-100">
                      {yearIncome > 0 ? toJPYShort(yearIncome) : "—"}
                    </td>
                  </tr>
                )}
              </thead>

              <tbody>
                {groups.map(({ group, rows }) => {
                  const gc = GROUP_COLORS[group]
                  const groupYearBudget = rows.reduce((s, r) => s + r.yearBudget, 0)
                  const groupYearActual = rows.reduce((s, r) => s + r.yearActual, 0)
                  const groupDiff = groupYearBudget - groupYearActual

                  return (
                    <>
                      {/* グループヘッダー行 */}
                      <tr key={`grp-${group}`}
                        className={`border-b ${gc?.header ?? "bg-gray-700 text-white"}`}>
                        <td className={`sticky left-0 px-3 py-1 font-bold text-xs ${gc?.header ?? "bg-gray-700 text-white"}`}>
                          {group}
                        </td>
                        <td className="text-right px-2 py-1 font-semibold opacity-80">
                          {toJPYShort(rows.reduce((s, r) => s + r.budget, 0))}
                        </td>
                        {months.map(m => {
                          const mBudget = rows.reduce((s, r) => s + (r.byMonth[m]?.budget ?? 0), 0)
                          const mActual = rows.reduce((s, r) => s + (r.byMonth[m]?.actual ?? 0), 0)
                          const diff = mBudget - mActual
                          return (
                            <td key={m} className="text-right px-2 py-1 font-semibold">
                              {viewMode === "actual" && <span>{toJPYShort(mActual)}</span>}
                              {viewMode === "diff" && (
                                <span className={diff < 0 ? "text-red-200" : "opacity-80"}>{diff >= 0 ? "+" : ""}{toJPYShort(diff)}</span>
                              )}
                              {viewMode === "both" && (
                                <span className="text-[10px]">
                                  <span>{toJPYShort(mActual)}</span>
                                  <br />
                                  <span className={diff < 0 ? "text-red-200" : "opacity-70"}>{diff >= 0 ? "+" : ""}{toJPYShort(diff)}</span>
                                </span>
                              )}
                            </td>
                          )
                        })}
                        <td className="text-right px-3 py-1 font-bold bg-black/10">
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
                              <span className={groupDiff < 0 ? "text-red-200" : "opacity-80"}>{groupDiff >= 0 ? "+" : ""}{toJPYShort(groupDiff)}</span>
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
                            <td className="text-right px-2 py-1.5 text-gray-500">
                              {row.budget > 0 ? toJPYShort(row.budget) : <span className="text-gray-200">—</span>}
                            </td>
                            {months.map(m => {
                              const { budget: mb, actual: ma } = row.byMonth[m] ?? { budget: 0, actual: 0 }
                              const mdiff = mb - ma
                              const isOver = ma > mb && mb > 0
                              return (
                                <td key={m} className={`text-right px-2 py-1.5 ${isOver && viewMode !== "diff" ? "bg-red-50" : ""}`}>
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
                                    <span className="text-[10px] leading-tight">
                                      <span className={`block font-medium ${isOver ? "text-red-500" : ma > 0 ? "text-gray-800" : "text-gray-300"}`}>
                                        {ma > 0 ? toJPYShort(ma) : "—"}
                                      </span>
                                      {mb > 0 && (
                                        <span className={`block ${mdiff < 0 ? "text-red-400" : "text-green-600"}`}>
                                          {mdiff >= 0 ? "+" : ""}{toJPYShort(mdiff)}
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </td>
                              )
                            })}
                            {/* 年計 */}
                            <td className="text-right px-3 py-1.5 bg-gray-50 border-l border-gray-100">
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
        {!loading && (
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
            <span>赤背景 = 予算超過</span>
            <span className="text-red-400">赤文字 = 超過額</span>
            <span className="text-green-500">緑文字 = 余剰</span>
            <span className="text-blue-400">青ヘッダー = 当月</span>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  )
}
