"use client"

import { useState, useMemo } from "react"
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts"
import {
  simulateInvest, requiredMonthly,
  NISA_LIFETIME_LIMIT, NISA_ANNUAL_LIMIT, CAPITAL_GAINS_TAX,
} from "@/lib/investCalc"
import { fmtMan, manToYen, fmtYen } from "@/lib/money"

const INPUT_CLS =
  "border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm bg-slate-900 text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"

export interface InvestMember { id: number; name: string; birth_year: number; relation: string }

interface Props {
  members: InvestMember[]
  /** 家計簿から拾ったNISA積立の年間実績（円） */
  nisaAnnual?: number
  /** 現在の投資資産残高（円） */
  currentInvestment?: number
  scope: string
  tools: { tool: string; member_id: number | null; params: Record<string, string> }[]
  onChanged: () => void
  flash: (s: string) => void
}

export function InvestSimulator({ members, nisaAnnual = 0, currentInvestment = 0, scope, tools, flash }: Props) {
  const thisYear = new Date().getFullYear()
  const saved = tools.find(t => t.tool === "invest")?.params ?? {}
  const defaultAge = members[0] ? thisYear - members[0].birth_year : 35

  const [f, setF] = useState({
    currentAge: saved.currentAge ?? String(defaultAge),
    untilAge: saved.untilAge ?? "65",
    // 家計簿の実績（年額）から月額へ
    monthly: saved.monthly ?? String(Math.round((nisaAnnual || 0) / 12 / 1000) * 1000 || 30000),
    annualExtra: saved.annualExtra ?? "0",
    rate: saved.rate ?? "5",
    initial: saved.initial ?? String(Math.round((currentInvestment || 0) / 10000)),
    usedLifetime: saved.usedLifetime ?? "0",
  })
  const [targetMan, setTargetMan] = useState(saved.targetMan ?? "3000")
  const [busy, setBusy] = useState(false)

  const input = useMemo(() => ({
    currentAge: Number(f.currentAge) || 0,
    untilAge: Number(f.untilAge) || 0,
    monthly: Number(String(f.monthly).replace(/,/g, "")) || 0,
    annualExtra: Number(String(f.annualExtra).replace(/,/g, "")) || 0,
    annualRate: Number(f.rate) || 0,
    initialValue: manToYen(f.initial),
    usedLifetime: manToYen(f.usedLifetime),
  }), [f])

  const r = useMemo(() => simulateInvest(input, thisYear), [input, thisYear])

  // 利回りを変えた場合の比較
  const scenarios = useMemo(
    () => [1, 3, 5, 7].map(rate => ({
      rate,
      result: simulateInvest({ ...input, annualRate: rate }, thisYear),
    })),
    [input, thisYear]
  )

  const years = Math.max(0, input.untilAge - input.currentAge)
  const needMonthly = useMemo(
    () => requiredMonthly(manToYen(targetMan), years, input.annualRate, input.initialValue),
    [targetMan, years, input.annualRate, input.initialValue]
  )

  const chartData = useMemo(
    () => r.rows.map(row => ({
      age: `${row.age}歳`,
      元本: Math.round(row.principal / 10000),
      運用益: Math.round(row.gain / 10000),
      評価額: Math.round(row.value / 10000),
    })),
    [r.rows]
  )

  const annualContribution = input.monthly * 12 + input.annualExtra
  const overAnnualLimit = annualContribution > NISA_ANNUAL_LIMIT

  async function save() {
    setBusy(true)
    await fetch("/api/lifeplan/tools", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "invest", member_id: null, params: { ...f, targetMan }, card_type: scope }),
    })
    setBusy(false)
    flash("積立プランを保存しました")
  }

  return (
    <div className="space-y-3">
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3">
        <p className="text-xs text-blue-200/90 leading-relaxed">
          積立投資の結果を決めるのは<span className="font-semibold text-blue-300">金額・期間・利回り</span>の3つだけです。
          このうち自分で決められるのは金額と期間。
          利回りは選べないので、複数の利回りで試して<span className="font-semibold">最悪でも困らないか</span>を確かめるのが正しい使い方です。
        </p>
      </div>

      {/* 入力 */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="現在の年齢">
            <input type="number" value={f.currentAge} onChange={e => setF({ ...f, currentAge: e.target.value })}
              onFocus={e => e.currentTarget.select()} className={`${INPUT_CLS} w-full text-right`} />
          </Field>
          <Field label="何歳まで積み立てるか">
            <input type="number" value={f.untilAge} onChange={e => setF({ ...f, untilAge: e.target.value })}
              onFocus={e => e.currentTarget.select()} className={`${INPUT_CLS} w-full text-right`} />
          </Field>
          <Field label="毎月の積立額（円）" hint={nisaAnnual > 0 ? `家計簿の実績: 年${fmtMan(nisaAnnual)}万円` : undefined}>
            <input type="text" inputMode="numeric" value={f.monthly}
              onChange={e => setF({ ...f, monthly: e.target.value })}
              onFocus={e => e.currentTarget.select()} className={`${INPUT_CLS} w-full text-right`} />
          </Field>
          <Field label="年1回の追加積立（円）" hint="賞与から上乗せする場合">
            <input type="text" inputMode="numeric" value={f.annualExtra}
              onChange={e => setF({ ...f, annualExtra: e.target.value })}
              onFocus={e => e.currentTarget.select()} className={`${INPUT_CLS} w-full text-right`} />
          </Field>
          <Field label="想定の年利回り（%）" hint="全世界株の長期平均は5〜7%程度">
            <input type="text" inputMode="decimal" value={f.rate}
              onChange={e => setF({ ...f, rate: e.target.value })}
              onFocus={e => e.currentTarget.select()} className={`${INPUT_CLS} w-full text-right`} />
          </Field>
          <Field label="今のNISA評価額（万円）">
            <input type="text" inputMode="decimal" value={f.initial}
              onChange={e => setF({ ...f, initial: e.target.value })}
              onFocus={e => e.currentTarget.select()} className={`${INPUT_CLS} w-full text-right`} />
          </Field>
        </div>
        {nisaAnnual > 0 && (
          <button
            onClick={() => setF({ ...f, monthly: String(Math.round(nisaAnnual / 12 / 1000) * 1000) })}
            className="w-full bg-slate-800 text-slate-300 rounded-lg py-2 text-xs hover:bg-slate-700 transition-colors">
            家計簿の実績から月額を入れる（月{fmtYen(Math.round(nisaAnnual / 12))}）
          </button>
        )}
        {overAnnualLimit && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              年間の積立額が{fmtMan(annualContribution)}万円で、NISAの年間投資枠
              {fmtMan(NISA_ANNUAL_LIMIT)}万円を超えています。超過分は積み立てられないものとして計算しています。
            </p>
          </div>
        )}
      </div>

      {/* 結果 */}
      <div className="bg-slate-900 rounded-xl border-2 border-blue-500/40 p-4 text-center">
        <p className="text-[11px] text-slate-400">{f.untilAge}歳時点の評価額</p>
        <p className="text-3xl font-bold text-blue-400 my-1">{fmtMan(r.finalValue)}万円</p>
        <p className="text-[11px] text-slate-400">
          元本 {fmtMan(r.totalPrincipal)}万円 ＋ 運用益 {fmtMan(r.totalGain)}万円
        </p>
      </div>

      {/* 非課税メリット */}
      {r.totalGain > 0 && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
          <p className="text-xs font-semibold text-green-300 mb-2">NISAの非課税メリット</p>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-[11px] text-slate-400">課税口座なら引かれる税金</p>
              <p className="text-lg font-bold text-red-400">−{fmtMan(r.taxIfTaxable)}万円</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">NISAなら</p>
              <p className="text-lg font-bold text-green-400">0円</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
            運用益{fmtMan(r.totalGain)}万円に対して{(CAPITAL_GAINS_TAX * 100).toFixed(3)}%の税金がかかるところが、
            NISAなら全額手元に残ります。この差額{fmtMan(r.taxIfTaxable)}万円が非課税制度の価値です
          </p>
        </div>
      )}

      {/* 生涯投資枠 */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-2">
        <div className="flex justify-between items-baseline">
          <h4 className="text-xs font-semibold text-slate-300">生涯投資枠の使用状況</h4>
          <span className="text-xs text-slate-400">
            {fmtMan(r.rows[r.rows.length - 1]?.usedLifetime ?? 0)} / {fmtMan(NISA_LIFETIME_LIMIT)}万円
          </span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${Math.min(100, ((r.rows[r.rows.length - 1]?.usedLifetime ?? 0) / NISA_LIFETIME_LIMIT) * 100)}%` }} />
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          {r.lifetimeFullAge != null ? (
            <><span className="font-semibold text-amber-300">{r.lifetimeFullAge}歳で生涯投資枠1,800万円を使い切ります。</span>
            それ以降は積み立てられないため、余った資金は特定口座やiDeCoに回すことになります。</>
          ) : (
            <>この積立ペースだと{f.untilAge}歳までに枠は埋まりません。
            余力があれば積立額を増やすと、非課税で運用できる金額を増やせます。</>
          )}
        </p>
      </div>

      {/* グラフ */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-3">
        <h4 className="text-xs font-semibold text-slate-400 mb-2">資産の推移（万円）</h4>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="age" tick={{ fontSize: 10, fill: "#64748b" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
            <Tooltip
              contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#e2e8f0" }}
              formatter={(v) => `${Number(v ?? 0).toLocaleString("ja-JP")}万円`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="元本" stackId="1" stroke="#64748b" fill="#475569" fillOpacity={0.7} />
            <Area type="monotone" dataKey="運用益" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.5} />
            <Line type="monotone" dataKey="評価額" stroke="#3b82f6" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-slate-500 mt-1.5">
          グレーが自分で積んだ元本、緑が運用益。後半になるほど運用益の伸びが加速するのが複利です
        </p>
      </div>

      {/* 利回り別の比較 */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-800 border-b border-slate-800">
          <h4 className="text-xs font-semibold text-slate-300">
            利回りが変わったら（月{Number(f.monthly).toLocaleString()}円 × {years}年）
          </h4>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-slate-800">
              <th className="text-left px-4 py-1.5 font-medium">利回り</th>
              <th className="text-right px-4 py-1.5 font-medium">元本</th>
              <th className="text-right px-4 py-1.5 font-medium">評価額</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map(s => (
              <tr key={s.rate} className={`border-b border-slate-800 last:border-0 ${
                Math.abs(s.rate - input.annualRate) < 0.01 ? "bg-blue-500/10" : ""
              }`}>
                <td className="px-4 py-1.5 text-slate-300">{s.rate}%</td>
                <td className="text-right px-4 py-1.5 text-slate-500">{fmtMan(s.result.totalPrincipal)}万円</td>
                <td className="text-right px-4 py-1.5 text-slate-100 font-medium">{fmtMan(s.result.finalValue)}万円</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-slate-500 px-4 py-2 leading-relaxed">
          利回りは自分では選べません。低いほうの数字でも生活が成り立つかを確認しておくと、
          相場が下がったときに慌てて売らずに済みます
        </p>
      </div>

      {/* 目標からの逆算 */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3">
        <h4 className="text-xs font-semibold text-slate-300">目標額から逆算する</h4>
        <div className="grid grid-cols-2 gap-3 items-end">
          <Field label="目標額（万円）">
            <input type="text" inputMode="decimal" value={targetMan}
              onChange={e => setTargetMan(e.target.value)}
              onFocus={e => e.currentTarget.select()} className={`${INPUT_CLS} w-full text-right`} />
          </Field>
          <div className="text-center">
            <p className="text-[11px] text-slate-400">必要な毎月の積立</p>
            <p className="text-xl font-bold text-blue-400">{fmtYen(needMonthly)}</p>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          {input.untilAge}歳までの{years}年間、年利{input.annualRate}%で運用した場合の必要額です。
          {needMonthly > input.monthly ? (
            <span className="text-amber-300">
              {" "}現在の月{Number(f.monthly).toLocaleString()}円より
              {fmtYen(needMonthly - input.monthly)}多く積み立てる必要があります。
            </span>
          ) : (
            <span className="text-green-300">
              {" "}現在の積立額で目標に届きます。
            </span>
          )}
        </p>
      </div>

      <button onClick={save} disabled={busy}
        className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors">
        {busy ? "保存中..." : "この積立プランを保存する"}
      </button>

      {/* 年次表 */}
      <details className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <summary className="px-4 py-3 text-xs font-semibold text-slate-300 cursor-pointer hover:bg-slate-800/50">
          年ごとの推移を表で見る
        </summary>
        <div className="overflow-x-auto border-t border-slate-800">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800">
                <th className="text-left px-3 py-1.5 font-medium">年齢</th>
                <th className="text-right px-3 py-1.5 font-medium">年間積立</th>
                <th className="text-right px-3 py-1.5 font-medium">元本</th>
                <th className="text-right px-3 py-1.5 font-medium">運用益</th>
                <th className="text-right px-3 py-1.5 font-medium">評価額</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map(row => (
                <tr key={row.age} className={`border-b border-slate-800 last:border-0 ${row.capped ? "bg-amber-500/5" : ""}`}>
                  <td className="px-3 py-1.5 text-slate-300">{row.age}歳<span className="text-slate-600 text-[10px]"> ({row.year})</span></td>
                  <td className="text-right px-3 py-1.5 text-slate-500">{fmtMan(row.contributed)}</td>
                  <td className="text-right px-3 py-1.5 text-slate-400">{fmtMan(row.principal)}</td>
                  <td className="text-right px-3 py-1.5 text-green-400">{fmtMan(row.gain)}</td>
                  <td className="text-right px-3 py-1.5 text-blue-400 font-medium">{fmtMan(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="text-[10px] text-slate-500 leading-relaxed">
        ※ 利回りは毎年一定として計算した概算です。実際の相場は上下するため、
        同じ平均利回りでも結果は変わります。NISAの投資枠は改正されることがあります。
      </p>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-slate-400 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{hint}</p>}
    </div>
  )
}
