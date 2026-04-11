"use client"

import { useEffect, useState } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"

interface MonthlyRow {
  month: string
  total: number
  jointTotal: number
  self15Total: number
  selfEndTotal: number
}

interface CategoryRow {
  category: string
  amount: number
}

const COLORS = [
  "#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6",
  "#ec4899","#14b8a6","#f97316","#6366f1","#84cc16",
  "#06b6d4","#a855f7","#22c55e","#eab308","#64748b",
]

function toJPY(n: number) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(n)
}

export default function DashboardPage() {
  const [monthly, setMonthly] = useState<MonthlyRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [latestMonth, setLatestMonth] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        setMonthly(d.monthly ?? [])
        setCategories(d.categories ?? [])
        setLatestMonth(d.latestMonth ?? "")
      })
      .catch(() => setError("データ取得に失敗しました"))
      .finally(() => setLoading(false))
  }, [])

  const latest = monthly[monthly.length - 1]
  const last6 = monthly.slice(-6)

  return (
    <div className="pb-20">
      <PageHeader title="ダッシュボード" />
      <main className="max-w-md mx-auto px-4 py-4 space-y-4">
        {loading && (
          <div className="text-center py-12 text-gray-400">読み込み中...</div>
        )}
        {error && (
          <div className="bg-red-50 text-red-600 rounded-lg p-3 text-sm">{error}</div>
        )}

        {/* 最新月サマリー */}
        {latest && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-xs text-gray-500 mb-1">{latestMonth} 合計支出</p>
            <p className="text-3xl font-bold text-blue-600">{toJPY(latest.total)}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="bg-blue-50 rounded-lg p-2">
                <p className="text-xs text-gray-500">共同</p>
                <p className="text-sm font-semibold text-blue-700">{toJPY(latest.jointTotal)}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-2">
                <p className="text-xs text-gray-500">自分_15日</p>
                <p className="text-sm font-semibold text-green-700">{toJPY(latest.self15Total)}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-2">
                <p className="text-xs text-gray-500">自分_月末</p>
                <p className="text-sm font-semibold text-purple-700">{toJPY(latest.selfEndTotal)}</p>
              </div>
            </div>
          </div>
        )}

        {/* 月別棒グラフ */}
        {last6.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">月別支出推移（直近6ヶ月）</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={last6} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => v.replace(/^\d{4}-/, "")}
                />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                <Tooltip formatter={(v) => toJPY(Number(v))} labelFormatter={(l) => `${l} 合計`} />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} name="合計" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* カテゴリ別円グラフ */}
        {categories.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              カテゴリ別内訳（{latestMonth}）
            </h2>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={categories}
                  dataKey="amount"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) =>
                    `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {categories.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => toJPY(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
            {/* カテゴリ一覧 */}
            <div className="mt-3 space-y-1">
              {categories.slice(0, 10).map((c, i) => (
                <div key={c.category} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full inline-block"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    />
                    <span className="text-gray-700">{c.category}</span>
                  </div>
                  <span className="font-medium text-gray-800">{toJPY(c.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  )
}
