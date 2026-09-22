"use client"

import { useMemo, useState } from "react"
import { SaveButton } from "@/components/SaveButton"
import { toHalfWidth } from "@/lib/num"

/**
 * 共同口座への「毎月いくらずつ出し合うか」の計画。
 *
 * 決めることは3つある。
 *  1. 毎月いくら必要か（生活費 ＋ ライフイベントの積立 ＋ 生活防衛資金）
 *  2. それを2人でどう分けるか（折半／収入比例／金額指定）
 *  3. 今すぐ満額は難しい場合、半年ごとにいくらずつ増やして必要額に届かせるか
 *
 * 入力値は life_tools（tool='contribution'）に共同スコープで保存する。
 */

interface Member { id: number; name: string }
interface LifeEvent { year: number; kind: "income" | "expense"; amount: number; repeat_years: number; name: string }
interface Params {
  method: "equal" | "income" | "custom"
  incomes: Record<string, string>   // メンバーID → 手取り月収（円）
  shares: Record<string, string>    // メンバーID → 毎月の拠出額（円）※ method=custom のとき使う
  current: string                   // 今の世帯合計の拠出額（円）
  stepAmount: string                // 1回の増額幅（世帯合計・円）
  stepMonths: string                // 何ヶ月ごとに増やすか
  eventYears: string                // 何年先までのライフイベントを積み立てるか
  bufferMonths: string              // 生活防衛資金として生活費の何ヶ月分を持つか
  bufferSpreadMonths: string        // 生活防衛資金を何ヶ月かけて貯めるか
  livingSource: "budget" | "actual" | "manual"  // 生活費をどこから取るか
  livingCost: string                // 生活費の手入力値（livingSource=manual のとき使う）
}

