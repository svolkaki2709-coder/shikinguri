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
interface LifeEvent {
  year: number; month: number | null; kind: "income" | "expense"
  amount: number; repeat_years: number; name: string; inflate?: boolean
}

/** 月が未設定のイベントは、年の半ば（6月）に起きるものとして扱う */
const DEFAULT_MONTH = 6
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
  earmarked: string                 // 用途を決めていない取り置き
  earmarks: Record<string, string>  // イベントごとの取り置き（キーは "年|イベント名"）
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
  earmarked: "",
  earmarks: {},
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

export function JointContribution({ members, events, hints, inflationRate, saved, scope, onSaved }: {
  members: Member[]
  events: LifeEvent[]
  /** 物価上昇率（%）。イベント金額は今の物価で登録されているので将来価値に直す */
  inflationRate: number
  hints: { annualExpense: number; savings: number; budgetExpenseAnnual?: number; assetMonth?: string | null; budgetYear?: number } | null
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
      earmarked: money(base.earmarked),
      earmarks: Object.fromEntries(Object.entries(base.earmarks ?? {}).map(([k, v]) => [k, money(String(v))])),
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
  // 取り置き（すでに用途が決まっているお金）。
  // イベントごとに割り当てられるが、用途を決めていない分も置ける。
  // どちらも生活防衛資金には数えず、イベントの支払いに先に充てる。
  const eventKey = (year: number, name: string) => `${year}|${name}`
  const thisMonth = new Date().getMonth() + 1
  const infl = (inflationRate ?? 0) / 100
  /**
   * 今の物価で登録された金額を、その年の価格に直す。
   * 食費や式場代のように物価とともに上がるものは、今の金額のまま積み立てると足りなくなる。
   * 一時金・給付金のように金額が決まっているもの（inflate=false）はそのまま。
   */
  const atYear = (amount: number, year: number, inflate?: boolean) =>
    inflate === false ? amount : Math.round(amount * Math.pow(1 + infl, Math.max(0, year - thisYear)))
  /** 今から何ヶ月後か（今月・過去は「今すぐ」扱いの1ヶ月） */
  const monthsUntil = (year: number, month: number) =>
    Math.max(1, (year - thisYear) * 12 + (month - thisMonth))

  // 期間内の支出イベント（同じ年・同じ名前はまとめる）
  const expenseEvents = useMemo(() => {
    const map = new Map<string, { key: string; year: number; month: number; name: string; amount: number }>()
    for (const e of events) {
      if (e.kind !== "expense") continue
      for (let i = 0; i < Math.max(1, e.repeat_years); i++) {
        const y = e.year + i
        if (y < thisYear || y >= thisYear + eventYears) continue
        const k = eventKey(y, e.name)
        const cur = map.get(k)
        if (cur) cur.amount += atYear(e.amount, y, e.inflate)
        else map.set(k, { key: k, year: y, month: e.month ?? DEFAULT_MONTH, name: e.name, amount: atYear(e.amount, y, e.inflate) })
      }
    }
    return [...map.values()].sort((a, b) => a.year - b.year || a.month - b.month)
  }, [events, eventYears, thisYear])

  const earmarkFor = (key: string) => num(p.earmarks?.[key] ?? "")
  const earmarkedFree = num(p.earmarked)
  const earmarkedTotal = expenseEvents.reduce((s2, e) => s2 + earmarkFor(e.key), 0) + earmarkedFree

  // 今後 eventYears 年以内のライフイベントを年ごとに集計する。
  // 単純な月割りだと「10年で割った額」になり、2年後のイベントには間に合わない。
  // 年ごとに「その年までに必要な累計額」を出し、残り月数で割った額のうち
  // 一番厳しいものを必要額とする（直近の大きなイベントが効く）。
  // 年ではなく「年月」の時系列で見る。
  // 同じ年でも支払いが先・入金が後なら、その時点では資金が足りない。
  // 各時点で「それまでに必要な累計額」と「残り月数」を出し、
  // 一番きつい時点に合わせた金額を必要額とする。
  const eventPlan = useMemo(() => {
    const occurrences: { year: number; month: number; amount: number; name: string; kind: string }[] = []
    for (const e of events) {
      for (let i = 0; i < Math.max(1, e.repeat_years); i++) {
        const y = e.year + i
        if (y < thisYear || y >= thisYear + eventYears) continue
        const v = atYear(e.amount, y, e.inflate)
        occurrences.push({
          year: y, month: e.month ?? DEFAULT_MONTH,
          amount: e.kind === "expense" ? v : -v,
          name: e.name, kind: e.kind,
        })
      }
    }
    occurrences.sort((a, b) => a.year - b.year || a.month - b.month)

    let cumulative = 0
    return occurrences.map(o => {
      cumulative += o.amount
      const monthsLeft = monthsUntil(o.year, o.month)
      // その時点までに支払いへ充てられる取り置き（先の予定に割り当てた分はまだ使えない）
      const allocated = expenseEvents
        .filter(e => e.year < o.year || (e.year === o.year && e.month <= o.month))
        .reduce((s2, e) => s2 + earmarkFor(e.key), 0) + earmarkedFree
      const shortfall = Math.max(0, cumulative - allocated)
      return {
        year: o.year, month: o.month, name: o.name, kind: o.kind, net: o.amount,
        cumulative, allocated, monthsLeft, monthly: Math.round(shortfall / monthsLeft),
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, eventYears, thisYear, thisMonth, expenseEvents, p.earmarks, p.earmarked])

  const sumEvents = (kind: "income" | "expense") => events.filter(e => e.kind === kind).reduce((sum, e) => {
    let v = 0
    for (let i = 0; i < Math.max(1, e.repeat_years); i++) {
      const y = e.year + i
      if (y >= thisYear && y < thisYear + eventYears) v += atYear(e.amount, y, e.inflate)
    }
    return sum + v
  }, 0)
  const eventExpense = sumEvents("expense")
  const eventIncome = sumEvents("income")

  // 一番きついイベント（これに合わせれば、他はすべて間に合う）
  const binding = eventPlan.reduce<typeof eventPlan[number] | null>(
    (worst, r) => (worst === null || r.monthly > worst.monthly ? r : worst), null)
  /** 支払いが先・入金が後で、一時的に資金が不足する時点 */
  const shortfallPoints = eventPlan.filter(r => r.cumulative - r.allocated > 0)
  const eventMonthly = binding ? binding.monthly : 0

  const bufferTarget = living * (num(p.bufferMonths) || 6)
  // 取り置き分は使い道が決まっているので、防衛資金としては数えない
  const freeSavings = Math.max(0, (hints?.savings ?? 0) - earmarkedTotal)
  const bufferGap = Math.max(0, bufferTarget - freeSavings)
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

  // ── 3. 少しずつ増やす計画 ─────────────────────────────────
  // 「月額が必要額に届くまで何ヶ月か」だけを見ても意味がない。
  // 届くまでの間はずっと足りない額しか入っていないので、その間に来るイベントの
  // 支払いができるかどうかは、口座の残高を月ごとに追わないと分からない。
  // そこで、共同口座の残高を毎月シミュレーションする。
  //   残高 = 前月残高 ＋ 拠出（段階的に増える）− 生活費（物価で上がる）± イベント
  const stepAmount = num(p.stepAmount)
  const stepMonths = Math.max(1, num(p.stepMonths) || 6)
  const horizon = eventYears * 12
  const startBalance = hints?.savings ?? 0

  // 月ごとのイベント収支（今からの月数 → 金額。支出はマイナス）
  const eventByMonth = useMemo(() => {
    const m = new Map<number, { amount: number; names: string[] }>()
    for (const e of events) {
      for (let i = 0; i < Math.max(1, e.repeat_years); i++) {
        const y = e.year + i
        const mo = e.month ?? DEFAULT_MONTH
        const t = (y - thisYear) * 12 + (mo - thisMonth)
        if (t < 0 || t >= horizon) continue
        const v = atYear(e.amount, y, e.inflate)
        const cur = m.get(t) ?? { amount: 0, names: [] }
        cur.amount += e.kind === "expense" ? -v : v
        cur.names.push(e.name)
        m.set(t, cur)
      }
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, horizon, thisYear, thisMonth, infl])

  /** 開始額 start から stepMonths ごとに step ずつ増やしたときの残高推移 */
  function simulate(start: number, step: number) {
    let balance = startBalance
    let minBalance = balance
    let minAt = 0
    let firstShort: number | null = null
    const rows: { t: number; contribution: number; balance: number; events: string[] }[] = []
    for (let t = 0; t < horizon; t++) {
      const contribution = start + step * Math.floor(t / stepMonths)
      const livingNow = living * Math.pow(1 + infl, t / 12)
      const ev = eventByMonth.get(t)
      balance += contribution - livingNow + (ev?.amount ?? 0)
      if (balance < minBalance) { minBalance = balance; minAt = t }
      if (balance < 0 && firstShort === null) firstShort = t
      if (t % stepMonths === 0 || ev) rows.push({ t, contribution, balance, events: ev?.names ?? [] })
    }
    return { minBalance, minAt, firstShort, rows }
  }

  const sim = useMemo(
    () => simulate(current, stepAmount),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, stepAmount, stepMonths, living, infl, eventByMonth, startBalance, horizon],
  )

  /** 残高が一度も0を下回らない最小の値を二分探索で求める */
  function minimalToAvoidShort(solve: (x: number) => number): number {
    let lo = 0, hi = 2_000_000
    if (solve(hi) < 0) return hi
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2
      if (solve(mid) >= 0) hi = mid; else lo = mid
    }
    return Math.ceil(hi / 1000) * 1000
  }
  // 今の開始額のまま、1回の増額をいくらにすれば間に合うか
  const requiredStep = useMemo(
    () => (sim.firstShort === null ? 0 : minimalToAvoidShort(x => simulate(current, x).minBalance)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sim.firstShort, current, stepMonths, living, infl, eventByMonth, startBalance, horizon],
  )
  // 増額しない場合、最初からいくら入れれば間に合うか
  const requiredFlat = useMemo(
    () => (sim.firstShort === null ? 0 : minimalToAvoidShort(x => simulate(x, 0).minBalance)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sim.firstShort, stepMonths, living, infl, eventByMonth, startBalance, horizon],
  )

  const monthLabel = (t: number) => {
    const total = (thisYear * 12 + (thisMonth - 1)) + t
    return `${Math.floor(total / 12)}年${(total % 12) + 1}月`
  }

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
              : budgetMonthly > 0 ? `${hints?.budgetYear ?? new Date().getFullYear()}年の予算を12ヶ月で平均した額` : "予算が未設定のため実績の平均を使っています"
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
                  <div className="w-28">
                    <input className={input} inputMode="numeric" placeholder="0"
                      value={p.livingCost} onChange={e => set("livingCost", money(e.target.value))} />
                  </div>
                )}
              </div>
            }
          />
          {p.livingSource !== "manual" && budgetMonthly > 0 && actualMonthly > 0 && (
            <p className="text-[11px] text-slate-500 -mt-1">
              予算 {yen(budgetMonthly)}（{hints?.budgetYear ?? new Date().getFullYear()}年）/ 実績 {yen(actualMonthly)}（直近1年）
              {actualMonthly > budgetMonthly
                ? "（実績が予算を超えています。実績で見ておくほうが安全です）"
                : "（予算内で収まっています）"}
            </p>
          )}
          <Row
            label="ライフイベントの積立"
            hint={binding
              ? `${binding.year}年${binding.month}月の「${binding.name}」に間に合わせる金額です（${eventYears}年以内の支出 ${yen(eventExpense)}${eventIncome > 0 ? ` − 戻り ${yen(eventIncome)}` : ""}）`
              : `${eventYears}年以内に予定されたイベントはありません`}
            value={eventMonthly}
          />

          <div className="bg-slate-800/40 rounded-lg px-2.5 py-2 space-y-2">
            <div>
              <p className="text-sm text-slate-300">取り置き（すでに確保してあるお金）</p>
              <p className="text-[11px] text-slate-500">
                どのイベント用かを選んで入れてください。生活防衛資金には数えず、先にその支払いへ充てます
              </p>
            </div>

            {expenseEvents.map(ev => (
              <div key={ev.key} className="flex items-center gap-2">
                <span className="text-xs text-slate-400 flex-1 min-w-0 truncate">
                  {ev.year}年 {ev.name}
                  <span className="text-slate-600 ml-1.5">{yen(ev.amount)}</span>
                </span>
                <div className="w-32 shrink-0">
                  <input className={input} inputMode="numeric" placeholder="0"
                    value={p.earmarks?.[ev.key] ?? ""}
                    onChange={e => set("earmarks", { ...(p.earmarks ?? {}), [ev.key]: money(e.target.value) })} />
                </div>
              </div>
            ))}

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 flex-1 min-w-0">用途を決めていない分</span>
              <div className="w-32 shrink-0">
                <input className={input} inputMode="numeric" placeholder="0"
                  value={p.earmarked} onChange={e => set("earmarked", money(e.target.value))} />
              </div>
            </div>

            {earmarkedTotal > 0 && (
              <p className={`text-[11px] ${earmarkedTotal > (hints?.savings ?? 0) ? "text-red-400" : "text-slate-500"}`}>
                取り置きの合計 {yen(earmarkedTotal)}
                {earmarkedTotal > (hints?.savings ?? 0)
                  ? `（共同貯蓄 ${yen(hints?.savings ?? 0)} を超えています）`
                  : `／ 共同貯蓄 ${yen(hints?.savings ?? 0)}`}
              </p>
            )}
          </div>

          {eventPlan.length > 0 && (
            <div className="bg-slate-800/50 rounded-lg p-2.5 overflow-x-auto">
              <p className="text-[11px] text-slate-400 mb-1.5">
                各イベントに間に合うか（取り置き {yen(earmarkedTotal)} を先に充当）
              </p>
              <table className="w-full text-[11px] whitespace-nowrap">
                <thead>
                  <tr className="text-slate-500">
                    <th className="text-left font-medium py-0.5">時期</th>
                    <th className="text-left font-medium py-0.5">イベント</th>
                    <th className="text-right font-medium py-0.5">収支</th>
                    <th className="text-right font-medium py-0.5">必要累計</th>
                    <th className="text-right font-medium py-0.5">取り置き充当</th>
                    <th className="text-right font-medium py-0.5">残り</th>
                    <th className="text-right font-medium py-0.5">必要な月額</th>
                  </tr>
                </thead>
                <tbody>
                  {eventPlan.map((r, i) => (
                    <tr key={`${r.year}-${r.month}-${r.name}-${i}`}
                      className={r === binding ? "text-amber-300 font-semibold" : "text-slate-400"}>
                      <td className="py-0.5">{r.year}年{r.month}月</td>
                      <td className="py-0.5 truncate max-w-[140px]">{r.name}</td>
                      <td className={`text-right py-0.5 ${r.net < 0 ? "text-green-400" : ""}`}>
                        {r.net >= 0 ? `−${yen(r.net)}` : `+${yen(-r.net)}`}
                      </td>
                      <td className="text-right py-0.5">{yen(Math.max(0, r.cumulative))}</td>
                      <td className="text-right py-0.5">{yen(r.allocated)}</td>
                      <td className="text-right py-0.5">{r.monthsLeft}ヶ月</td>
                      <td className="text-right py-0.5">{yen(r.monthly)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-500 mt-1.5">
                一番きつい時点（色付き）に合わせておけば、他はすべて間に合います。
                月が未設定のイベントは、その年の{DEFAULT_MONTH}月に起きるものとして計算しています。
                金額は物価上昇{inflationRate}%を見込んだその年の価格です
                （一時金など金額が決まっているものは除く）
              </p>
            </div>
          )}
          <Row
            label="生活防衛資金の積立"
            hint={
              `目標 ${yen(bufferTarget)}（生活費${num(p.bufferMonths) || 6}ヶ月分）` +
              ` ／ 共同貯蓄 ${yen(hints?.savings ?? 0)}` +
              (earmarkedTotal > 0 ? ` − 取り置き ${yen(earmarkedTotal)} = 使える分 ${yen(freeSavings)}` : "") +
              (hints?.assetMonth ? `（${hints.assetMonth.slice(0, 4)}年${Number(hints.assetMonth.slice(5, 7))}月末の記録）` : "（資産管理に記録がありません）") +
              (bufferGap > 0 ? ` → ${yen(bufferGap)} 不足` : " → 到達済み")
            }
            value={bufferMonthly}
          />
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 pt-2.5">
          <span className="text-sm font-semibold text-slate-200">毎月の必要額</span>
          <span className="text-lg font-bold text-blue-400">{yen(needed)}</span>
        </div>
        <p className="text-[11px] text-slate-500">
          生活費は今の物価での金額です。物価が年{inflationRate}%上がるなら、
          1年後は約{yen(Math.round(living * (1 + infl)))}、5年後は約{yen(Math.round(living * Math.pow(1 + infl, 5)))}
          になります。金額を固定せず、年に一度は見直してください
        </p>

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

        {sim.firstShort === null ? (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
            <p className="text-sm text-green-300 font-semibold">この計画なら資金はショートしません</p>
            <p className="text-xs text-slate-400 mt-1">
              {eventYears}年間で残高が一番少なくなるのは {monthLabel(sim.minAt)}（{yen(sim.minBalance)}）です。
              {sim.minBalance < bufferTarget
                ? ` 生活防衛資金の目安 ${yen(bufferTarget)} を下回る時期があるので、余裕は大きくありません`
                : " 生活防衛資金の目安も保てています"}
            </p>
          </div>
        ) : (
          <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-3 space-y-1.5">
            <p className="text-sm text-red-300 font-semibold">
              {monthLabel(sim.firstShort)}に資金がショートします
            </p>
            <p className="text-xs text-slate-400">
              一番足りなくなるのは {monthLabel(sim.minAt)} で、{yen(-sim.minBalance)} 不足します。
              月額が必要額に届く前にイベントの支払いが来るためです
            </p>
            <p className="text-xs text-slate-300">
              間に合わせるには、どちらかにしてください
            </p>
            <ul className="text-xs text-slate-300 list-disc pl-5 space-y-0.5">
              <li>{stepMonths}ヶ月ごとの増額を <span className="font-semibold text-amber-200">{yen(requiredStep)}</span> にする（今の開始額 {yen(current)} のまま）</li>
              <li>増額せず、最初から <span className="font-semibold text-amber-200">毎月 {yen(requiredFlat)}</span> にする</li>
            </ul>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800">
                <th className="text-left py-1.5 px-2 font-medium">時期</th>
                <th className="text-right py-1.5 px-2 font-medium">拠出（世帯）</th>
                {members.map(m => (
                  <th key={m.id} className="text-right py-1.5 px-2 font-medium">{m.name}</th>
                ))}
                <th className="text-right py-1.5 px-2 font-medium">月末の残高</th>
                <th className="text-left py-1.5 px-2 font-medium">イベント</th>
              </tr>
            </thead>
            <tbody>
              {sim.rows.map((r, i) => {
                const parts = split(r.contribution)
                const short = r.balance < 0
                return (
                  <tr key={i} className={`border-b border-slate-800 last:border-0 ${short ? "bg-red-500/10" : ""}`}>
                    <td className="py-1.5 px-2 text-slate-300">{monthLabel(r.t)}</td>
                    <td className="py-1.5 px-2 text-right font-semibold text-slate-100">{yen(r.contribution)}</td>
                    {parts.map(sp => (
                      <td key={sp.member.id} className="py-1.5 px-2 text-right text-slate-400">{yen(sp.amount)}</td>
                    ))}
                    <td className={`py-1.5 px-2 text-right font-semibold ${short ? "text-red-400" : "text-slate-200"}`}>
                      {r.balance < 0 ? `−${yen(-r.balance)}` : yen(r.balance)}
                    </td>
                    <td className="py-1.5 px-2 text-slate-500 truncate max-w-[180px]">{r.events.join("・")}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          共同口座の残高を月ごとに追っています。スタートは今の共同貯蓄 {yen(startBalance)}、
          毎月「拠出 − 生活費（物価上昇{inflationRate}%込み）± イベント」で増減します。
          残高がマイナスになる月が1度でもあれば、その時点で支払いができません
        </p>
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
