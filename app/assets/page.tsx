"use client"

import { useEffect, useState } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"
import { useViewMode } from "@/components/ViewModeContext"
import { fmtMoneyInput, parseNum } from "@/lib/num"

interface AssetRow { month: string; savings: number; investment: number; total: number }
interface Goal { id: number; name: string; target_amount: number; deadline: string | null }

/** "YYYY-MM" の1つ前の月 */
function prevMonthOf(m: string) {
  const [y, mo] = m.split("-").map(Number)
  const d = new Date(y, mo - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** "YYYY-MM" の1つ後の月 */
function nextMonthOf(m: string) {
  const [y, mo] = m.split("-").map(Number)
  const d = new Date(y, mo, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** 2026-08 → 2026年8月末 */
function monthEndLabel(m: string) {
  if (!m) return ""
  return `${m.slice(0, 4)}年${Number(m.slice(5, 7))}月末`
}

function toJPY(n: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n)
}

export default function AssetsPage() {
  const { mode } = useViewMode()
  const isPC = mode === "pc"
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  // 月末（最終日）になるまでは、前の月の月末残高を入力する想定にしておく
  const defaultMonth = now.getDate() >= lastDay ? thisMonth : prevMonthOf(thisMonth)

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

  const [loadError, setLoadError] = useState("")
  // 資産は個人と共同で別系列。どちらを記録しているかを画面で分かるようにする
  const [scope, setScope] = useState<"self" | "joint">("self")

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])

  async function fetchData() {
    setLoading(true)
    setLoadError("")
    try {
      const [assetData, goalData] = await Promise.all([
        fetch(`/api/assets?card_type=${scope}`).then(r => r.json()),
        fetch("/api/goals").then(r => r.json()),
      ])
      setAssets(assetData.assets ?? [])
      setGoals(goalData.goals ?? [])
      setTotalAssets(goalData.totalAssets ?? 0)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  // 選択中の月に既存データがあればフォームへ反映する。
  // 空欄のまま保存して、もう一方の残高を0で上書きしてしまう事故を防ぐ。
  useEffect(() => {
    const row = assets.find(a => a.month === month)
    setSavings(row ? fmtMoneyInput(String(row.savings)) : "")
    setInvestment(row ? fmtMoneyInput(String(row.investment)) : "")
  }, [month, assets])

  async function handleSaveAssets() {
    setSaving(true)
    setSaveMsg("")
    try {
      const res = await fetch("/api/assets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          card_type: scope,
          // 未入力欄は null で送り、サーバー側で既存値を維持させる
          savings_balance: savings === "" ? null : parseNum(savings),
          investment_balance: investment === "" ? null : parseNum(investment),
        }),
      })
      setSaveMsg(res.ok ? "保存しました" : "保存に失敗しました")
      if (res.ok) fetchData()
    } catch {
      setSaveMsg("通信エラーが発生しました")
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteAsset(m: string) {
    if (!confirm(`${monthEndLabel(m)}時点の記録を削除しますか？`)) return
    const res = await fetch(`/api/assets?month=${m}&card_type=${scope}`, { method: "DELETE" })
    if (!res.ok) { alert("削除に失敗しました"); return }
    setSaveMsg(`${monthEndLabel(m)}の記録を削除しました`)
    fetchData()
  }

  async function handleAddGoal() {
    if (!goalName || !goalAmount) return
    setAddingGoal(true)
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: goalName, target_amount: parseNum(goalAmount), deadline: goalDeadline || null }),
      })
      if (!res.ok) { alert("目標の追加に失敗しました"); return }
      setGoalName("")
      setGoalAmount("")
      setGoalDeadline("")
      fetchData()
    } finally {
      setAddingGoal(false)
    }
  }

  async function handleDeleteGoal(id: number) {
    if (!confirm("目標を削除しますか？")) return
    const res = await fetch(`/api/goals?id=${id}`, { method: "DELETE" })
    if (!res.ok) { alert("削除に失敗しました"); return }
    setGoals(prev => prev.filter(g => g.id !== id))
  }

  const latest = assets[assets.length - 1]

  // 記録を始めてから今（＝直近で終わった月末）までで、入力が抜けている月。
  // 資産の推移は月次で連続していないと意味が読めないので、抜けを知らせる。
  const missingMonths = (() => {
    if (assets.length === 0) return []
    const have = new Set(assets.map(a => a.month))
    const out: string[] = []
    let m = assets[0].month
    while (m <= defaultMonth) {
      if (!have.has(m)) out.push(m)
      m = nextMonthOf(m)
    }
    return out
  })()

  const alreadyEntered = assets.some(a => a.month === defaultMonth)

  const moneyInput = "w-full border rounded-lg pl-6 pr-2 py-1.5 text-sm text-right bg-slate-900 text-slate-100"

  return (
    <div className={isPC ? "" : "pb-20"}>
      <PageHeader title="資産管理" />
      <main className={isPC ? "max-w-5xl mx-auto px-6 py-4 space-y-3" : "max-w-md mx-auto px-4 py-2 space-y-3"}>
        {loading && <div className="text-center py-4 text-slate-400">読み込み中...</div>}
        {loadError && (
          <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-3 text-sm text-red-300">
            読み込みに失敗しました: {loadError}
          </div>
        )}

        {!loading && (
          <div className={isPC ? "grid grid-cols-1 lg:grid-cols-2 gap-3 items-start" : "space-y-3"}>
            {/* 左：サマリー＋月末入力 */}
            <div className="space-y-3">
            {/* 最新残高サマリー（1〜2行） */}
            {latest && (
              <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 px-3 py-2">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-xs text-slate-400">{monthEndLabel(latest.month)} 時点</span>
                  <span className="text-2xl font-bold text-blue-400">{toJPY(latest.total)}</span>
                </div>
                <p className="text-xs text-slate-400">
                  貯金 <b className="text-green-400">{toJPY(latest.savings)}</b>
                  <span className="mx-1.5 text-slate-700">|</span>
                  投資 (NISA) <b className="text-purple-400">{toJPY(latest.investment)}</b>
                </p>
              </div>
            )}

            {/* 月次資産入力 */}
            <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-300 mr-auto"
                  title={"月末時点の残高を毎月1回入れてください。同じ時点で揃えておくと、増減が正しく比べられます\nここで記録した残高が、ライフプランの「現在の資産」としてそのまま使われます"}>
                  月末の残高を記録 <span className="text-[11px] text-slate-500 cursor-help">ⓘ</span>
                </h2>
                <div className="flex rounded-lg overflow-hidden border border-slate-700 text-xs font-semibold shrink-0">
                  {([["self", "🙋 個人"], ["joint", "👫 共同"]] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setScope(k)}
                      className={`px-2.5 py-1 transition-colors ${
                        scope === k ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-400"
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 未入力・抜けている月を1行のチップで */}
              {(!alreadyEntered || missingMonths.length > 0) && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[11px] text-amber-300 mr-0.5">⚠ 未入力:</span>
                  {Array.from(new Set([...missingMonths, ...(alreadyEntered ? [] : [defaultMonth])])).map(m => (
                    <button key={m} onClick={() => setMonth(m)}
                      className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                        month === m
                          ? "bg-blue-600 text-white border-blue-500"
                          : m === defaultMonth
                          ? "border-amber-500/50 text-amber-300 hover:border-blue-500"
                          : "border-slate-600 text-slate-300 hover:border-blue-500"
                      }`}>
                      {monthEndLabel(m)}
                    </button>
                  ))}
                </div>
              )}

              {/* 月｜貯金｜投資｜保存 */}
              <div className="grid grid-cols-2 sm:grid-cols-[auto_1fr_1fr_auto] gap-2 items-center">
                <div className="col-span-2 sm:col-span-1 flex items-center gap-1 border rounded-lg px-1.5 py-1" title="どの月末の残高か">
                  <button onClick={() => setMonth(prevMonthOf(month))}
                    className="text-slate-400 hover:text-blue-400 px-1 font-bold text-base leading-none">‹</button>
                  <span className="flex-1 sm:flex-none sm:w-28 text-center text-sm font-semibold text-slate-100">
                    {monthEndLabel(month)}
                  </span>
                  <button onClick={() => setMonth(nextMonthOf(month))}
                    disabled={month >= defaultMonth}
                    className="text-slate-400 hover:text-blue-400 px-1 font-bold text-base leading-none disabled:opacity-30">›</button>
                </div>
                <div className="relative" title="貯金残高（円）">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-green-400">貯</span>
                  <input type="text" inputMode="numeric" value={savings} aria-label="貯金残高（円）"
                    onChange={e => setSavings(fmtMoneyInput(e.target.value))}
                    placeholder="貯金" className={moneyInput} />
                </div>
                <div className="relative" title="投資残高（円）">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-purple-400">投</span>
                  <input type="text" inputMode="numeric" value={investment} aria-label="投資残高（円）"
                    onChange={e => setInvestment(fmtMoneyInput(e.target.value))}
                    placeholder="投資" className={moneyInput} />
                </div>
                <button onClick={handleSaveAssets} disabled={saving}
                  title={`${monthEndLabel(month)}の残高を保存`}
                  className="col-span-2 sm:col-span-1 bg-blue-600 text-white rounded-lg px-4 py-1.5 text-sm font-semibold disabled:opacity-50">
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
              {month > defaultMonth && (
                <p className="text-[11px] text-amber-400">この月はまだ月末を迎えていません</p>
              )}
              {saveMsg && <p className="text-xs text-green-400">✅ {saveMsg}</p>}
            </div>
            </div>

            {/* 右：目標＋履歴 */}
            <div className="space-y-3">
            {/* 目標設定 */}
            <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 p-3 space-y-2">
              <h2 className="text-sm font-semibold text-slate-300">貯蓄目標</h2>

              {/* 目標一覧（1目標＝2行） */}
              {goals.length > 0 && (
                <div className="divide-y divide-slate-800">
                  {goals.map(g => {
                    const pct = Math.min((totalAssets / g.target_amount) * 100, 100)
                    const remaining = g.target_amount - totalAssets
                    return (
                      <div key={g.id} className="py-1.5">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-sm font-medium text-slate-100 truncate min-w-0">{g.name}</span>
                          {g.deadline && <span className="text-slate-500 shrink-0">〜{g.deadline}</span>}
                          <span className="ml-auto text-slate-300 shrink-0">{toJPY(totalAssets)} / {toJPY(g.target_amount)}</span>
                          <button onClick={() => handleDeleteGoal(g.id)}
                            className="text-slate-600 hover:text-red-400 text-lg leading-none w-5 shrink-0">×</button>
                        </div>
                        <div className="flex items-center gap-2 text-xs mt-0.5">
                          <div className="flex-1 bg-slate-800 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-blue-400 font-semibold w-12 text-right shrink-0">{pct.toFixed(1)}%</span>
                          <span className="text-slate-400 shrink-0">{remaining > 0 ? `あと${toJPY(remaining)}` : "達成済み"}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 目標追加フォーム：目標名｜目標額｜期限｜追加 */}
              <div className="grid grid-cols-2 sm:grid-cols-[1fr_8rem_9rem_auto] gap-1.5 border-t border-slate-800 pt-2">
                <input type="text" value={goalName} onChange={e => setGoalName(e.target.value)}
                  placeholder="新しい目標（例：緊急資金100万）"
                  className="col-span-2 sm:col-span-1 min-w-0 border rounded-lg px-2 py-1.5 text-sm bg-slate-900 text-slate-100" />
                <input type="text" inputMode="numeric" value={goalAmount} onChange={e => setGoalAmount(fmtMoneyInput(e.target.value))}
                  placeholder="目標額（円）"
                  className="min-w-0 border rounded-lg px-2 py-1.5 text-sm text-right bg-slate-900 text-slate-100" />
                <input type="date" value={goalDeadline} onChange={e => setGoalDeadline(e.target.value)} title="期限（任意）"
                  className="min-w-0 border rounded-lg px-2 py-1.5 text-sm bg-slate-900 text-slate-100" />
                <button onClick={handleAddGoal} disabled={!goalName || !goalAmount || addingGoal}
                  className="col-span-2 sm:col-span-1 bg-green-600 text-white rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50">
                  追加
                </button>
              </div>
            </div>

            {/* 履歴テーブル（1か月＝1行） */}
            {assets.length > 0 && (
              <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 overflow-hidden">
                <div className="grid grid-cols-[3.5rem_1fr_1fr_1fr_auto] items-center gap-1.5 px-3 py-1.5 bg-slate-800 border-b text-[11px] text-slate-400">
                  <span className="text-xs font-semibold text-slate-300">推移</span>
                  <span className="text-right">貯金</span>
                  <span className="text-right">投資</span>
                  <span className="text-right">合計</span>
                  <span className="w-12" />
                </div>
                {[...assets].reverse().map(a => (
                  <div key={a.month} className="grid grid-cols-[3.5rem_1fr_1fr_1fr_auto] items-center gap-1.5 px-3 py-1 border-b last:border-0 text-xs">
                    <span className="text-slate-400" title={monthEndLabel(a.month)}>{a.month.replace("-", "/")}</span>
                    <span className="text-green-400 text-right">{toJPY(a.savings)}</span>
                    <span className="text-purple-400 text-right">{toJPY(a.investment)}</span>
                    <span className="font-semibold text-blue-400 text-right">{toJPY(a.total)}</span>
                    <span className="w-12 flex items-center justify-end gap-1">
                      <button onClick={() => setMonth(a.month)}
                        title="この月を編集する"
                        className="text-[11px] text-slate-500 hover:text-blue-400">編集</button>
                      <button onClick={() => handleDeleteAsset(a.month)}
                        title="この月の記録を削除する"
                        className="text-slate-600 hover:text-red-400 text-base leading-none w-4">×</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  )
}
