"use client"

import { useMemo, useState } from "react"
import { SaveButton } from "@/components/SaveButton"
import { toHalfWidth } from "@/lib/num"

/**
 * 老後資金のギャップ分析。
 *
 * 「老後にいくら必要か」「今のペースでいくら用意できるか」「差がいくらか」
 * 「埋めるには毎月あといくら積めばいいか」までを一続きで出す。
 *
 * 金額はすべて「今の物価での金額（実質）」で扱い、運用利回りからは物価上昇率を引いた
 * 実質利回りを使う。将来の名目額で出すと数字が大きくなるだけで判断しづらいため。
 */

interface Member { id: number; name: string; birth_year: number; relation: string }
interface Params {
  retireAge: string        // 退職する年齢
  lifeAge: string          // 何歳まで生きる前提か
  pensionStartAge: string  // 年金の受給開始年齢
  livingSource: "budget" | "actual" | "manual"
  livingManual: string     // 老後の生活費（月・手入力）
  livingRate: string       // 現役時の何%で暮らすか（自動のとき）
  extra: string            // ゆとり費（旅行・趣味など、月額）
  pension: string          // 年金の見込み（月・世帯合計）
  retireBonus: string      // 退職金（一時金・世帯合計）
  monthlySaving: string    // 今の積立額（月・世帯合計）
  careCost: string         // 介護・医療などの一時費用
}

