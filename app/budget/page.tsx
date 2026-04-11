"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"

function toJPY(n: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n)
}

function BalanceRow({ label, amount, sub }: { label: string; amount: number; sub?: boolean }) {
  const color = amount >= 0 ? "text-blue-600" : "text-red-500"
  return (
    <div className={`flex justify-between items-center ${sub ? "pl-2 text-xs text-gray-500" : "text-sm font-semibold text-gray-800"}`}>
      <span>{label}</span>
      <span className={sub ? "" : color}>{toJPY(amount)}</span>
    </div>
  )
}

interface BudgetRow { category: string; cardType: string; budget: number; actual: number }
interface Plan { savingsTarget: number; nisaTarget: number }
interface Actual { savingsActual: number; nisaActual: number }

type Tab = "overview" | "self" | "joint"

export default function BudgetPage() {
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const [month, setMonth] = useState(defaultMonth)
  const [tab, setTab] = useState<Tab>("overview")
  const [loading, setLoading] = useState(true)

  const [budgets, setBudgets] = useState<BudgetRow[]>([])
  const [incomeTotal, setIncomeTotal] = useState(0)
  const [plan, setPlan] = useState<Plan>({ savingsTarget: 0, nisaTarget: 0 })
  const [actual, setActual] = useState<Actual>({ savingsActual: 0, nisaActual: 0 })

  // 計画編集フォーム
  const [editing, setEditing] = useState(false)
  const [savingsInput, setSavingsInput] = useState("")
  const [nisaInput, setNisaInput] = useState("")
  const [planSaving, setPlanSaving] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/budget?month=${month}`).then(r => r.json()),
      fetch(`/api/income?month=${month}`).then(r => r.json()),
      fetch(`/api/plans?month=${month}`).then(r => r.json()),
    ]).then(([budgetData, incomeData, plansData]) => {
      setBudgets(budgetData.budgets ?? [])
      setIncomeTotal(incomeData.total ?? 0)
      setPlan(plansData.plan ?? { savingsTarget: 0, nisaTarget: 0 })
      setActual(plansData.actual ?? { savingsActual: 0, nisaActual: 0 })
    }).finally(() => setLoading(false))
  }, [month])

  const selfRows = budgets.filter(b => b.cardType === "self")
  const jointRows = budgets.filter(b => b.cardType === "joint")
  const selfBudgetTotal = selfRows.reduce((s, r) => s + r.budget, 0)
  const selfActualTotal = selfRows.reduce((s, r) => s + r.actual, 0)
  const jointBudgetTotal = jointRows.reduce((s, r) => s + r.budget, 0)
  const jointActualTotal = jointRows.reduce((s, r) => s + r.actual, 0)
  const totalBudget = selfBudgetTotal + jointBudgetTotal
  const totalActual = selfActualTotal + jointActualTotal
  const planFreeBalance = incomeTotal - selfBudgetTotal - jointBudgetTotal - plan.savingsTarget - plan.nisaTarget
  const actualBalance = incomeTotal - totalActual

  async function handleSavePlan() {
    setPlanSaving(true)
    await fetch("/api/plans", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, savings_target: Number(savingsInput) || 0, nisa_target: Number(nisaInput) || 0 }),
    })
    setPlan({ savingsTarget: Number(savingsInput) || 0, nisaTarget: Number(nisaInput) || 0 })
    setEditing(false)
    setPlanSaving(false)
  }

  function openEdit() {
    setSavingsInput(plan.savingsTarget > 0 ? String(plan.savingsTarget) : "")
    setNisaInput(plan.nisaTarget > 0 ? String(plan.nisaTarget) : "")
    setEditing(true)
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "概要" },
    { key: "self", label: "個人" },
    { key: "joint", label: "共用" },
  ]

  function BudgetList({ rows }: { rows: BudgetRow[] }) {
    if (rows.length === 0) {
      return (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center space-y-3">
          <p className="text-gray-400 text-sm">予算が設定されていません</p>
          <Link href="/settings" className="inline-block bg-blue-600 text-white text-sm px-4 py-2 rounded-lg">
            設定から予算を追加する
          </Link>
        </div>
      )
    }
    const total = rows.reduce((s, r) => s + r.budget, 0)
    const actualTot = rows.reduce((s, r) => s + r.actual, 0)
    const over = actualTot > total
    return (
      <>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-400">合計予算</p>
              <p className="text-lg font-bold text-gray-700">{toJPY(total)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">合計実績</p>
              <p className={`text-lg font-bold ${over ? "text-red-500" : "text-green-600"}`}>{toJPY(actualTot)}</p>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
            <div
              className={`h-2 rounded-full ${over ? "bg-red-400" : "bg-blue-400"}`}
              style={{ width: `${total > 0 ? Math.min((actualTot / total) * 100, 100) : 0}%` }}
            />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
          {rows.map(row => {
            const diff = row.budget - row.actual
            const pct = row.budget > 0 ? Math.min((row.actual / row.budget) * 100, 100) : 0
            const isOver = row.actual > row.budget
            return (
              <div key={row.category} className="px-4 py-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-gray-800">{row.category}</span>
                  <span className={`text-sm font-semibold ${isOver ? "text-red-600" : "text-green-600"}`}>
                    {isOver ? "超過 " : "残 "}{toJPY(Math.abs(diff))}
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full ${isOver ? "bg-red-500" : "bg-blue-500"}`}
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
      </>
    )
  }

  return (
    <div className="pb-20">
      <PageHeader title="予算管理" />
      <main className="max-w-md mx-auto px-4 py-4 space-y-3">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm" />

        <div className="flex bg-gray-100 rounded-lg p-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t.key ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading && <div className="text-center py-8 text-gray-400 text-sm">読み込み中...</div>}

        {/* ===== 概要タブ ===== */}
        {!loading && tab === "overview" && (
          <>
            {/* 収入 */}
            <div className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-gray-400">今月の収入（実績）</p>
                  <p className="text-2xl font-bold text-green-600">{toJPY(incomeTotal)}</p>
                </div>
                <Link href="/settings" className="text-xs text-blue-500 hover:underline">収入入力 →</Link>
              </div>
            </div>

            {/* 支出サマリー（個人・共用） */}
            <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">支出予算 vs 実績</h2>
              {[
                { label: "個人カード", budget: selfBudgetTotal, actual: selfActualTotal, color: "#6366f1" },
                { label: "共用カード", budget: jointBudgetTotal, actual: jointActualTotal, color: "#f59e0b" },
              ].map(row => (
                <div key={row.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: row.color }} />
                      <span className="text-gray-700">{row.label}</span>
                    </div>
                    <span className="text-gray-600">
                      <span className={row.actual > row.budget ? "text-red-500 font-semibold" : ""}>{toJPY(row.actual)}</span>
                      <span className="text-gray-400"> / {toJPY(row.budget)}</span>
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${row.actual > row.budget ? "bg-red-400" : ""}`}
                      style={{ width: `${row.budget > 0 ? Math.min((row.actual / row.budget) * 100, 100) : 0}%`, backgroundColor: row.actual > row.budget ? undefined : row.color }} />
                  </div>
                </div>
              ))}
            </div>

            {/* 貯蓄・投資計画 */}
            <div className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-semibold text-gray-700">貯蓄・投資計画</h2>
                {!editing && (
                  <button onClick={openEdit} className="text-xs text-blue-500 hover:underline">編集</button>
                )}
              </div>
              {editing ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">貯金目標（円）</label>
                    <input type="number" value={savingsInput} onChange={e => setSavingsInput(e.target.value)}
                      placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">NISA積立目標（円）</label>
                    <input type="number" value={nisaInput} onChange={e => setNisaInput(e.target.value)}
                      placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(false)} className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2 text-sm">
                      キャンセル
                    </button>
                    <button onClick={handleSavePlan} disabled={planSaving}
                      className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
                      {planSaving ? "保存中..." : "保存"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {[
                    { label: "貯金", target: plan.savingsTarget, actual: actual.savingsActual, color: "#10b981" },
                    { label: "NISA積立", target: plan.nisaTarget, actual: actual.nisaActual, color: "#8b5cf6" },
                  ].map(row => (
                    <div key={row.label}>
                      <div className="flex justify-between text-sm mb-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: row.color }} />
                          <span className="text-gray-700">{row.label}</span>
                        </div>
                        {row.target > 0 ? (
                          <span className="text-gray-600">
                            <span>{toJPY(row.actual)}</span>
                            <span className="text-gray-400"> / {toJPY(row.target)}</span>
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">未設定</span>
                        )}
                      </div>
                      {row.target > 0 && (
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full"
                            style={{ width: `${Math.min((row.actual / row.target) * 100, 100)}%`, backgroundColor: row.color }} />
                        </div>
                      )}
                    </div>
                  ))}
                  {plan.savingsTarget === 0 && plan.nisaTarget === 0 && (
                    <p className="text-xs text-gray-400 text-center py-1">「編集」から目標額を設定できます</p>
                  )}
                </div>
              )}
            </div>

            {/* 収支シミュレーション */}
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">収支シミュレーション</h2>

              {/* 予算ベース */}
              <div className="mb-4">
                <p className="text-xs font-medium text-blue-600 mb-2">予算計画ベース</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">収入</span>
                    <span className="font-medium text-green-600">+{toJPY(incomeTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 pl-2">個人支出（予算）</span>
                    <span className="text-red-400">-{toJPY(selfBudgetTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 pl-2">共用支出（予算）</span>
                    <span className="text-red-400">-{toJPY(jointBudgetTotal)}</span>
                  </div>
                  {plan.savingsTarget > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 pl-2">貯金目標</span>
                      <span className="text-green-500">-{toJPY(plan.savingsTarget)}</span>
                    </div>
                  )}
                  {plan.nisaTarget > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 pl-2">NISA目標</span>
                      <span className="text-purple-500">-{toJPY(plan.nisaTarget)}</span>
                    </div>
                  )}
                  <div className="border-t pt-1.5 flex justify-between font-semibold">
                    <span className="text-gray-700">計画上の余裕額</span>
                    <span className={planFreeBalance >= 0 ? "text-blue-600" : "text-red-500"}>
                      {planFreeBalance >= 0 ? "+" : ""}{toJPY(planFreeBalance)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 実績ベース */}
              <div className="border-t pt-3">
                <p className="text-xs font-medium text-gray-500 mb-2">実績ベース</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">収入</span>
                    <span className="font-medium text-green-600">+{toJPY(incomeTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 pl-2">個人支出（実績）</span>
                    <span className="text-red-400">-{toJPY(selfActualTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 pl-2">共用支出（実績）</span>
                    <span className="text-red-400">-{toJPY(jointActualTotal)}</span>
                  </div>
                  <div className="border-t pt-1.5 flex justify-between font-semibold">
                    <span className="text-gray-700">支出後残高</span>
                    <span className={actualBalance >= 0 ? "text-blue-600" : "text-red-500"}>
                      {actualBalance >= 0 ? "+" : ""}{toJPY(actualBalance)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ===== 個人タブ ===== */}
        {!loading && tab === "self" && <BudgetList rows={selfRows} />}

        {/* ===== 共用タブ ===== */}
        {!loading && tab === "joint" && <BudgetList rows={jointRows} />}
      </main>
      <BottomNav />
    </div>
  )
}
