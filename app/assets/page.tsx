"use client"

import { useEffect, useState } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"

interface AssetRow { month: string; savings: number; investment: number; total: number }
interface Goal { id: number; name: string; target_amount: number; deadline: string | null }

function toJPY(n: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n)
}

export default function AssetsPage() {
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const [assets, setAssets] = useState<AssetRow[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [totalAssets, setTotalAssets] = useState(0)
  const [loading, setLoading] = useState(true)

  // 資産入力フォーム
  const [month, setMonth] = useState(defaultMonth)
  const [savings, setSavings] = useState("")
  const [investment, setInvestment] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState("")

  // 目標フォーム
  const [goalName, setGoalName] = useState("")
  const [goalAmount, setGoalAmount] = useState("")
  const [goalDeadline, setGoalDeadline] = useState("")
  const [addingGoal, setAddingGoal] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const [assetData, goalData] = await Promise.all([
      fetch("/api/assets").then(r => r.json()),
      fetch("/api/goals").then(r => r.json()),
    ])
    setAssets(assetData.assets ?? [])
    setGoals(goalData.goals ?? [])
    setTotalAssets(goalData.totalAssets ?? 0)
    setLoading(false)
  }

  async function handleSaveAssets() {
    setSaving(true)
    setSaveMsg("")
    await fetch("/api/assets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, savings_balance: Number(savings), investment_balance: Number(investment) }),
    })
    setSaveMsg("保存しました")
    setSaving(false)
    fetchData()
  }

  async function handleAddGoal() {
    if (!goalName || !goalAmount) return
    setAddingGoal(true)
    await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: goalName, target_amount: Number(goalAmount), deadline: goalDeadline || null }),
    })
    setGoalName("")
    setGoalAmount("")
    setGoalDeadline("")
    setAddingGoal(false)
    fetchData()
  }

  async function handleDeleteGoal(id: number) {
    if (!confirm("目標を削除しますか？")) return
    await fetch(`/api/goals?id=${id}`, { method: "DELETE" })
    setGoals(prev => prev.filter(g => g.id !== id))
  }

  const latest = assets[assets.length - 1]

  return (
    <div className="pb-20">
      <PageHeader title="資産管理" />
      <main className="max-w-md mx-auto px-4 py-4 space-y-4">
        {loading && <div className="text-center py-12 text-gray-400">読み込み中...</div>}

        {!loading && (
          <>
            {/* 最新残高サマリー */}
            {latest && (
              <div className="bg-white rounded-xl shadow-sm p-4">
                <p className="text-xs text-gray-500 mb-1">{latest.month} 時点の資産</p>
                <p className="text-3xl font-bold text-blue-600">{toJPY(latest.total)}</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="bg-green-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400 mb-1">貯金</p>
                    <p className="text-lg font-bold text-green-600">{toJPY(latest.savings)}</p>
                  </div>
                  <div className="bg-purple-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400 mb-1">投資 (NISA)</p>
                    <p className="text-lg font-bold text-purple-600">{toJPY(latest.investment)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* 月次資産入力 */}
            <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">資産残高を更新</h2>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">月</label>
                <div className="flex items-center gap-1 border rounded-lg px-2 py-1">
                  <button onClick={() => setMonth(m => { const [y,mo] = m.split("-").map(Number); const d = new Date(y, mo-2, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}` })}
                    className="text-gray-600 hover:text-blue-600 px-1 font-bold text-base">‹</button>
                  <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                    className="flex-1 text-center text-sm font-semibold text-gray-800 border-0 outline-none bg-transparent min-w-0" />
                  <button onClick={() => setMonth(m => { const [y,mo] = m.split("-").map(Number); const d = new Date(y, mo, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}` })}
                    className="text-gray-600 hover:text-blue-600 px-1 font-bold text-base">›</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">貯金残高（円）</label>
                  <input type="number" value={savings} onChange={e => setSavings(e.target.value)}
                    placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">投資残高（円）</label>
                  <input type="number" value={investment} onChange={e => setInvestment(e.target.value)}
                    placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              {saveMsg && <p className="text-xs text-green-600">✅ {saveMsg}</p>}
              <button onClick={handleSaveAssets} disabled={saving}
                className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">
                {saving ? "保存中..." : "保存する"}
              </button>
            </div>

            {/* 目標設定 */}
            <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">貯蓄目標</h2>

              {/* 目標一覧 */}
              {goals.map(g => {
                const pct = Math.min((totalAssets / g.target_amount) * 100, 100)
                const remaining = g.target_amount - totalAssets
                return (
                  <div key={g.id} className="border rounded-xl p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{g.name}</p>
                        {g.deadline && <p className="text-xs text-gray-400">目標：{g.deadline}</p>}
                      </div>
                      <button onClick={() => handleDeleteGoal(g.id)}
                        className="text-gray-300 hover:text-red-400 text-xl leading-none">×</button>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{toJPY(totalAssets)}</span>
                      <span>{toJPY(g.target_amount)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
                      <div className="h-2 rounded-full bg-blue-500"
                        style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-blue-600 font-semibold">{pct.toFixed(1)}%</span>
                      <span className="text-gray-400">
                        {remaining > 0 ? `あと${toJPY(remaining)}` : "達成済み"}
                      </span>
                    </div>
                  </div>
                )
              })}

              {/* 目標追加フォーム */}
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-medium text-gray-500">新しい目標を追加</p>
                <input type="text" value={goalName} onChange={e => setGoalName(e.target.value)}
                  placeholder="目標名（例：緊急資金100万）"
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" value={goalAmount} onChange={e => setGoalAmount(e.target.value)}
                    placeholder="目標額（円）"
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                  <input type="date" value={goalDeadline} onChange={e => setGoalDeadline(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <button onClick={handleAddGoal} disabled={!goalName || !goalAmount || addingGoal}
                  className="w-full bg-green-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
                  目標を追加
                </button>
              </div>
            </div>

            {/* 履歴テーブル */}
            {assets.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b">
                  <h2 className="text-sm font-semibold text-gray-700">資産推移履歴</h2>
                </div>
                {[...assets].reverse().map(a => (
                  <div key={a.month} className="flex items-center px-4 py-3 border-b last:border-0 text-sm">
                    <span className="text-gray-500 w-20 shrink-0">{a.month}</span>
                    <div className="flex-1 space-y-0.5">
                      <div className="flex justify-between">
                        <span className="text-gray-400 text-xs">貯金</span>
                        <span className="text-green-600 text-xs">{toJPY(a.savings)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400 text-xs">投資</span>
                        <span className="text-purple-600 text-xs">{toJPY(a.investment)}</span>
                      </div>
                    </div>
                    <span className="font-semibold text-blue-600 ml-3">{toJPY(a.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <BottomNav />
    </div>
  )
}