const DEFAULTS: Params = {
  method: "income",
  incomes: {},
  shares: {},
  current: "",
  stepAmount: "10000",
  stepMonths: "6",
  eventYears: "10",
  bufferMonths: "6",
  bufferSpreadMonths: "24",
  livingSource: "budget",
  livingCost: "",
}

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`
/** 入力途中でも3桁区切りにする。保存・計算時は num() でカンマを外す */
const money = (v: string) => {
  const raw = toHalfWidth(v ?? "").replace(/[^0-9]/g, "")
  return raw === "" ? "" : Number(raw).toLocaleString("ja-JP")
}

const num = (v: string) => {
  const n = Number(toHalfWidth(v ?? "").replace(/,/g, ""))
  return isNaN(n) ? 0 : n
}

export function JointContribution({ members, events, hints, saved, scope, onSaved }: {
  members: Member[]
  events: LifeEvent[]
  hints: { annualExpense: number; savings: number; budgetExpenseAnnual?: number } | null
  saved: Params | null
  scope: string
  onSaved: () => void
}) {
  const [p, setP] = useState<Params>(() => {
    const base = { ...DEFAULTS, ...(saved ?? {}) }
    // 保存済みの値（カンマ無し）も表示時に3桁区切りへ揃える
    return {
      ...base,
      current: money(base.current),
      stepAmount: money(base.stepAmount),
      livingCost: money(base.livingCost),
      incomes: Object.fromEntries(Object.entries(base.incomes ?? {}).map(([k, v]) => [k, money(String(v))])),
      shares: Object.fromEntries(Object.entries(base.shares ?? {}).map(([k, v]) => [k, money(String(v))])),
    }
  })
  const set = <K extends keyof Params>(k: K, v: Params[K]) => setP(prev => ({ ...prev, [k]: v }))

  const thisYear = new Date().getFullYear()

  // ── 1. いくら必要か ───────────────────────────────────────
  // 生活費の取り方は3通り。予算は「これで暮らすと決めた額」、実績は「実際に使った額」。
  // 決めた額どおりに暮らせていないなら実績のほうが現実的なので、選べるようにしている。
  const budgetMonthly = Math.round((hints?.budgetExpenseAnnual ?? 0) / 12)
  const actualMonthly = Math.round((hints?.annualExpense ?? 0) / 12)
  const living =
    p.livingSource === "manual" ? num(p.livingCost)
    : p.livingSource === "actual" ? actualMonthly
    : (budgetMonthly || actualMonthly)

  const eventYears = Math.max(1, num(p.eventYears) || 10)
  // 今後 eventYears 年以内のライフイベント。
  // ご祝儀や出産育児一時金のように戻ってくるお金は、その分だけ積み立てる必要がないので差し引く。
  const { eventExpense, eventIncome } = useMemo(() => {
    const inWindow = (e: LifeEvent) => {
      let s = 0
      for (let i = 0; i < Math.max(1, e.repeat_years); i++) {
        const y = e.year + i
        if (y >= thisYear && y < thisYear + eventYears) s += e.amount
      }
      return s
    }
    return {
      eventExpense: events.filter(e => e.kind === "expense").reduce((sum, e) => sum + inWindow(e), 0),
      eventIncome: events.filter(e => e.kind === "income").reduce((sum, e) => sum + inWindow(e), 0),
    }
  }, [events, eventYears, thisYear])
  // 戻りが上回っても「積立が不要」になるだけで、マイナスの積立にはしない
  const eventTotal = Math.max(0, eventExpense - eventIncome)
  const eventMonthly = Math.round(eventTotal / (eventYears * 12))

  const bufferTarget = living * (num(p.bufferMonths) || 6)
  const bufferGap = Math.max(0, bufferTarget - (hints?.savings ?? 0))
  const bufferMonthly = Math.round(bufferGap / Math.max(1, num(p.bufferSpreadMonths) || 24))

  const needed = living + eventMonthly + bufferMonthly

  // ── 2. 2人でどう分けるか ─────────────────────────────────
  const incomeTotal = members.reduce((s, m) => s + num(p.incomes[m.id] ?? ""), 0)
  const customTotal = members.reduce((s, m) => s + num(p.shares[m.id] ?? ""), 0)

  /** 世帯合計 total を、選んだ方式で各メンバーに割り振る */
  function split(total: number): { member: Member; amount: number; ratio: number }[] {
    if (members.length === 0) return []
    if (p.method === "custom") {
      return members.map(m => ({
        member: m,
        amount: num(p.shares[m.id] ?? ""),
        ratio: customTotal > 0 ? num(p.shares[m.id] ?? "") / customTotal : 0,
      }))
    }
    if (p.method === "income" && incomeTotal > 0) {
      return members.map(m => {
        const r = num(p.incomes[m.id] ?? "") / incomeTotal
        return { member: m, amount: Math.round(total * r), ratio: r }
      })
    }
    const r = 1 / members.length
    return members.map(m => ({ member: m, amount: Math.round(total * r), ratio: r }))
  }

  const neededSplit = split(needed)
  const current = p.method === "custom" ? customTotal : num(p.current)
  const currentSplit = split(current)
  const gap = needed - current

  // ── 3. 半年ごとの増額プラン ───────────────────────────────
  const stepAmount = num(p.stepAmount)
  const stepMonths = Math.max(1, num(p.stepMonths) || 6)
  const ramp = useMemo(() => {
    if (gap <= 0 || stepAmount <= 0) return []
    const rows: { monthsLater: number; total: number; reached: boolean }[] = []
    let total = current
    for (let i = 0; i <= 12 && total < needed; i++) {
      rows.push({ monthsLater: i * stepMonths, total, reached: false })
      total += stepAmount
    }
    rows.push({ monthsLater: rows.length * stepMonths, total, reached: total >= needed })
    return rows
  }, [gap, stepAmount, stepMonths, current, needed])

  const monthsToReach = gap > 0 && stepAmount > 0 ? Math.ceil(gap / stepAmount) * stepMonths : 0

  async function save() {
    const res = await fetch("/api/lifeplan/tools", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "contribution", params: p, card_type: scope }),
    })
    if (!res.ok) throw new Error("保存に失敗しました")
    onSaved()
  }

  const input = "w-full bg-slate-900 text-slate-100 border border-slate-700 rounded-lg px-2 py-2 text-sm text-right"

  if (members.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
        <p className="text-sm text-slate-300">まず「前提条件」で家族構成に2人を登録してください</p>
        <p className="text-xs text-slate-500 mt-2">登録した人が、ここでの分担の対象になります</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* ── 必要額 ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100">毎月いくら必要か</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            共同の支出実績とライフイベントから、共同口座に入れておくべき金額を出しています
          </p>
        </div>

        <div className="space-y-2">
          <Row
            label="共同の生活費"
            hint={
              p.livingSource === "manual" ? "手入力した金額を使います"
              : p.livingSource === "actual" ? "直近1年の共同支出の平均"
              : budgetMonthly > 0 ? "予実管理で立てた毎月の予算の合計" : "予算が未設定のため実績の平均を使っています"
            }
            value={living}
            editable={
              <div className="flex items-center gap-1.5">
                <div className="flex rounded-lg bg-slate-800 p-0.5 text-[11px]">
                  {([["budget", "予算"], ["actual", "実績"], ["manual", "手入力"]] as const).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => set("livingSource", k)}
                      className={`px-2 py-1 rounded-md transition-colors ${
                        p.livingSource === k ? "bg-blue-600 text-white" : "text-slate-400"
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
                {p.livingSource === "manual" && (
                  <input className={`${input} w-28`} inputMode="numeric" placeholder="0"
                    value={p.livingCost} onChange={e => set("livingCost", money(e.target.value))} />
                )}
              </div>
            }
          />
          {p.livingSource !== "manual" && budgetMonthly > 0 && actualMonthly > 0 && (
            <p className="text-[11px] text-slate-500 -mt-1">
              予算 {yen(budgetMonthly)} / 実績 {yen(actualMonthly)}
              {actualMonthly > budgetMonthly
                ? "（実績が予算を超えています。実績で見ておくほうが安全です）"
                : "（予算内で収まっています）"}
            </p>
          )}
          <Row
            label="ライフイベントの積立"
            hint={eventIncome > 0
              ? `${eventYears}年以内の支出 ${yen(eventExpense)} − 戻り ${yen(eventIncome)}（ご祝儀・一時金など）を月割り`
              : `${eventYears}年以内の予定 ${yen(eventExpense)} を月割り`}
            value={eventMonthly}
          />
          <Row
            label="生活防衛資金の積立"
            hint={bufferGap > 0
              ? `目標 ${yen(bufferTarget)}（生活費${num(p.bufferMonths) || 6}ヶ月分）に対し ${yen(bufferGap)} 不足`
              : "目標額に到達済み"}
            value={bufferMonthly}
          />
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 pt-2.5">
          <span className="text-sm font-semibold text-slate-200">毎月の必要額</span>
          <span className="text-lg font-bold text-blue-400">{yen(needed)}</span>
        </div>

        <details className="text-xs">
          <summary className="text-slate-500 cursor-pointer">計算の前提を変える</summary>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <Field label="イベントは何年先まで">
              <input className={input} inputMode="numeric" value={p.eventYears}
                onChange={e => set("eventYears", toHalfWidth(e.target.value).replace(/[^0-9]/g, ""))} />
            </Field>
            <Field label="防衛資金（ヶ月分）">
              <input className={input} inputMode="numeric" value={p.bufferMonths}
                onChange={e => set("bufferMonths", toHalfWidth(e.target.value).replace(/[^0-9]/g, ""))} />
            </Field>
            <Field label="何ヶ月で貯める">
              <input className={input} inputMode="numeric" value={p.bufferSpreadMonths}
                onChange={e => set("bufferSpreadMonths", toHalfWidth(e.target.value).replace(/[^0-9]/g, ""))} />
            </Field>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            生活防衛資金は、2人とも働けなくなっても暮らせる期間の生活費です。共働きなら3〜6ヶ月分、
            収入が1人に偏っているなら6〜12ヶ月分が目安になります
          </p>
        </details>
      </div>

      {/* ── 分担 ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100">2人でどう分けるか</h3>
          <p className="text-xs text-slate-500 mt-0.5">分け方に正解はありません。納得できるかどうかで選んでください</p>
        </div>

        <div className="flex rounded-xl bg-slate-800 p-1 gap-1">
          {([["equal", "折半"], ["income", "収入に比例"], ["custom", "金額を決める"]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => set("method", k)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                p.method === k ? "bg-blue-600 text-white" : "text-slate-400"
              }`}>
              {label}
            </button>
          ))}
        </div>

        <p className="text-[11px] text-slate-500">
          {p.method === "equal"
            ? "同額ずつ出します。収入差が大きいと、少ないほうの手元に残るお金が極端に減る点に注意してください"
            : p.method === "income"
            ? "手取り収入の比で分けます。負担感が2人で揃いやすく、共働きで収入差がある家庭で選ばれやすい方法です"
            : "それぞれの金額を直接決めます。片方が住居費、もう片方が生活費、といった費目での分担にも使えます"}
        </p>

        {p.method === "income" && (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">それぞれの手取り月収</p>
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-2">
                <span className="text-sm text-slate-300 w-24 shrink-0 truncate">{m.name}</span>
                <input className={`${input} flex-1 min-w-0`} inputMode="numeric" placeholder="0"
                  value={p.incomes[m.id] ?? ""}
                  onChange={e => set("incomes", { ...p.incomes, [m.id]: money(e.target.value) })} />
              </div>
            ))}
          </div>
        )}

        {p.method === "custom" && (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">それぞれが毎月出す額</p>
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-2">
                <span className="text-sm text-slate-300 w-24 shrink-0 truncate">{m.name}</span>
                <input className={`${input} flex-1 min-w-0`} inputMode="numeric" placeholder="0"
                  value={p.shares[m.id] ?? ""}
                  onChange={e => set("shares", { ...p.shares, [m.id]: money(e.target.value) })} />
              </div>
            ))}
          </div>
        )}

        {/* 必要額を満たす場合の内訳 */}
        <div className="border border-blue-500/30 bg-blue-500/5 rounded-lg p-3">
          <p className="text-xs text-blue-300 font-semibold mb-2">必要額 {yen(needed)} を分けると</p>
          <div className="space-y-1">
            {neededSplit.map(s => (
              <div key={s.member.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-300">
                  {s.member.name}
                  <span className="text-[10px] text-slate-500 ml-1.5">{Math.round(s.ratio * 100)}%</span>
                </span>
                <span className="font-bold text-slate-100">{yen(s.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 増額プラン ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100">少しずつ増やす計画</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            はじめから必要額を出すのが難しい場合、一定期間ごとに増やして近づけます
          </p>
        </div>

        {p.method !== "custom" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 shrink-0">今の拠出額（世帯合計）</span>
            <input className={`${input} flex-1 min-w-0`} inputMode="numeric" placeholder="0"
              value={p.current} onChange={e => set("current", money(e.target.value))} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Field label="1回の増額（世帯合計）">
            <input className={input} inputMode="numeric" value={p.stepAmount}
              onChange={e => set("stepAmount", money(e.target.value))} />
          </Field>
          <Field label="増やす間隔（ヶ月）">
            <input className={input} inputMode="numeric" value={p.stepMonths}
              onChange={e => set("stepMonths", toHalfWidth(e.target.value).replace(/[^0-9]/g, ""))} />
          </Field>
        </div>

        {gap <= 0 ? (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
            <p className="text-sm text-green-300 font-semibold">今の拠出額で必要額に届いています</p>
            <p className="text-xs text-slate-400 mt-1">
              余剰 {yen(-gap)}。この分を投資に回すか、防衛資金を厚くするかを決めておくと迷いません
            </p>
          </div>
        ) : (
          <>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <p className="text-sm text-amber-300 font-semibold">あと {yen(gap)} 不足しています</p>
              <p className="text-xs text-slate-400 mt-1">
                {stepAmount > 0
                  ? `${stepMonths}ヶ月ごとに ${yen(stepAmount)} ずつ増やすと、約${monthsToReach}ヶ月（${(monthsToReach / 12).toFixed(1)}年）で必要額に届きます`
                  : "増額の金額を入れると、必要額に届くまでの期間を計算します"}
              </p>
            </div>

            {ramp.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-800">
                      <th className="text-left py-1.5 px-2 font-medium">時期</th>
                      <th className="text-right py-1.5 px-2 font-medium">世帯合計</th>
                      {members.map(m => (
                        <th key={m.id} className="text-right py-1.5 px-2 font-medium">{m.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ramp.map((r, i) => {
                      const parts = split(r.total)
                      return (
                        <tr key={i} className={`border-b border-slate-800 last:border-0 ${r.reached ? "bg-green-500/10" : ""}`}>
                          <td className="py-1.5 px-2 text-slate-300">
                            {r.monthsLater === 0 ? "今" : `${r.monthsLater}ヶ月後`}
                            {r.reached && <span className="text-green-400 ml-1.5">達成</span>}
                          </td>
                          <td className="py-1.5 px-2 text-right font-semibold text-slate-100">{yen(r.total)}</td>
                          {parts.map(s => (
                            <td key={s.member.id} className="py-1.5 px-2 text-right text-slate-400">{yen(s.amount)}</td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <SaveButton label="この分担プランを保存する" onSave={save} />

      <p className="text-[11px] text-slate-500 leading-relaxed">
        共同口座に入れる額を決めたら、設定の「定期」に共同の入金として登録しておくと、
        毎月の予実管理でも計画どおり入っているか確認できます。増額のタイミングは、
        定期の期間指定（◯年◯月まで）で区切って登録し直すと履歴が残ります
      </p>
    </div>
  )
}

function Row({ label, hint, value, editable }: {
  label: string; hint: string; value: number; editable?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-slate-300">{label}</p>
        <p className="text-[11px] text-slate-500">{hint}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {editable}
        <span className="text-sm font-semibold text-slate-100 w-24 text-right">{yen(value)}</span>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-slate-500 block mb-0.5">{label}</label>
      {children}
    </div>
  )
}
