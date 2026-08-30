"use client"

import { useEffect, useState, useMemo } from "react"
import {
  ACTION_STEPS, STATE_STYLE, NISA_VS_IDECO,
  type ActionContext, type StepState,
} from "@/lib/actionPlan"

const fmtMan = (yen: number) => `${Math.round(yen / 10000).toLocaleString("ja-JP")}万円`

export function ActionPlanTab() {
  const [ctx, setCtx] = useState<ActionContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [showCompare, setShowCompare] = useState(false)

  useEffect(() => {
    fetch("/api/learn/diagnosis")
      .then(r => r.json())
      .then(d => setCtx({
        monthlyExpense: d.monthlyExpense ?? null,
        savings: Number(d.savings ?? 0),
        investment: Number(d.investment ?? 0),
        hasAssetData: !!d.hasAssetData,
        annualIncome: d.annualIncome ?? null,
        categoryTotals: d.categoryTotals ?? {},
        hasMortgage: !!d.hasMortgage,
        childCount: 0,
        byScope: d.byScope ?? {
          self: { savings: 0, investment: 0, categoryTotals: {} },
          joint: { savings: 0, investment: 0, categoryTotals: {} },
        },
      }))
      .finally(() => setLoading(false))
  }, [])

  const assessed = useMemo(() => {
    if (!ctx) return []
    return ACTION_STEPS.map(step => ({ step, status: step.assess(ctx) }))
  }, [ctx])

  // 「次にやること」＝ 上から見て最初の done 以外（unknown は判断できないので飛ばす）
  const next = assessed.find(a => a.status.state === "todo" || a.status.state === "doing")
  const doneCount = assessed.filter(a => a.status.state === "done").length

  if (loading) {
    return <p className="text-center text-slate-500 text-sm py-10">診断中...</p>
  }

  return (
    <div className="space-y-3">
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3">
        <p className="text-xs text-blue-200/90 leading-relaxed">
          NISA・iDeCo・保険は、単体で比べても答えが出ません。
          <span className="font-semibold text-blue-300">埋めるべき順番が決まっている</span>ので、
          上から順に進めるのが最短です。家計簿の実績から、いまどこまで進んでいるかを判定しました。
        </p>
        <p className="text-[11px] text-blue-200/70 leading-relaxed mt-1.5">
          iDeCoや生命保険は個人、貯蓄は共同…と管理が分かれていても大丈夫です。
          判定は<span className="font-semibold">個人と共同を合算した世帯全体</span>で行い、
          どちら側にあるかは各項目に内訳として表示します。
        </p>
      </div>

      {/* 現状サマリー */}
      {ctx && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="預貯金" value={ctx.hasAssetData ? fmtMan(ctx.savings) : "未登録"}
            sub={scopeSub(ctx.byScope.self.savings, ctx.byScope.joint.savings)} />
          <Stat label="投資資産" value={ctx.hasAssetData ? fmtMan(ctx.investment) : "未登録"}
            sub={scopeSub(ctx.byScope.self.investment, ctx.byScope.joint.investment)} />
          <Stat label="月の生活費" value={ctx.monthlyExpense ? fmtMan(ctx.monthlyExpense) : "—"} />
        </div>
      )}

      {/* 次にやること */}
      {next && (
        <div className="bg-slate-900 rounded-xl border-2 border-blue-500/40 p-4">
          <p className="text-[11px] text-blue-300 font-semibold mb-1">次にやること</p>
          <p className="text-base font-bold text-slate-100 mb-1.5">{next.step.title}</p>
          <p className="text-xs text-slate-400 mb-2">{next.status.detail}</p>
          <ul className="space-y-1">
            {next.step.how.map((h, i) => (
              <li key={i} className="text-xs text-slate-300 leading-relaxed flex gap-1.5">
                <span className="text-blue-400 shrink-0">{i + 1}.</span><span>{h}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 進捗 */}
      <div className="flex items-center gap-2 px-1">
        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${(doneCount / ACTION_STEPS.length) * 100}%` }} />
        </div>
        <span className="text-[11px] text-slate-500 shrink-0">
          {doneCount} / {ACTION_STEPS.length} 達成
        </span>
      </div>

      {/* ステップ一覧 */}
      <div className="space-y-2">
        {assessed.map(({ step, status }, i) => (
          <StepCard
            key={step.id} index={i + 1} title={step.title} why={step.why}
            target={step.target} how={step.how} caution={step.caution} status={status}
            open={openId === step.id}
            onToggle={() => setOpenId(openId === step.id ? null : step.id)}
          />
        ))}
      </div>

      {/* NISA vs iDeCo */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <button onClick={() => setShowCompare(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/50 transition-colors">
          <span className="text-sm font-bold text-slate-100">{NISA_VS_IDECO.title}</span>
          <span className="text-slate-600 text-xs">{showCompare ? "▲" : "▼"}</span>
        </button>
        {showCompare && (
          <div className="px-4 pb-4 border-t border-slate-800 pt-3 space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800">
                    <th className="text-left py-1.5 font-medium"></th>
                    <th className="text-left py-1.5 px-2 font-semibold text-blue-300">NISA</th>
                    <th className="text-left py-1.5 px-2 font-semibold text-green-300">iDeCo</th>
                  </tr>
                </thead>
                <tbody>
                  {NISA_VS_IDECO.rows.map(r => (
                    <tr key={r.label} className="border-b border-slate-800 last:border-0 align-top">
                      <td className="py-1.5 text-slate-500 whitespace-nowrap pr-2">{r.label}</td>
                      <td className="py-1.5 px-2 text-slate-300 leading-relaxed">{r.nisa}</td>
                      <td className="py-1.5 px-2 text-slate-300 leading-relaxed">{r.ideco}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/25 rounded-lg p-2.5">
              <p className="text-[11px] text-blue-200/90 leading-relaxed">{NISA_VS_IDECO.conclusion}</p>
            </div>
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed">
        ※ 実施状況は家計簿のカテゴリ名から判定しています。
        「iDeCo」「NISA」「保険」「ふるさと納税」を含むカテゴリ名にしておくと、より正確に判定されます。
        制度の金額・上限は改定されるため、実行前に最新の条件を確認してください。
      </p>
    </div>
  )
}

/** 個人・共同の両方に残高があるときだけ内訳を出す */
function scopeSub(self: number, joint: number): string | undefined {
  if (self > 0 && joint > 0) return `個人${fmtMan(self)}・共同${fmtMan(joint)}`
  if (joint > 0) return "共同"
  if (self > 0) return "個人"
  return undefined
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-3 text-center">
      <p className="text-[11px] text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm font-bold text-slate-100">{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function StepCard({ index, title, why, target, how, caution, status, open, onToggle }: {
  index: number
  title: string
  why: string
  target: string
  how: string[]
  caution?: string
  status: { state: StepState; detail: string }
  open: boolean
  onToggle: () => void
}) {
  const st = STATE_STYLE[status.state]
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <button onClick={onToggle} className="w-full text-left px-4 py-3 hover:bg-slate-800/50 transition-colors">
        <div className="flex items-start gap-2.5">
          <span className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold text-white ${st.dot}`}>
            {status.state === "done" ? "✓" : index}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <span className="text-sm font-bold text-slate-100">{title}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${st.cls}`}>
                {st.label}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">{status.detail}</p>
          </div>
          <span className="text-slate-600 text-xs shrink-0 mt-1">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-800 pt-3">
          <div>
            <p className="text-[10px] font-semibold text-slate-500 mb-1">なぜこの順番か</p>
            <p className="text-xs text-slate-300 leading-relaxed">{why}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500 mb-1">達成の目安</p>
            <p className="text-xs text-slate-200 leading-relaxed">{target}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500 mb-1">やること</p>
            <ul className="space-y-1">
              {how.map((h, i) => (
                <li key={i} className="text-xs text-slate-300 leading-relaxed flex gap-1.5">
                  <span className="text-slate-600 shrink-0">{i + 1}.</span><span>{h}</span>
                </li>
              ))}
            </ul>
          </div>
          {caution && (
            <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg p-2.5">
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                <span className="font-semibold text-amber-300">注意：</span>{caution}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
