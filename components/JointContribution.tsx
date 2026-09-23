"use client"

import { useMemo, useState } from "react"
import { SaveButton } from "@/components/SaveButton"
import { toHalfWidth } from "@/lib/num"
import { MonthSelect } from "@/components/MonthSelect"

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
  stepStart: string                 // 最初に増やす年月（YYYY-MM。空なら今月から間隔ぶん後）
  eventMode: "flat" | "ramp"        // イベント積立を定額にするか、段階的に増やすか
  includeBuffer: boolean            // 生活防衛資金を計算に含めるか
  depositDay: string                // 毎月、共同口座にお金を入れる日（給料日あたり）
  sameAccount: boolean              // 生活費と貯蓄を同じ口座で管理しているか
  reviewMonth: string               // 生活費の拠出額を見直す月（年1回、物価上昇分を上乗せ）
  eventCurrent: string              // 段階的に増やす場合の、今月のイベント積立額
  /** 保存した時点の「月末残高の見込み」。実績と比べて計画からのズレを見る */
  baseline?: { savedAt: string; values: Record<string, number> }
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
  stepStart: "",
  eventMode: "flat",
  includeBuffer: true,
  depositDay: "25",
  sameAccount: true,
  reviewMonth: "4",
  eventCurrent: "",
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

export function JointContribution({ members, events, hints, inflationRate, assetHistory, saved, scope, onSaved }: {
  members: Member[]
  events: LifeEvent[]
  /** 物価上昇率（%）。イベント金額は今の物価で登録されているので将来価値に直す */
  inflationRate: number
  /** 資産管理に記録した月末残高（新しい順） */
  assetHistory: { month: string; savings: number; investment: number }[]
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
      eventCurrent: money(base.eventCurrent ?? ""),
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

  // ════════════════════════════════════════════════════════
  // A. 生活のための分（毎月の生活費＋生活防衛資金の積立）
  //    使って消えるお金と、もしものときの備え。イベントとは混ぜない。
  // ════════════════════════════════════════════════════════
  // ── 入金日による補正 ──
  // 25日に入金するなら、月末の残高には「これから1ヶ月で使う生活費」の大半がまだ残っている。
  // それを貯蓄として数えると、防衛資金もイベント資金も多く見積もってしまうので差し引く。
  const depositDay = Math.min(31, Math.max(1, num(p.depositDay) || 25))
  // 貯蓄を別口座で分けて記録しているなら、月末残高に生活費は混ざらないので補正しない
  const carryFrac = p.sameAccount === false ? 0 : Math.min(1, depositDay / 30)
  const operatingCash = Math.round(living * carryFrac)
  const recordedSavings = hints?.savings ?? 0
  const netSavings = Math.max(0, recordedSavings - operatingCash)

  // 防衛資金を外した場合は目標0として扱う（余った貯蓄はイベントに回せる）
  const includeBuffer = p.includeBuffer !== false
  const bufferTarget = includeBuffer ? living * (p.bufferMonths === "" ? 6 : num(p.bufferMonths)) : 0
  // 取り置き分は使い道が決まっているので、防衛資金としては数えない
  const freeSavings = Math.max(0, netSavings - earmarkedTotal)
  const bufferGap = Math.max(0, bufferTarget - freeSavings)
  const bufferSpread = Math.max(1, num(p.bufferSpreadMonths) || 24)
  const bufferMonthly = Math.round(bufferGap / bufferSpread)
  const livingPartNow = living + bufferMonthly

  // ── 2人でどう分けるか ─────────────────────────────────
  const incomeTotal = members.reduce((s, m) => s + num(p.incomes[m.id] ?? ""), 0)
  const customTotal = members.reduce((s, m) => s + num(p.shares[m.id] ?? ""), 0)

  /** 世帯合計 total を、選んだ方式で各メンバーに割り振る */
  function split(total: number): { member: Member; amount: number; ratio: number }[] {
    if (members.length === 0) return []
    if (p.method === "custom" && customTotal > 0) {
      // 金額指定は「比率」として使い、必要額に合わせて按分する
      return members.map(m => {
        const r = num(p.shares[m.id] ?? "") / customTotal
        return { member: m, amount: Math.round(total * r), ratio: r }
      })
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

  // ════════════════════════════════════════════════════════
  // B. ライフイベントのための分
  //    イベント用のお金の残高を月ごとに追い、支払いに間に合うかを見る。
  //    スタートは「取り置き」＋「防衛資金を超えて余っている貯蓄」。
  // ════════════════════════════════════════════════════════
  const stepAmount = num(p.stepAmount)
  const stepMonths = Math.max(1, num(p.stepMonths) || 6)
  // 最初に増やす月（今月から何ヶ月後か）。昇給月や賞与月に合わせられるようにする
  const firstStepT = (() => {
    if (!p.stepStart) return stepMonths
    const [y, m] = p.stepStart.split("-").map(Number)
    if (!y || !m) return stepMonths
    return Math.max(0, (y - new Date().getFullYear()) * 12 + (m - (new Date().getMonth() + 1)))
  })()
  /** 今月から t ヶ月後の時点で、何回増額済みか */
  const stepsAt = (t: number) => (t < firstStepT ? 0 : 1 + Math.floor((t - firstStepT) / stepMonths))
  const horizon = eventYears * 12
  const surplusSavings = Math.max(0, freeSavings - bufferTarget)
  const eventStartBalance = earmarkedTotal + surplusSavings

  // 月ごとのイベント収支（今からの月数 → 金額。支出はマイナス）
  const eventByMonth = useMemo(() => {
    const m = new Map<number, { amount: number; out: number; in: number; names: string[] }>()
    for (const e of events) {
      for (let i = 0; i < Math.max(1, e.repeat_years); i++) {
        const y = e.year + i
        const mo = e.month ?? DEFAULT_MONTH
        const t = (y - thisYear) * 12 + (mo - thisMonth)
        if (t < 0 || t >= horizon) continue
        const v = atYear(e.amount, y, e.inflate)
        const cur = m.get(t) ?? { amount: 0, out: 0, in: 0, names: [] }
        if (e.kind === "expense") { cur.amount -= v; cur.out += v } else { cur.amount += v; cur.in += v }
        cur.names.push(e.name)
        m.set(t, cur)
      }
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, horizon, thisYear, thisMonth, infl])

  /** イベント用の残高推移。start から、step を stepMonths ごとに上乗せする */
  function simulateEvent(start: number, step: number) {
    let balance = eventStartBalance
    let minBalance = balance
    let minAt = 0
    let firstShort: number | null = null
    const byT: { t: number; contribution: number; balance: number; events: string[] }[] = []
    for (let t = 0; t < horizon; t++) {
      const contribution = start + step * stepsAt(t)
      const ev = eventByMonth.get(t)
      // 入金は毎月の入金日（25日など）。イベントの支払いがそれより前に来ても
      // 払えるかを見るため、判定は「その月の入金前」の残高で行う（受取も入金後に扱う）
      const beforeDeposit = balance - (ev?.out ?? 0)
      if (beforeDeposit < minBalance) { minBalance = beforeDeposit; minAt = t }
      if (beforeDeposit < 0 && firstShort === null) firstShort = t
      balance = beforeDeposit + contribution + (ev?.in ?? 0)
      byT.push({ t, contribution, balance, events: ev?.names ?? [] })
    }
    return { minBalance, minAt, firstShort, byT }
  }

  /** 残高が一度も0を下回らない最小の値を二分探索で求める */
  function minimalToAvoidShort(solve: (x: number) => number): number {
    if (solve(0) >= 0) return 0
    let lo = 0, hi = 2_000_000
    if (solve(hi) < 0) return hi
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2
      if (solve(mid) >= 0) hi = mid; else lo = mid
    }
    return Math.ceil(hi / 1000) * 1000
  }

  // 定額で積む場合の最小額
  const requiredFlat = useMemo(
    () => minimalToAvoidShort(x => simulateEvent(x, 0).minBalance),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eventByMonth, eventStartBalance, horizon],
  )
  const eventCurrent = num(p.eventCurrent)
  // 段階的に増やす場合、今の額から始めて1回いくら増やせば間に合うか
  const requiredStep = useMemo(
    () => minimalToAvoidShort(x => simulateEvent(eventCurrent, x).minBalance),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eventCurrent, stepMonths, firstStepT, eventByMonth, eventStartBalance, horizon],
  )

  // 採用するプラン。段階的の場合は、入力した増額で足りなければ必要な増額に引き上げる
  const rampStep = Math.max(stepAmount, requiredStep)
  const eventSim = useMemo(
    () => (p.eventMode === "ramp" ? simulateEvent(eventCurrent, stepAmount) : simulateEvent(requiredFlat, 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.eventMode, eventCurrent, stepAmount, requiredFlat, stepMonths, firstStepT, eventByMonth, eventStartBalance, horizon],
  )
  const planSim = useMemo(
    () => (p.eventMode === "ramp" ? simulateEvent(eventCurrent, rampStep) : eventSim),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.eventMode, eventCurrent, rampStep, eventSim],
  )
  const eventPartAt = (t: number) => planSim.byT[t]?.contribution ?? 0
  const eventPartNow = eventPartAt(0)

  // ════════════════════════════════════════════════════════
  // C. 合計：2人で出し合う額（月ごと）
  // ════════════════════════════════════════════════════════
  // 生活費の拠出額。実際には毎月少しずつ変えたりしないので、
  // 年に1回の見直し月にだけ物価上昇分を上乗せし、1,000円単位に切り上げる。
  const reviewMonth = Math.min(12, Math.max(1, num(p.reviewMonth) || 4))
  const reviewsBy = (t: number) => {
    let n = 0
    for (let k = 1; k <= t; k++) if (((thisMonth - 1 + k) % 12) + 1 === reviewMonth) n++
    return n
  }
  const livingAt = (t: number) => {
    const n = reviewsBy(t)
    if (n === 0) return living
    return Math.ceil((living * Math.pow(1 + infl, n)) / 1000) * 1000
  }
  /** 実際に出ていく生活費。物価は毎月少しずつ上がる */
  const spendAt = (t: number) => Math.round(living * Math.pow(1 + infl, t / 12))
  /** 出し合う生活費と実際の支出の差の累計（t ヶ月後まで）。マイナスなら口座からの持ち出し */
  const livingDriftUpTo = (t: number) => {
    let d = 0
    for (let k = 0; k <= t; k++) d += livingAt(k) - spendAt(k)
    return d
  }
  // 見直しの直前が一番ずれるので、1年分の累計と最も持ち出しが大きい時点を出しておく
  const drift12 = livingDriftUpTo(11)
  const worstDrift = (() => {
    let worst = 0, at = 0
    for (let t = 0; t < 60; t++) { const d = livingDriftUpTo(t); if (d < worst) { worst = d; at = t } }
    return { amount: worst, at }
  })()
  const bufferAt = (t: number) => (t < bufferSpread ? bufferMonthly : 0)
  const totalAt = (t: number) => livingAt(t) + bufferAt(t) + eventPartAt(t)
  const totalNow = totalAt(0)
  const needed = totalNow

  // 表に出す月。見たい粒度で切り替えられるようにする
  //   changes … 金額が変わる月（増額・防衛資金の積立終了）とイベントのある月
  //   monthly … 毎月
  //   yearly  … 毎年、今月と同じ月
  const [tableView, setTableView] = useState<"changes" | "monthly" | "yearly">("changes")
  const checkpoints = useMemo(() => {
    const ts = new Set<number>([0])
    for (let t = 1; t < horizon; t++) {
      if (tableView === "monthly") { ts.add(t); continue }
      if (tableView === "yearly") { if (t % 12 === 0) ts.add(t); continue }
      if (planSim.byT[t]?.contribution !== planSim.byT[t - 1]?.contribution) ts.add(t)
      if (livingAt(t) !== livingAt(t - 1)) ts.add(t)   // 生活費の見直し月
      if (includeBuffer && bufferGap > 0 && t === bufferSpread) ts.add(t)
      if (eventByMonth.has(t)) ts.add(t)
    }
    return [...ts].sort((a, b) => a - b).slice(0, tableView === "monthly" ? 60 : 30)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planSim, horizon, bufferSpread, bufferGap, includeBuffer, eventByMonth, tableView, living, reviewMonth, infl])

  /**
   * 共同口座の月末残高の見込み。
   * 生活費は入れた分がそのまま出ていくので残高には効かない。
   * 残るのは防衛資金の積立とイベント用の積立で、イベントの月に支払い（受取）が起きる。
   */
  const projectedBalanceAt = useMemo(() => {
    const out: number[] = []
    let bal = netSavings
    for (let t = 0; t < horizon; t++) {
      // 生活費は「出し合う額 − 実際の支出」の差だけが残高に残る
      bal += bufferAt(t) + eventPartAt(t) + (eventByMonth.get(t)?.amount ?? 0) + (livingAt(t) - spendAt(t))
      // 月末に記録する残高には、入金日から月末までにまだ使っていない生活費も含まれる
      out.push(Math.round(bal + livingAt(t) * carryFrac))
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netSavings, horizon, bufferMonthly, bufferSpread, planSim, eventByMonth, carryFrac])

  const monthKey = (t: number) => {
    const total = (thisYear * 12 + (thisMonth - 1)) + t
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`
  }
  const monthLabel = (t: number) => {
    const total = (thisYear * 12 + (thisMonth - 1)) + t
    return `${Math.floor(total / 12)}年${(total % 12) + 1}月`
  }

  async function save() {
    const res = await fetch("/api/lifeplan/tools", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "contribution",
        card_type: scope,
        params: {
          ...p,
          // 今の計画での月末残高の見込み（3年分）。月末に記録した実績と比べる基準になる
          baseline: {
            savedAt: monthKey(0),
            values: Object.fromEntries(projectedBalanceAt.slice(0, 36).map((v, t) => [monthKey(t), v])),
          },
        },
      }),
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
      {/* ════ A. 生活のための分 ════ */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100">① 生活のための分</h3>
          <p className="text-xs text-slate-500 mt-0.5">毎月の生活費と、もしものときの生活防衛資金</p>
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
          <div className="bg-slate-800/40 rounded-lg px-2.5 py-2 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300 flex-1">毎月、共同口座に入れる日</span>
              <div className="w-16 shrink-0">
                <input className={input} inputMode="numeric" value={p.depositDay}
                  onChange={e => set("depositDay", toHalfWidth(e.target.value).replace(/[^0-9]/g, ""))} />
              </div>
              <span className="text-xs text-slate-400">日</span>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-slate-400">
              <input type="checkbox" checked={p.sameAccount !== false}
                onChange={e => set("sameAccount", e.target.checked)} />
              生活費と貯蓄を同じ口座で管理している（月末残高に、これから使う生活費も含まれる）
            </label>
            {p.sameAccount !== false && (
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {hints?.assetMonth ? `${hints.assetMonth.slice(0, 4)}年${Number(hints.assetMonth.slice(5, 7))}月末` : "月末"}の残高
              {" "}{yen(recordedSavings)} には、{depositDay}日に入れてまだ使っていない生活費（約{yen(operatingCash)}）が含まれます。
              貯蓄としてはこれを除いた <span className="text-slate-300">{yen(netSavings)}</span> で計算しています。
              イベントの支払いは、その月の入金より前に来ても払えるかで判定します
            </p>
            )}
          </div>

          <div className="flex items-center gap-2 bg-slate-800/40 rounded-lg px-2.5 py-2">
            <span className="text-xs text-slate-300 flex-1">
              生活費の見直し月
              <span className="block text-[11px] text-slate-500">年に1回、物価上昇ぶんを上乗せする月（昇給月に合わせるのがおすすめ）</span>
            </span>
            <div className="w-16 shrink-0">
              <input className={input} inputMode="numeric" value={p.reviewMonth}
                onChange={e => set("reviewMonth", toHalfWidth(e.target.value).replace(/[^0-9]/g, ""))} />
            </div>
            <span className="text-xs text-slate-400">月</span>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={includeBuffer}
              onChange={e => set("includeBuffer", e.target.checked)} />
            生活防衛資金の積立を計算に含める
          </label>
          {includeBuffer && (
          <Row
            label="生活防衛資金の積立"
            hint={
              `目標 ${yen(bufferTarget)}（生活費${p.bufferMonths === "" ? 6 : num(p.bufferMonths)}ヶ月分）` +
              ` ／ 共同貯蓄 ${yen(netSavings)}` +
              (earmarkedTotal > 0 ? ` − 取り置き ${yen(earmarkedTotal)} = 使える分 ${yen(freeSavings)}` : "") +
              (bufferGap > 0 ? ` → ${yen(bufferGap)} 不足を${bufferSpread}ヶ月で貯める` : " → 到達済み")
            }
            value={bufferMonthly}
          />
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 pt-2.5">
          <span className="text-sm font-semibold text-slate-200">生活のための分（今月）</span>
          <span className="text-lg font-bold text-sky-300">{yen(livingPartNow)}</span>
        </div>
        <p className="text-[11px] text-slate-500">
          生活費は毎年{reviewMonth}月に物価上昇（年{inflationRate}%）ぶんを上乗せして見直す前提です。
          1年後は{yen(livingAt(12))}、5年後は{yen(livingAt(60))}になります。
          一方で実際の支出は毎月少しずつ上がるので、見直し前の月は出し合う額より多く出ていきます
          （この1年の差の累計 {drift12 >= 0 ? "+" : "−"}{yen(Math.abs(drift12))}
          {worstDrift.amount < 0 ? `、最大で${monthLabel(worstDrift.at)}に${yen(-worstDrift.amount)}の持ち出し` : ""}）。
          {includeBuffer ? `防衛資金の積立は${bufferGap > 0 ? `${monthLabel(bufferSpread - 1)}まで` : "不要"}です` : "防衛資金は計算から外しています"}
        </p>

        <details className="text-xs">
          <summary className="text-slate-500 cursor-pointer">防衛資金の前提を変える</summary>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Field label="防衛資金（生活費の何ヶ月分）">
              <input className={input} inputMode="numeric" value={p.bufferMonths}
                onChange={e => set("bufferMonths", toHalfWidth(e.target.value).replace(/[^0-9]/g, ""))} />
            </Field>
            <Field label="何ヶ月で貯める">
              <input className={input} inputMode="numeric" value={p.bufferSpreadMonths}
                onChange={e => set("bufferSpreadMonths", toHalfWidth(e.target.value).replace(/[^0-9]/g, ""))} />
            </Field>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            2人とも働けなくなっても暮らせる期間の生活費です。共働きなら3〜6ヶ月分、
            収入が1人に偏っているなら6〜12ヶ月分が目安になります
          </p>
        </details>
      </div>

      {/* ════ B. ライフイベントのための分 ════ */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100">② ライフイベントのための分</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {eventYears}年以内の予定（支出 {yen(eventExpense)}{eventIncome > 0 ? ` − 戻り ${yen(eventIncome)}` : ""}）に、
            支払いの時点で間に合うように積み立てます
          </p>
        </div>

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
              <p className={`text-[11px] ${earmarkedTotal > netSavings ? "text-red-400" : "text-slate-500"}`}>
                取り置きの合計 {yen(earmarkedTotal)}
                {earmarkedTotal > netSavings
                  ? `（使える共同貯蓄 ${yen(netSavings)} を超えています）`
                  : `／ 使える共同貯蓄 ${yen(netSavings)}`}
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

        <div className="flex rounded-xl bg-slate-800 p-1 gap-1">
          {([["flat", "毎月同じ額で積む"], ["ramp", "少しずつ増やす"]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => set("eventMode", k)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                p.eventMode === k ? "bg-blue-600 text-white" : "text-slate-400"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {p.eventMode === "flat" ? (
          <p className="text-xs text-slate-400">
            毎月 <span className="text-slate-100 font-semibold">{yen(requiredFlat)}</span> ずつ積めば、どのイベントの支払いにも間に合います
            （スタート時点のイベント用資金 {yen(eventStartBalance)}）
          </p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <Field label="今月の積立額">
                <input className={input} inputMode="numeric" placeholder="0"
                  value={p.eventCurrent} onChange={e => set("eventCurrent", money(e.target.value))} />
              </Field>
              <Field label="1回の増額">
                <input className={input} inputMode="numeric" value={p.stepAmount}
                  onChange={e => set("stepAmount", money(e.target.value))} />
              </Field>
              <Field label="増やす間隔（ヶ月）">
                <input className={input} inputMode="numeric" value={p.stepMonths}
                  onChange={e => set("stepMonths", toHalfWidth(e.target.value).replace(/[^0-9]/g, ""))} />
              </Field>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-400">最初に増やす月</span>
              <MonthSelect value={p.stepStart || monthKey(firstStepT)}
                onChange={v => set("stepStart", v)} yearsBack={0} yearsAhead={10} />
              <span className="text-[11px] text-slate-500">以降は{stepMonths}ヶ月ごと。昇給月や賞与月に合わせると続けやすくなります</span>
            </div>
            {eventSim.firstShort !== null ? (
              <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-2.5 text-xs space-y-1">
                <p className="text-red-300 font-semibold">
                  入力した増額（{yen(stepAmount)}）だと {monthLabel(eventSim.firstShort)} に不足します
                </p>
                <p className="text-slate-300">
                  今月 {yen(eventCurrent)} から始めるなら、1回あたり <span className="font-semibold text-amber-200">{yen(requiredStep)}</span> の増額が必要です。
                  下の合計はこの金額で計算しています
                </p>
                <button type="button" onClick={() => set("stepAmount", money(String(requiredStep)))}
                  className="text-[11px] text-amber-200 underline">この増額にする</button>
              </div>
            ) : (
              <p className="text-xs text-green-300">この増やし方なら、どのイベントの支払いにも間に合います</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-800 pt-2.5">
          <span className="text-sm font-semibold text-slate-200">ライフイベントのための分（今月）</span>
          <span className="text-lg font-bold text-violet-300">{yen(eventPartNow)}</span>
        </div>

        <details className="text-xs">
          <summary className="text-slate-500 cursor-pointer">イベントの期間を変える</summary>
          <div className="mt-2 w-40">
            <Field label="何年先までの予定を見るか">
              <input className={input} inputMode="numeric" value={p.eventYears}
                onChange={e => set("eventYears", toHalfWidth(e.target.value).replace(/[^0-9]/g, ""))} />
            </Field>
          </div>
        </details>
      </div>

      {/* ════ C. 合計と分担 ════ */}
      <div className="bg-slate-900 border border-blue-500/40 rounded-xl p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-bold text-slate-100">③ 2人で出し合う額（今月）</h3>
          <span className="text-2xl font-bold text-blue-300">{yen(totalNow)}</span>
        </div>
        <p className="text-xs text-slate-400">
          生活 {yen(livingPartNow)} ＋ ライフイベント {yen(eventPartNow)}
        </p>

        <div className="flex rounded-xl bg-slate-800 p-1 gap-1">
          {([["equal", "折半"], ["income", "収入に比例"], ["custom", "比率を決める"]] as const).map(([k, label]) => (
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
            : "2人の割合を金額で決めます（例：6万と4万なら6:4）。必要額はこの比率で分けます"}
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
            <p className="text-xs text-slate-400">割合の目安（金額で入力）</p>
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

        <div className="border border-blue-500/30 bg-blue-500/5 rounded-lg p-3 space-y-1">
          {split(totalNow).map(sp => (
            <div key={sp.member.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-300">
                {sp.member.name}
                <span className="text-[10px] text-slate-500 ml-1.5">{Math.round(sp.ratio * 100)}%</span>
              </span>
              <span className="font-bold text-slate-100">{yen(sp.amount)}</span>
            </div>
          ))}
        </div>

        <div className="flex rounded-lg bg-slate-800 p-0.5 text-[11px] w-fit">
          {([["changes", "金額が変わる月"], ["monthly", "毎月"], ["yearly", "毎年"]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTableView(k)}
              className={`px-2.5 py-1 rounded-md transition-colors ${tableView === k ? "bg-blue-600 text-white" : "text-slate-400"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800">
                <th className="text-left py-1.5 px-2 font-medium">時期</th>
                <th className="text-right py-1.5 px-2 font-medium">生活費（出し合う）</th>
                <th className="text-right py-1.5 px-2 font-medium">生活費（実際の支出）</th>
                <th className="text-right py-1.5 px-2 font-medium">防衛資金</th>
                <th className="text-right py-1.5 px-2 font-medium">イベント</th>
                <th className="text-right py-1.5 px-2 font-medium">合計</th>
                {members.map(m => (
                  <th key={m.id} className="text-right py-1.5 px-2 font-medium">{m.name}</th>
                ))}
                <th className="text-right py-1.5 px-2 font-medium">イベント用残高</th>
                <th className="text-left py-1.5 px-2 font-medium">この月のイベント</th>
              </tr>
            </thead>
            <tbody>
              {checkpoints.map(t => {
                const total = totalAt(t)
                const bal = planSim.byT[t]?.balance ?? 0
                return (
                  <tr key={t} className="border-b border-slate-800 last:border-0">
                    <td className="py-1.5 px-2 text-slate-300">{monthLabel(t)}</td>
                    <td className="py-1.5 px-2 text-right text-slate-400">{yen(livingAt(t))}</td>
                    <td className={`py-1.5 px-2 text-right ${spendAt(t) > livingAt(t) ? "text-amber-400" : "text-slate-500"}`}>{yen(spendAt(t))}</td>
                    <td className="py-1.5 px-2 text-right text-slate-400">{bufferAt(t) > 0 ? yen(bufferAt(t)) : "—"}</td>
                    <td className="py-1.5 px-2 text-right text-slate-400">{yen(eventPartAt(t))}</td>
                    <td className="py-1.5 px-2 text-right font-semibold text-slate-100">{yen(total)}</td>
                    {split(total).map(sp => (
                      <td key={sp.member.id} className="py-1.5 px-2 text-right text-slate-300">{yen(sp.amount)}</td>
                    ))}
                    <td className={`py-1.5 px-2 text-right ${bal < 0 ? "text-red-400" : "text-slate-400"}`}>
                      {bal < 0 ? `−${yen(-bal)}` : yen(bal)}
                    </td>
                    <td className="py-1.5 px-2 text-slate-500 truncate max-w-[160px]">
                      {(eventByMonth.get(t)?.names ?? []).join("・")}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          {tableView === "changes"
            ? "今月と、金額が変わる月（生活費の見直し・イベント積立の増額・防衛資金の積立終了）、イベントのある月を並べています。"
            : tableView === "monthly" ? "毎月の推移です（最大5年分）。" : "1年ごとの推移です。"}
          生活費は物価上昇{inflationRate}%込み。イベント用残高は、取り置きと積立からイベントの支払いを差し引いた残りです
        </p>
      </div>

      <PlanVsActual
        baseline={p.baseline}
        history={assetHistory}
        yen={yen}
        monthsToNextEvent={(() => {
          const next = [...eventByMonth.entries()].filter(([, v]) => v.amount < 0).map(([t]) => t).sort((a, b) => a - b)[0]
          return next === undefined ? null : { months: Math.max(1, next), label: monthLabel(next), names: eventByMonth.get(next)?.names ?? [] }
        })()}
      />

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

/**
 * 計画と実績の比較。
 * 保存したときの「月末残高の見込み」と、資産管理に記録した月末残高を並べる。
 * 利息や臨時の出入りで実際の残高はずれていくので、そのズレを毎月確認して計画を合わせる。
 */
function PlanVsActual({ baseline, history, yen, monthsToNextEvent }: {
  baseline?: { savedAt: string; values: Record<string, number> }
  history: { month: string; savings: number }[]
  yen: (n: number) => string
  monthsToNextEvent: { months: number; label: string; names: string[] } | null
}) {
  const rows = (baseline ? history : [])
    .filter(h => baseline!.values[h.month] !== undefined)
    .slice(0, 6)
    .map(h => ({ month: h.month, plan: baseline!.values[h.month], actual: h.savings, diff: h.savings - baseline!.values[h.month] }))

  const latest = rows[0]
  const label = (m: string) => `${m.slice(0, 4)}年${Number(m.slice(5, 7))}月末`

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
      <h3 className="text-sm font-bold text-slate-100">計画と実績のズレ</h3>
      {!baseline ? (
        <p className="text-xs text-slate-400">
          この画面で「保存する」を押すと、その時点の計画での月末残高の見込みが記録されます。
          あとは毎月末に資産管理で共同の残高を入れると、計画より多いか少ないかがここに出ます
        </p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-400">
          {label(baseline.savedAt)}からの計画を記録済みです。資産管理で共同の月末残高を入れると、ここで比較できます
        </p>
      ) : (
        <>
          <p className={`text-sm font-semibold ${latest.diff >= 0 ? "text-green-300" : "text-amber-300"}`}>
            {label(latest.month)}時点で、計画より {yen(Math.abs(latest.diff))} {latest.diff >= 0 ? "多い" : "少ない"}です
          </p>
          <p className="text-xs text-slate-400">
            {latest.diff >= 0
              ? "利息や支出の節約で上振れしています。このまま積み増しておくと次のイベントに余裕ができます"
              : monthsToNextEvent
                ? `次の支払い（${monthsToNextEvent.label}・${monthsToNextEvent.names.join("・")}）までに取り戻すなら、あと${monthsToNextEvent.months}ヶ月、毎月 ${yen(Math.ceil(-latest.diff / monthsToNextEvent.months / 1000) * 1000)} の上乗せが目安です`
                : "不足分を上乗せするか、計画を見直してください"}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800">
                  <th className="text-left py-1 px-2 font-medium">月末</th>
                  <th className="text-right py-1 px-2 font-medium">計画</th>
                  <th className="text-right py-1 px-2 font-medium">実績</th>
                  <th className="text-right py-1 px-2 font-medium">差</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.month} className="border-b border-slate-800 last:border-0">
                    <td className="py-1 px-2 text-slate-300">{label(r.month)}</td>
                    <td className="py-1 px-2 text-right text-slate-400">{yen(r.plan)}</td>
                    <td className="py-1 px-2 text-right text-slate-200">{yen(r.actual)}</td>
                    <td className={`py-1 px-2 text-right font-semibold ${r.diff >= 0 ? "text-green-400" : "text-amber-400"}`}>
                      {r.diff >= 0 ? "+" : "−"}{yen(Math.abs(r.diff))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500">
            計画を立て直したいときは、もう一度「保存する」を押すと、その時点を新しい基準にします
          </p>
        </>
      )}
    </div>
  )
}
