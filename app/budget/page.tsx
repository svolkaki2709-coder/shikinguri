"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"

function toJPY(n: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n)
}

interface BudgetRow { category: string; cardType: string; budget: number; actual: number }

export default function BudgetPage() {
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const [month, setMonth] = useState(defaultMonth)
  const [budgets, setBudgets] = useState<BudgetRow[]>([])
  const [tab, setTab] = useState<"self" | "joint">("self")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/budget?month=${month}`)
      .then(r => r.json())
      .then(d => setBudgets(d.budgets ?? []))
      .finally(() => setLoading(false))
  }, [month])

  const rows = budgets.filter(b => b.cardType === tab)
  const totalBudget = rows.reduce((s, r) => s + r.budget, 0)
  const totalActual = rows.reduce((s, r) => s + r.actual, 0)

  return (
    <div className="pb-20">
      <PageHeader title="予算管理" />
      <main className="max-w-md mx-auto px-4 py-4 space-y-3">
        {/* 月選択 */}
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm" />

        {/* タブ */}
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button onClick={() => setTab("self")}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "self" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"}`}>
            個人
          </button>
          <button onClick={() => setTab("joint")}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "joint" ? "bg-white text-amber-500 shadow-sm" : "text-gray-500"}`}>
            共用
          </button>
        </div>

        {/* 合計サマリー */}
        {!loading && rows.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs text-gray-400">合計予算</p>
                <p className="text-lg font-bold text-gray-700">{toJPY(totalBudget)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">合計実績</p>
                <p className={`text-lg font-bold ${totalActual > totalBudget ? "text-red-500" : "text-green-600"}`}>
                  {toJPY(totalActual)}
                </p>
              </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
              <div
                className={`h-2 rounded-full ${totalActual > totalBudget ? "bg-red-400" : "bg-blue-400"}`}
                style={{ width: `${totalBudget > 0 ? Math.min((totalActual / totalBudget) * 100, 100) : 0}%` }}
              />
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">読み込み中...</div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center space-y-3">
            <p className="text-gray-400 text-sm">予算が設定されていません</p>
            <Link href="/settings" className="inline-block bg-blue-600 text-white text-sm px-4 py-2 rounded-lg">
              設定から予算を追加する
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
            {rows.map(row => {
              const diff = row.budget - row.actual
              const pct = row.budget > 0 ? Math.min((row.actual / row.budget) * 100, 100) : 0
              const over = row.actual > row.budget
              return (
                <div key={row.category} className="px-4 py-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-gray-800">{row.category}</span>
                    <span className={`text-sm font-semibold ${over ? "text-red-600" : "text-green-600"}`}>
                      {over ? "超過 " : "残 "}{toJPY(Math.abs(diff))}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${over ? "bg-red-500" : "bg-blue-500"}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>実績 {toJPY(row.actual)}</span>
                    <span>予算 {toJPY(row.budget)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  )
}