const DEFAULTS: Params = {
  retireAge: "65",
  lifeAge: "90",
  pensionStartAge: "65",
  livingSource: "budget",
  livingManual: "",
  livingRate: "70",
  extra: "0",
  pension: "",
  retireBonus: "0",
  monthlySaving: "",
  careCost: "5000000",
}

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`
const man = (n: number) => `${Math.round(n / 10000).toLocaleString("ja-JP")}万円`
const money = (v: string) => {
  const raw = toHalfWidth(v ?? "").replace(/[^0-9]/g, "")
  return raw === "" ? "" : Number(raw).toLocaleString("ja-JP")
}
const num = (v: string) => {
  const n = Number(toHalfWidth(v ?? "").replace(/,/g, ""))
  return isNaN(n) ? 0 : n
}

/** 毎月 m 円を年利 r で n 年積んだときの将来価値（年金終価） */
function futureValueOfMonthly(m: number, r: number, years: number): number {
  const months = years * 12
  const i = r / 12
  if (months <= 0) return 0
  if (Math.abs(i) < 1e-9) return m * months
  return m * ((Math.pow(1 + i, months) - 1) / i)
}

/** 目標額 target を n 年で作るのに必要な毎月の積立額 */
function requiredMonthly(target: number, r: number, years: number): number {
  const months = years * 12
  const i = r / 12
  if (months <= 0) return target
  if (Math.abs(i) < 1e-9) return target / months
  return target / ((Math.pow(1 + i, months) - 1) / i)
}

export function RetirementGap({ members, settings, hints, payslipHints, saved, scope, onSaved }: {
  members: Member[]
  settings: { return_rate: number; inflation_rate: number }
  hints: { annualExpense: number; savings: number; investment: number; budgetExpenseAnnual?: number; nisaAnnual?: number } | null
  payslipHints: { standardMonthly: number; annualEquivalent: number } | null
  saved: Params | null
  scope: string
  onSaved: () => void
}) {
  const [p, setP] = useState<Params>(() => {
    const base = { ...DEFAULTS, ...(saved ?? {}) }
    return {
      ...base,
      livingManual: money(base.livingManual),
      extra: money(base.extra),
      pension: money(base.pension),
      retireBonus: money(base.retireBonus),
      monthlySaving: money(base.monthlySaving),
      careCost: money(base.careCost),
    }
  })
  const set = <K extends keyof Params>(k: K, v: Params[K]) => setP(prev => ({ ...prev, [k]: v }))
  const [openAssumptions, setOpenAssumptions] = useState(false)

  const thisYear = new Date().getFullYear()
  // 基準にする人は本人。いなければ最年長（=先に退職を迎える人）に合わせる
  const main = members.find(m => m.relation === "本人")
    ?? [...members].sort((a, b) => a.birth_year - b.birth_year)[0]
  const currentAge = main ? thisYear - main.birth_year : 40

  const retireAge = num(p.retireAge) || 65
  const lifeAge = num(p.lifeAge) || 90
  const pensionStartAge = num(p.pensionStartAge) || 65
  const yearsToRetire = Math.max(0, retireAge - currentAge)
  const retireYears = Math.max(0, lifeAge - retireAge)

  // ── いま使っている生活費 ──────────────────────────────
  const budgetMonthly = Math.round((hints?.budgetExpenseAnnual ?? 0) / 12)
  const actualMonthly = Math.round((hints?.annualExpense ?? 0) / 12)
  const baseMonthly = p.livingSource === "actual" ? actualMonthly : (budgetMonthly || actualMonthly)
  const livingRate = (num(p.livingRate) || 70) / 100
  const retireLiving = p.livingSource === "manual"
    ? num(p.livingManual)
    : Math.round(baseMonthly * livingRate)
  const monthlyNeed = retireLiving + num(p.extra)

  // ── 年金 ─────────────────────────────────────────────
  // 未入力なら給与明細の標準報酬月額から概算する（老齢基礎＋老齢厚生の本人分）
  const pensionEstimate = useMemo(() => {
    if (!payslipHints?.standardMonthly) return 0
    const basic = 816000 // 老齢基礎年金の満額（年額）
    const kouseiMonths = Math.max(0, (retireAge - 22)) * 12
    const kousei = payslipHints.standardMonthly * (5.481 / 1000) * kouseiMonths
    return Math.round((basic + kousei) / 12)
  }, [payslipHints, retireAge])
  const pensionMonthly = p.pension ? num(p.pension) : pensionEstimate
  // 受給開始が退職より遅いと、その間は資産だけで暮らすことになる
  const gapYears = Math.max(0, pensionStartAge - retireAge)

  // ── 必要額と準備額 ───────────────────────────────────
  const totalSpend = monthlyNeed * 12 * retireYears + num(p.careCost)
  const totalPension = pensionMonthly * 12 * Math.max(0, lifeAge - pensionStartAge)
  const needed = Math.max(0, totalSpend - totalPension)

  // 実質利回り（名目利回り − 物価上昇率）。今の物価での金額で計算しているため
  const realRate = Math.max(0, (settings.return_rate - settings.inflation_rate) / 100)
  const currentAssets = (hints?.savings ?? 0) + (hints?.investment ?? 0)
  const nisaMonthly = Math.round((hints?.nisaAnnual ?? 0) / 12)
  const saving = p.monthlySaving ? num(p.monthlySaving) : nisaMonthly

  const assetsAtRetire =
    currentAssets * Math.pow(1 + realRate, yearsToRetire)
    + futureValueOfMonthly(saving, realRate, yearsToRetire)
    + num(p.retireBonus)

  const gap = needed - assetsAtRetire
  const extraMonthly = gap > 0 ? requiredMonthly(gap, realRate, yearsToRetire) : 0

  async function save() {
    const res = await fetch("/api/lifeplan/tools", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "retirement", params: p, card_type: scope }),
    })
    if (!res.ok) throw new Error("保存に失敗しました")
    onSaved()
  }

  const input = "w-full bg-slate-900 text-slate-100 border border-slate-700 rounded-lg px-2 py-2 text-sm text-right"

  return (
    <div className="space-y-3">
      {/* 結論 */}
      <div className={`rounded-xl border p-4 ${
        gap > 0 ? "bg-amber-500/10 border-amber-500/40" : "bg-green-500/10 border-green-500/40"
      }`}>
        <p className="text-xs text-slate-400">
          {currentAge}歳 → {retireAge}歳で退職、{lifeAge}歳まで（老後{retireYears}年）の前提
        </p>
        {gap > 0 ? (
          <>
            <p className="text-2xl font-bold text-amber-300 mt-1">{man(gap)} 足りません</p>
            <p className="text-sm text-slate-300 mt-2">
              埋めるには、今の積立に加えて
              <span className="font-bold text-amber-200 mx-1">毎月 {yen(extraMonthly)}</span>
              を{yearsToRetire}年間
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              年{(realRate * 100).toFixed(1)}%（実質）で運用した場合。運用しない場合は毎月 {yen(gap / Math.max(1, yearsToRetire * 12))}
            </p>
          </>
        ) : (
          <>
            <p className="text-2xl font-bold text-green-300 mt-1">{man(-gap)} 足ります</p>
            <p className="text-sm text-slate-300 mt-2">
              今のペースで必要額に届きます。余裕分は繰上げ退職や、ゆとり費の上乗せに回せます
            </p>
          </>
        )}
      </div>

      {/* 内訳 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-100">計算の内訳</h3>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400">老後に出ていくお金</p>
          <Line label={`生活費 ${yen(monthlyNeed)}/月 × ${retireYears}年`} value={monthlyNeed * 12 * retireYears} />
          <Line label="介護・医療などの一時費用" value={num(p.careCost)} />
          <Line label="合計" value={totalSpend} bold />
        </div>

        <div className="space-y-2 pt-2 border-t border-slate-800">
          <p className="text-xs font-semibold text-slate-400">入ってくるお金</p>
          <Line
            label={`年金 ${yen(pensionMonthly)}/月 × ${Math.max(0, lifeAge - pensionStartAge)}年`}
            value={totalPension}
            hint={p.pension ? "手入力" : payslipHints ? "給与明細の標準報酬額からの概算" : "未入力"}
          />
          <Line label="差し引き 必要な自己資金" value={needed} bold />
        </div>

        <div className="space-y-2 pt-2 border-t border-slate-800">
          <p className="text-xs font-semibold text-slate-400">退職までに用意できる見込み</p>
          <Line label={`今の資産 ${yen(currentAssets)} を${yearsToRetire}年運用`} value={currentAssets * Math.pow(1 + realRate, yearsToRetire)} />
          <Line label={`積立 ${yen(saving)}/月 × ${yearsToRetire}年`} value={futureValueOfMonthly(saving, realRate, yearsToRetire)} />
          <Line label="退職金" value={num(p.retireBonus)} />
          <Line label="合計" value={assetsAtRetire} bold />
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <span className="text-sm font-semibold text-slate-200">過不足</span>
          <span className={`text-lg font-bold ${gap > 0 ? "text-amber-300" : "text-green-300"}`}>
            {gap > 0 ? `−${yen(gap)}` : `+${yen(-gap)}`}
          </span>
        </div>

        {gapYears > 0 && (
          <p className="text-[11px] text-amber-300/80 bg-amber-500/10 rounded-lg px-2.5 py-2">
            退職（{retireAge}歳）から年金開始（{pensionStartAge}歳）までの{gapYears}年間は、
            収入が無いまま資産を取り崩します。この期間に必要な
            {yen(monthlyNeed * 12 * gapYears)} は特に現金で持っておく必要があります
          </p>
        )}
      </div>

      {/* 前提 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <button onClick={() => setOpenAssumptions(v => !v)} className="text-sm font-bold text-slate-100 w-full text-left">
          前提条件 {openAssumptions ? "▲" : "▼"}
        </button>

        {openAssumptions && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Field label="退職する年齢"><input className={input} inputMode="numeric" value={p.retireAge} onChange={e => set("retireAge", toHalfWidth(e.target.value).replace(/[^0-9]/g, ""))} /></Field>
              <Field label="何歳まで"><input className={input} inputMode="numeric" value={p.lifeAge} onChange={e => set("lifeAge", toHalfWidth(e.target.value).replace(/[^0-9]/g, ""))} /></Field>
              <Field label="年金の開始"><input className={input} inputMode="numeric" value={p.pensionStartAge} onChange={e => set("pensionStartAge", toHalfWidth(e.target.value).replace(/[^0-9]/g, ""))} /></Field>
            </div>

            <div>
              <label className="text-[10px] text-slate-500 block mb-1">老後の生活費（月）</label>
              <div className="flex rounded-lg bg-slate-800 p-0.5 text-[11px] mb-1.5">
                {([["budget", "予算から"], ["actual", "実績から"], ["manual", "手入力"]] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => set("livingSource", k)}
                    className={`flex-1 px-2 py-1 rounded-md transition-colors ${p.livingSource === k ? "bg-blue-600 text-white" : "text-slate-400"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {p.livingSource === "manual" ? (
                <input className={input} inputMode="numeric" value={p.livingManual}
                  onChange={e => set("livingManual", money(e.target.value))} />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 flex-1">
                    今の生活費 {yen(baseMonthly)} の
                  </span>
                  <input className={`${input} w-20`} inputMode="numeric" value={p.livingRate}
                    onChange={e => set("livingRate", toHalfWidth(e.target.value).replace(/[^0-9]/g, ""))} />
                  <span className="text-xs text-slate-400">% = {yen(retireLiving)}</span>
                </div>
              )}
              <p className="text-[11px] text-slate-500 mt-1">
                退職後は通勤・被服・交際費が減る一方、医療費と在宅時間の光熱費が増えます。
                現役時の7割前後が一つの目安です
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="ゆとり費（月）"><input className={input} inputMode="numeric" value={p.extra} onChange={e => set("extra", money(e.target.value))} /></Field>
              <Field label="年金（月・世帯合計）"><input className={input} inputMode="numeric" placeholder={pensionEstimate ? String(pensionEstimate) : "0"} value={p.pension} onChange={e => set("pension", money(e.target.value))} /></Field>
              <Field label="退職金（一時金）"><input className={input} inputMode="numeric" value={p.retireBonus} onChange={e => set("retireBonus", money(e.target.value))} /></Field>
              <Field label="今の積立（月）"><input className={input} inputMode="numeric" placeholder={nisaMonthly ? String(nisaMonthly) : "0"} value={p.monthlySaving} onChange={e => set("monthlySaving", money(e.target.value))} /></Field>
              <Field label="介護・医療の一時費用"><input className={input} inputMode="numeric" value={p.careCost} onChange={e => set("careCost", money(e.target.value))} /></Field>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              金額はすべて今の物価での価値で計算し、運用利回りは
              {settings.return_rate}% − 物価上昇{settings.inflation_rate}% = 実質{(realRate * 100).toFixed(1)}% を使っています。
              年金は「ねんきん定期便」の見込額を入れると精度が上がります。
              介護費用は1人あたり一時費用74万円＋月8.3万円×5年が平均値なので、2人分なら1,000万円前後を見込む考え方もあります
            </p>
          </div>
        )}
      </div>

      {/* 感度 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-bold text-slate-100">前提が変わったら</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800">
                <th className="text-left py-1.5 px-2 font-medium">条件</th>
                <th className="text-right py-1.5 px-2 font-medium">過不足</th>
                <th className="text-right py-1.5 px-2 font-medium">必要な追加積立</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "この前提のまま", life: lifeAge, rate: realRate, retire: retireAge },
                { label: "95歳まで生きる", life: 95, rate: realRate, retire: retireAge },
                { label: "運用が1%下振れ", life: lifeAge, rate: Math.max(0, realRate - 0.01), retire: retireAge },
                { label: "70歳まで働く", life: lifeAge, rate: realRate, retire: 70 },
              ].map((sc, i) => {
                const rYears = Math.max(0, sc.life - sc.retire)
                const toRetire = Math.max(0, sc.retire - currentAge)
                const spend = monthlyNeed * 12 * rYears + num(p.careCost)
                const pen = pensionMonthly * 12 * Math.max(0, sc.life - Math.max(pensionStartAge, 0))
                const need = Math.max(0, spend - pen)
                const assets = currentAssets * Math.pow(1 + sc.rate, toRetire)
                  + futureValueOfMonthly(saving, sc.rate, toRetire) + num(p.retireBonus)
                const g = need - assets
                return (
                  <tr key={i} className="border-b border-slate-800 last:border-0">
                    <td className="py-1.5 px-2 text-slate-300">{sc.label}</td>
                    <td className={`py-1.5 px-2 text-right font-semibold ${g > 0 ? "text-amber-300" : "text-green-300"}`}>
                      {g > 0 ? `−${man(g)}` : `+${man(-g)}`}
                    </td>
                    <td className="py-1.5 px-2 text-right text-slate-400">
                      {g > 0 ? `月 ${yen(requiredMonthly(g, sc.rate, toRetire))}` : "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500">
          長生きするほど必要額は増えます。一方で、働く期間を延ばすと「貯める期間が伸びて取り崩す期間が縮む」ため、
          効き方が最も大きくなります
        </p>
      </div>

      <SaveButton label="この前提を保存する" onSave={save} />
    </div>
  )
}

function Line({ label, value, bold, hint }: { label: string; value: number; bold?: boolean; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className={`text-sm ${bold ? "font-semibold text-slate-200" : "text-slate-300"}`}>{label}</p>
        {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
      </div>
      <span className={`text-sm shrink-0 ${bold ? "font-bold text-slate-100" : "text-slate-300"}`}>{yen(value)}</span>
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
