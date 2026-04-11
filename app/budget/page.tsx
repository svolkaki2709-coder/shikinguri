"use client"

import { useEffect, useState } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"

function toJPY(n: number) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(n)
}

interface BudgetRow {
  category: string
  budget: number
  actual: number
}

export default function BudgetPage() {
  const [selfRows, setSelfRows] = useState<BudgetRow[]>([])
  const [jointRows, setJointRows] = useState<BudgetRow[]>([])
  const [tab, setTab] = useState<"self" | "joint">("self")
  const [loading, setLoading] = useState(true)
  const [rawSelf, setRawSelf] = useState<string[][]>([])
  const [rawJoint, setRawJoint] = useState<string[][]>([])

  useEffect(() => {
    fetch("/api/budget")
      .then((r) => r.json())
      .then((d) => {
        setRawSelf(d.self ?? [])
        setRawJoint(d.joint ?? [])

        // シートの構造に合わせてパース（先頭行がヘッダー、以降がカテゴリ・予算・実績）
        const parseSelf = parseRows(d.self ?? [])
        const parseJoint = parseRows(d.joint ?? [])
        setSelfRows(parseSelf)
        setJointRows(parseJoint)
      })
      .finally(() => setLoading(false))
  }, [])

  function parseRows(rows: string[][]): BudgetRow[] {
    // ヘッダー行をスキップして、[カテゴリ, 予算, 実績] 形式で読む
    return rows
      .slice(1)
      .map((row) => ({
        category: row[0] ?? "",
        budget: parseInt((row[1] ?? "0").replace(/[^0-9-]/g, "")) || 0,
        actual: parseInt((row[2] ?? "0").replace(/[^0-9-]/g, "")) || 0,
      }))
      .filter((r) => r.category && r.budget > 0)
  }

  const rows = tab === "self" ? selfRows : jointRows

  return (
    <div className="pb-20">
      <PageHeader title="予算管理" />
      <main className="max-w-md mx-auto px-4 py-4 space-y-3">
        {/* タブ */}
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setTab("self")}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === "self" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"
            }`}
          >
            自分
          </button>
          <button
            onClick={() => setTab("joint")}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === "joint" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"
            }`}
          >
            共同
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">読み込み中...</div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-4 text-sm text-gray-500 text-center">
            <p>シートの列構成（カテゴリ・予算・実績）が確認できませんでした。</p>
            <details className="mt-2 text-left text-xs text-gray-400">
              <summary>生データを確認</summary>
              <pre className="overflow-auto max-h-40 mt-1">
                {JSON.stringify(tab === "self" ? rawSelf : rawJoint, null, 2)}
              </pre>
            </details>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
            {rows.map((row) => {
              const diff = row.budget - row.actual
              const pct = row.budget > 0 ? Math.min((row.actual / row.budget) * 100, 100) : 0
              const over = row.actual > row.budget
              return (
                <div key={row.category} className="px-4 py-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-gray-800">{row.category}</span>
                    <span className={`text-sm font-semibold ${over ? "text-red-600" : "text-green-600"}`}>
                      {over ? "▲ " : "▼ "}
                      {toJPY(Math.abs(diff))}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        over ? "bg-red-500" : "bg-blue-500"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
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
