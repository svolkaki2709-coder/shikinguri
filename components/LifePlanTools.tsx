"use client"

import { useState, useMemo, useEffect } from "react"
import { fmtMan, manToYen, fmtYen } from "@/lib/money"
import {
  calcMortgage, calcPension, calcInsuranceNeed, calcSurvivorPension, monthlyPayment,
  REMUNERATION_CAP, QUALIFYING_MONTHS, SPOUSE_BONUS_MONTHS, SPOUSE_BONUS_ANNUAL,
} from "@/lib/fpCalc"
import { InvestSimulator } from "@/components/InvestSimulator"
import { SaveButton } from "@/components/SaveButton"

const INPUT_CLS =
  "border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm bg-slate-900 text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"

export interface ToolMember { id: number; name: string; birth_year: number; relation: string }
export interface ToolStream { id: number; kind: "income" | "expense"; name: string; annual_amount: number }
export interface ToolEvent { id: number; category: string; amount: number; repeat_years: number; kind: string }
export interface ToolRow { id: number; tool: string; member_id: number | null; params: Record<string, string> }
export interface ToolSettings { start_year: number; years: number; initial_savings: number; initial_investment: number }
/** 給与明細の厚生年金保険料から逆算した標準報酬月額 */
export interface PayslipHints {
  standardMonthly: number
  annualEquivalent: number
  months: number
  latestMonth: string
}

interface Props {
  settings: ToolSettings
  members: ToolMember[]
  streams: ToolStream[]
  events: ToolEvent[]
  tools: ToolRow[]
  scope: string
  onChanged: () => void
  flash: (s: string) => void
  payslipHints?: PayslipHints | null
  /** 家計簿から拾ったNISA積立の年間実績（円） */
  nisaAnnual?: number
  /** 現在の投資資産残高（円） */
  currentInvestment?: number
}

type ToolKey = "mortgage" | "pension" | "insurance" | "invest"

export function LifePlanTools(props: Props) {
  const [active, setActive] = useState<ToolKey>("mortgage")

  return (
    <div className="space-y-3">
      <div className="flex rounded-xl bg-slate-800 p-1 gap-0.5">
        {([
          ["mortgage", "🏠 住宅ローン"],
          ["pension", "🏵️ 年金見込額"],
          ["insurance", "🛡️ 必要保障額"],
          ["invest", "📈 積立"],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setActive(k)}
            className={`flex-1 whitespace-nowrap py-2 px-1 rounded-lg text-xs font-semibold transition-colors ${
              active === k ? "bg-slate-900 shadow-sm text-blue-400" : "text-slate-400"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {active === "mortgage" && <MortgageTool {...props} />}
      {active === "pension" && <PensionTool {...props} />}
      {active === "insurance" && <InsuranceTool {...props} />}
      {active === "invest" && (
        <InvestSimulator
          members={props.members} nisaAnnual={props.nisaAnnual}
          currentInvestment={props.currentInvestment ?? props.settings.initial_investment}
          scope={props.scope} tools={props.tools}
          onChanged={props.onChanged} flash={props.flash}
        />
      )}
    </div>
  )
}

// ─── 共通パーツ ─────────────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-slate-400 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{hint}</p>}
    </div>
  )
}

function NumInput({ value, onChange, suffix }: {
  value: string; onChange: (v: string) => void; suffix?: string
}) {
  return (
    <div className="relative">
      <input type="text" inputMode="decimal" value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={e => e.currentTarget.select()}
        className={`${INPUT_CLS} w-full text-right ${suffix ? "pr-9" : ""}`} />
      {suffix && (
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-500 pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  )
}

function ResultRow({ label, value, strong, danger }: {
  label: string; value: string; strong?: boolean; danger?: boolean
}) {
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-slate-800 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`${strong ? "text-base font-bold" : "text-sm font-semibold"} ${
        danger ? "text-red-400" : strong ? "text-blue-400" : "text-slate-100"
      }`}>{value}</span>
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
      <p className="text-[11px] text-blue-200/90 leading-relaxed">{children}</p>
    </div>
  )
}

/** 入力値の保存 */
async function saveParams(tool: string, memberId: number | null, params: Record<string, string>, scope: string) {
  const res = await fetch("/api/lifeplan/tools", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, member_id: memberId, params, card_type: scope }),
  })
  if (!res.ok) throw new Error("保存に失敗しました")
}

/** 収支ストリームの登録 */
async function addStream(body: Record<string, unknown>, scope: string) {
  await fetch("/api/lifeplan/streams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, card_type: scope }),
  })
}

// ═══════════════════════════════════════════════════════════════
// 住宅ローン
// ═══════════════════════════════════════════════════════════════
function MortgageTool({ settings, tools, scope, onChanged, flash }: Props) {
  const saved = tools.find(t => t.tool === "mortgage")?.params ?? {}
  const [f, setF] = useState({
    principal: saved.principal ?? "3500",
    rate: saved.rate ?? "1.0",
    years: saved.years ?? "35",
    startYear: saved.startYear ?? String(settings.start_year),
    income: saved.income ?? "",
    prepayment: saved.prepayment ?? "0",
    deductionCap: saved.deductionCap ?? "3000",
  })
  const [busy, setBusy] = useState(false)

  const r = useMemo(() => calcMortgage({
    principal: manToYen(f.principal),
    annualRate: Number(f.rate) || 0,
    years: Number(f.years) || 1,
    startYear: Number(f.startYear) || settings.start_year,
    annualIncome: manToYen(f.income),
    prepayment: manToYen(f.prepayment),
    deductionCap: manToYen(f.deductionCap),
  }), [f, settings.start_year])

  // 金利による総返済額の違い（金利の重みを実感するための比較）
  const rateCompare = useMemo(() => {
    const p = manToYen(f.principal)
    const y = Number(f.years) || 1
    return [0.5, 1.0, 1.5, 2.0].map(rate => {
      const m = monthlyPayment(p, rate, y)
      return { rate, monthly: m, total: m * y * 12 }
    })
  }, [f.principal, f.years])

  const ratioJudge =
    r.paymentRatio === 0 ? null
    : r.paymentRatio <= 20 ? { label: "余裕あり", cls: "bg-green-500/15 text-green-300" }
    : r.paymentRatio <= 25 ? { label: "安全圏", cls: "bg-green-500/15 text-green-300" }
    : r.paymentRatio <= 30 ? { label: "やや高い", cls: "bg-amber-500/15 text-amber-300" }
    : { label: "要注意", cls: "bg-red-500/15 text-red-300" }

  async function register() {
    setBusy(true)
    await saveParams("mortgage", null, f, scope)
    await addStream({
      kind: "expense",
      name: "住宅ローン返済",
      annual_amount: Math.round(r.annual),
      start_year: Number(f.startYear),
      end_year: r.endYear,
      growth_rate: 0,   // 固定額なので物価連動させない
      note: `借入${f.principal}万円 / 金利${f.rate}% / ${f.years}年`,
    }, scope)
    setBusy(false)
    onChanged()
    flash("住宅ローン返済を支出に登録しました")
  }

  async function registerDeduction() {
    setBusy(true)
    await addStream({
      kind: "income",
      name: "住宅ローン控除",
      annual_amount: Math.round(r.deduction.annualAvg),
      start_year: Number(f.startYear),
      end_year: Number(f.startYear) + 12,
      growth_rate: 0,
      note: "13年間の平均額",
    }, scope)
    setBusy(false)
    onChanged()
    flash("住宅ローン控除を収入に登録しました")
  }

  return (
    <div className="space-y-3">
      <Note>
        <span className="font-semibold text-blue-300">住宅ローン</span>は借入額よりも
        「毎年いくら返すのが何年続くか」がライフプランに効きます。
        ここで計算した年間返済額を、そのまま支出として登録できます。
        返済は固定額なので物価上昇率は0%で登録されます。
      </Note>

      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="借入額（万円）"><NumInput value={f.principal} onChange={v => setF({ ...f, principal: v })} suffix="万円" /></Field>
          <Field label="金利（年%）" hint="変動0.4%前後 / 固定1.8%前後が目安">
            <NumInput value={f.rate} onChange={v => setF({ ...f, rate: v })} suffix="%" />
          </Field>
          <Field label="返済期間（年）"><NumInput value={f.years} onChange={v => setF({ ...f, years: v })} suffix="年" /></Field>
          <Field label="返済開始年"><NumInput value={f.startYear} onChange={v => setF({ ...f, startYear: v })} suffix="年" /></Field>
          <Field label="税込年収（万円）" hint="返済比率の判定に使います">
            <NumInput value={f.income} onChange={v => setF({ ...f, income: v })} suffix="万円" />
          </Field>
          <Field label="繰上返済額（万円）" hint="今まとめて返した場合の効果">
            <NumInput value={f.prepayment} onChange={v => setF({ ...f, prepayment: v })} suffix="万円" />
          </Field>
        </div>
      </div>

      {/* 結果 */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
        <div className="text-center pb-3 mb-2 border-b border-slate-800">
          <p className="text-[11px] text-slate-400">毎月の返済額</p>
          <p className="text-2xl font-bold text-blue-400">{fmtYen(r.monthly)}</p>
          {ratioJudge && (
            <div className="mt-1.5 flex items-center justify-center gap-2">
              <span className="text-[11px] text-slate-400">返済比率 {r.paymentRatio.toFixed(1)}%</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${ratioJudge.cls}`}>
                {ratioJudge.label}
              </span>
            </div>
          )}
        </div>
        <ResultRow label="年間返済額" value={`${fmtMan(r.annual)}万円`} />
        <ResultRow label="総返済額" value={`${fmtMan(r.totalPayment)}万円`} />
        <ResultRow label="うち利息" value={`${fmtMan(r.totalInterest)}万円`} danger />
        <ResultRow label="完済年" value={`${r.endYear}年`} />
      </div>

      {ratioJudge && (r.paymentRatio > 25) && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          <p className="text-[11px] text-amber-200/90 leading-relaxed">
            <span className="font-semibold text-amber-300">返済比率が{r.paymentRatio.toFixed(0)}%です。</span>
            年収に対する年間返済額の割合は<span className="font-semibold">25%以内</span>が安全圏、
            35%が金融機関の審査上限の目安です。教育費が重なる時期に苦しくなりやすいので、
            借入額を下げるか期間を延ばすことも検討してみてください。
          </p>
        </div>
      )}

      {/* 繰上返済の効果 */}
      {r.prepayEffect && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
          <p className="text-xs font-semibold text-green-300 mb-2">
            繰上返済 {f.prepayment}万円 の効果（期間短縮型）
          </p>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-[11px] text-slate-400">減る利息</p>
              <p className="text-lg font-bold text-green-400">{fmtMan(r.prepayEffect.interestSaved)}万円</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">短縮される期間</p>
              <p className="text-lg font-bold text-green-400">
                {Math.floor(r.prepayEffect.monthsSaved / 12)}年{r.prepayEffect.monthsSaved % 12}ヶ月
              </p>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
            {manToYen(f.prepayment) > 0 && r.prepayEffect.interestSaved > 0 && (
              <>投じた{f.prepayment}万円に対して{fmtMan(r.prepayEffect.interestSaved)}万円の利息削減。
              実質利回り換算で年{f.rate}%相当の運用と同じ効果です。
              住宅ローン控除の期間中（13年）は控除額のほうが大きいこともあるので、
              繰上返済は控除終了後のほうが有利になるケースがあります。</>
            )}
          </p>
        </div>
      )}

      {/* 金利比較 */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-800 border-b border-slate-800">
          <h4 className="text-xs font-semibold text-slate-300">金利による違い（借入{f.principal}万円・{f.years}年）</h4>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-slate-800">
              <th className="text-left px-4 py-1.5 font-medium">金利</th>
              <th className="text-right px-4 py-1.5 font-medium">毎月</th>
              <th className="text-right px-4 py-1.5 font-medium">総返済額</th>
            </tr>
          </thead>
          <tbody>
            {rateCompare.map(c => (
              <tr key={c.rate} className={`border-b border-slate-800 last:border-0 ${
                Math.abs(c.rate - Number(f.rate)) < 0.01 ? "bg-blue-500/10" : ""
              }`}>
                <td className="px-4 py-1.5 text-slate-300">{c.rate.toFixed(1)}%</td>
                <td className="text-right px-4 py-1.5 text-slate-300">{fmtYen(c.monthly)}</td>
                <td className="text-right px-4 py-1.5 text-slate-100 font-medium">{fmtMan(c.total)}万円</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-slate-500 px-4 py-2 leading-relaxed">
          金利が1%違うだけで総返済額が数百万円変わります。変動金利を選ぶ場合は、
          金利が2%まで上がっても返済比率が破綻しないかをこの表で確認しておくと安心です
        </p>
      </div>

      {/* 住宅ローン控除 */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-2">
        <h4 className="text-xs font-semibold text-slate-300">住宅ローン控除の目安</h4>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><p className="text-[11px] text-slate-400">初年度</p>
            <p className="text-sm font-bold text-green-400">{fmtMan(r.deduction.firstYear)}万円</p></div>
          <div><p className="text-[11px] text-slate-400">13年合計</p>
            <p className="text-sm font-bold text-green-400">{fmtMan(r.deduction.total)}万円</p></div>
          <div><p className="text-[11px] text-slate-400">年平均</p>
            <p className="text-sm font-bold text-green-400">{fmtMan(r.deduction.annualAvg)}万円</p></div>
        </div>
        <div className="flex items-end gap-2">
          <Field label="控除の借入限度額（万円）" hint="住宅の性能で2,000〜5,000万円。省エネ基準適合なら3,000万円">
            <NumInput value={f.deductionCap} onChange={v => setF({ ...f, deductionCap: v })} suffix="万円" />
          </Field>
        </div>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          年末残高（限度額まで）の0.7%が所得税・住民税から13年間控除されます。
          実際の控除額は納めている税額が上限になるため、この試算より少なくなることがあります
        </p>
        <button onClick={registerDeduction} disabled={busy || r.deduction.annualAvg <= 0}
          className="w-full bg-green-600/80 text-white rounded-lg py-2 text-xs font-semibold hover:bg-green-600 disabled:opacity-40 transition-colors">
          控除を収入として登録（13年間・平均額）
        </button>
      </div>

      <button onClick={register} disabled={busy || r.annual <= 0}
        className="w-full bg-blue-600 text-white rounded-lg py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors">
        {busy ? "登録中..." : `年間${fmtMan(r.annual)}万円の返済を支出に登録（${f.startYear}〜${r.endYear}年）`}
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 公的年金
// ═══════════════════════════════════════════════════════════════
function PensionTool({ members, tools, scope, onChanged, flash, payslipHints }: Props) {
  const [memberId, setMemberId] = useState<number | null>(members[0]?.id ?? null)
  const member = members.find(m => m.id === memberId) ?? null
  const saved = tools.find(t => t.tool === "pension" && t.member_id === memberId)?.params ?? {}

  const [f, setF] = useState({
    income: saved.income ?? "500",
    workFrom: saved.workFrom ?? "22",
    workTo: saved.workTo ?? "65",
    basicMonths: saved.basicMonths ?? "480",
    startAge: saved.startAge ?? "65",
    monthsBefore2003: saved.monthsBefore2003 ?? "0",
    incomeBefore2003: saved.incomeBefore2003 ?? "0",
  })
  const [busy, setBusy] = useState(false)

  // 対象者を切り替えたら、その人の保存値を読み直す
  useEffect(() => {
    const p = tools.find(t => t.tool === "pension" && t.member_id === memberId)?.params
    if (p) {
      setF({
        income: p.income ?? "500",
        workFrom: p.workFrom ?? "22",
        workTo: p.workTo ?? "65",
        basicMonths: p.basicMonths ?? "480",
        startAge: p.startAge ?? "65",
        monthsBefore2003: p.monthsBefore2003 ?? "0",
        incomeBefore2003: p.incomeBefore2003 ?? "0",
      })
    }
  }, [memberId, tools])

  // 厚生年金の加入月数のうち、2003年3月以前は別計算になるので差し引く
  const totalMonths = Math.max(0, (Number(f.workTo) - Number(f.workFrom)) * 12)
  const monthsOld = Math.min(Number(f.monthsBefore2003) || 0, totalMonths)
  const enrolledMonths = totalMonths - monthsOld

  const baseInput = useMemo(() => ({
    avgAnnualIncome: manToYen(f.income),
    enrolledMonths,
    basicMonths: Number(f.basicMonths) || 0,
    monthsBefore2003: monthsOld,
    avgMonthlyBefore2003: manToYen(f.incomeBefore2003) / 12,
  }), [f.income, f.basicMonths, f.incomeBefore2003, enrolledMonths, monthsOld])

  const r = useMemo(
    () => calcPension({ ...baseInput, startAge: Number(f.startAge) || 65 }),
    [baseInput, f.startAge]
  )

  // 受給開始年齢による比較
  const ageCompare = useMemo(
    () => [60, 65, 70, 75].map(age => ({ age, result: calcPension({ ...baseInput, startAge: age }) })),
    [baseInput]
  )

  // 加給年金: 厚生年金20年以上＋65歳未満の配偶者がいると、配偶者が65歳になるまで加算される
  const spouse = members.find(m => m.relation === "配偶者") ?? null
  const spouseBonusEligible = totalMonths >= SPOUSE_BONUS_MONTHS && spouse != null

  async function register() {
    if (!member) return
    setBusy(true)
    await saveParams("pension", memberId, f, scope)
    await addStream({
      kind: "income",
      name: `公的年金（${member.name}）`,
      annual_amount: Math.round(r.total),
      start_year: member.birth_year + Number(f.startAge),
      end_year: null,
      growth_rate: 0,
      note: `平均年収${f.income}万円 / ${f.startAge}歳受給開始`,
    }, scope)
    setBusy(false)
    onChanged()
    flash("公的年金を収入に登録しました")
  }

  if (members.length === 0) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 text-center">
        <p className="text-sm text-slate-400 mb-1">まず家族を登録してください</p>
        <p className="text-xs text-slate-500">
          「前提条件」タブで生年を登録すると、受給開始年を自動で計算できます
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <Note>
        <span className="font-semibold text-blue-300">公的年金</span>は老後の収入の土台です。
        会社員なら「老齢基礎年金（全員共通）＋ 老齢厚生年金（年収と加入期間で決まる）」の2階建て。
        正確な見込額は<span className="font-semibold">ねんきん定期便・ねんきんネット</span>で確認できますが、
        ここでは平均年収から概算します。
      </Note>

      {/* 給与明細の実績から標準報酬月額を取り込む */}
      {payslipHints && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-2">
          <h4 className="text-xs font-semibold text-slate-300">給与明細の実績から取り込む</h4>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            年金額は額面給与ではなく<span className="text-slate-300">標準報酬月額</span>で決まります。
            取り込み済みの給与明細（{payslipHints.latestMonth}・{payslipHints.months}ヶ月分）の
            厚生年金保険料から逆算しました。
          </p>
          <div className="bg-slate-800 rounded-lg p-3">
            <ResultRow label="標準報酬月額" value={fmtYen(payslipHints.standardMonthly)} />
            <ResultRow label="年収換算（賞与なし）" value={`${fmtMan(payslipHints.annualEquivalent)}万円`} strong />
          </div>
          <button onClick={() => setF({ ...f, income: String(Math.round(payslipHints.annualEquivalent / 10000)) })}
            className="w-full bg-slate-800 text-slate-300 rounded-lg py-2 text-xs hover:bg-slate-700 transition-colors">
            この年収換算を「平均年収」に反映する
          </button>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            現在の水準が定年まで続いた場合の試算になります。若い頃の給与はこれより低いのが普通なので、
            生涯平均としては少し低めに直すと実態に近づきます。賞与がある場合は年収に加えてください
          </p>
        </div>
      )}

      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3">
        <Field label="対象者">
          <select value={memberId ?? ""} onChange={e => setMemberId(Number(e.target.value))}
            className={`${INPUT_CLS} w-full`}>
            {members.map(m => (
              <option key={m.id} value={m.id}>{m.name}（{m.birth_year}年生）</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="生涯の平均年収（万円）" hint="賞与込み。現在の年収でおおよそ代用できます">
            <NumInput value={f.income} onChange={v => setF({ ...f, income: v })} suffix="万円" />
          </Field>
          <Field label="受給開始年齢" hint="60〜75歳で選べます">
            <select value={f.startAge} onChange={e => setF({ ...f, startAge: e.target.value })}
              className={`${INPUT_CLS} w-full`}>
              {Array.from({ length: 16 }, (_, i) => 60 + i).map(a => (
                <option key={a} value={String(a)}>{a}歳</option>
              ))}
            </select>
          </Field>
          <Field label="就職年齢"><NumInput value={f.workFrom} onChange={v => setF({ ...f, workFrom: v })} suffix="歳" /></Field>
          <Field label="退職年齢"><NumInput value={f.workTo} onChange={v => setF({ ...f, workTo: v })} suffix="歳" /></Field>
        </div>
        <Field label="国民年金の納付月数" hint="40年間すべて納付なら480ヶ月（満額）。未納・免除期間があれば減らす">
          <NumInput value={f.basicMonths} onChange={v => setF({ ...f, basicMonths: v })} suffix="ヶ月" />
        </Field>

        <details className="bg-slate-800 rounded-lg px-3 py-2">
          <summary className="text-[11px] text-slate-400 cursor-pointer">
            2003年3月以前にも働いていた場合（計算式が違います）
          </summary>
          <div className="pt-2.5 space-y-2.5">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              2003年4月に総報酬制が導入され、それ以前は<span className="text-slate-400">賞与が年金額に反映されない</span>
              代わりに乗率が高く設定されています（7.125/1000。以降は5.481/1000）。
              2003年4月より後に就職した方は0のままで構いません。
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="2003年3月以前の加入月数">
                <NumInput value={f.monthsBefore2003} onChange={v => setF({ ...f, monthsBefore2003: v })} suffix="ヶ月" />
              </Field>
              <Field label="当時の平均年収（万円）" hint="賞与を含まない月給×12">
                <NumInput value={f.incomeBefore2003} onChange={v => setF({ ...f, incomeBefore2003: v })} suffix="万円" />
              </Field>
            </div>
          </div>
        </details>

        <p className="text-[10px] text-slate-500">
          厚生年金の加入期間：{Math.floor(totalMonths / 12)}年（{totalMonths}ヶ月）
          {monthsOld > 0 && ` / うち2003年3月以前 ${monthsOld}ヶ月`}
        </p>
      </div>

      {/* 制度上の条件チェック */}
      <div className="space-y-2">
        {!r.qualified && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <p className="text-[11px] text-red-200/90 leading-relaxed">
              <span className="font-semibold text-red-300">受給資格期間が足りません。</span>
              年金を受け取るには加入期間が通算<span className="font-semibold">10年（120ヶ月）</span>必要です
              （現在 {r.qualifyingMonths}ヶ月）。2017年8月に25年から10年へ短縮されました。
            </p>
          </div>
        )}
        {r.cappedMonthly >= REMUNERATION_CAP && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              <span className="font-semibold text-amber-300">標準報酬月額が上限に達しています。</span>
              厚生年金の標準報酬月額は{fmtYen(REMUNERATION_CAP)}（32等級）が上限で、
              これを超える給与をもらっても保険料も年金額もこれ以上は増えません。
            </p>
          </div>
        )}
        {spouseBonusEligible && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
            <p className="text-[11px] text-green-200/90 leading-relaxed">
              <span className="font-semibold text-green-300">加給年金の対象になりそうです。</span>
              厚生年金の加入が20年（240ヶ月）以上あり、65歳未満の配偶者（{spouse?.name}）がいる場合、
              配偶者が65歳になるまで<span className="font-semibold">年{fmtMan(SPOUSE_BONUS_ANNUAL)}万円</span>が加算されます。
              期間限定の加算なので、下の年金額には含めていません。
            </p>
          </div>
        )}
        {totalMonths > 0 && totalMonths < SPOUSE_BONUS_MONTHS && spouse && (
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              厚生年金の加入があと{SPOUSE_BONUS_MONTHS - totalMonths}ヶ月で20年に達すると、
              配偶者が65歳になるまで加給年金（年{fmtMan(SPOUSE_BONUS_ANNUAL)}万円）が付きます。
            </p>
          </div>
        )}
      </div>

      {/* 結果 */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
        <div className="text-center pb-3 mb-2 border-b border-slate-800">
          <p className="text-[11px] text-slate-400">{f.startAge}歳から受け取れる年金（月額）</p>
          <p className="text-2xl font-bold text-blue-400">{fmtYen(r.monthly)}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">年額 {fmtMan(r.total)}万円</p>
        </div>
        <ResultRow label="老齢基礎年金（1階）" value={`${fmtMan(r.basic)}万円`} />
        <ResultRow label="老齢厚生年金（2階）" value={`${fmtMan(r.kousei)}万円`} />
        {member && (
          <ResultRow label="受給開始年" value={`${member.birth_year + Number(f.startAge)}年`} />
        )}
      </div>

      {/* 繰上げ・繰下げ比較 */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-800 border-b border-slate-800">
          <h4 className="text-xs font-semibold text-slate-300">受給開始年齢による違い</h4>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-slate-800">
              <th className="text-left px-4 py-1.5 font-medium">開始</th>
              <th className="text-right px-4 py-1.5 font-medium">増減率</th>
              <th className="text-right px-4 py-1.5 font-medium">月額</th>
            </tr>
          </thead>
          <tbody>
            {ageCompare.map(c => (
              <tr key={c.age} className={`border-b border-slate-800 last:border-0 ${
                c.age === Number(f.startAge) ? "bg-blue-500/10" : ""
              }`}>
                <td className="px-4 py-1.5 text-slate-300">{c.age}歳</td>
                <td className={`text-right px-4 py-1.5 ${
                  c.result.rate > 1 ? "text-green-400" : c.result.rate < 1 ? "text-red-400" : "text-slate-500"
                }`}>
                  {c.result.rate === 1 ? "基準" : `${c.result.rate > 1 ? "+" : ""}${((c.result.rate - 1) * 100).toFixed(0)}%`}
                </td>
                <td className="text-right px-4 py-1.5 text-slate-100 font-medium">{fmtYen(c.result.monthly)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-slate-500 px-4 py-2 leading-relaxed">
          繰下げると<span className="text-slate-400">1ヶ月あたり0.7%</span>増え、70歳なら+42%、75歳なら+84%。
          しかも増えた金額が一生続きます。長生きするほど有利で、損益分岐点はおおむね<span className="text-slate-400">受給開始から12年後</span>。
          働けるうちは繰り下げる、というのが有力な選択肢です
        </p>
      </div>

      <button onClick={register} disabled={busy || !member || r.total <= 0}
        className="w-full bg-blue-600 text-white rounded-lg py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors">
        {busy ? "登録中..." : `年金 年${fmtMan(r.total)}万円を収入に登録（${member ? member.birth_year + Number(f.startAge) : ""}年〜）`}
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 必要保障額（万一のときにいくら足りないか）
// ═══════════════════════════════════════════════════════════════
function InsuranceTool({ settings, members, streams, events, tools, scope, flash }: Props) {
  const thisYear = new Date().getFullYear()
  const saved = tools.find(t => t.tool === "insurance")?.params ?? {}

  // 家計簿・ライフプランの登録内容から初期値を組み立てる
  const autoLiving = streams.filter(s => s.kind === "expense").reduce((s, r) => s + r.annual_amount, 0)
  const autoEducation = events
    .filter(e => e.category === "教育" && e.kind === "expense")
    .reduce((s, e) => s + e.amount * e.repeat_years, 0)
  const autoAssets = settings.initial_savings + settings.initial_investment
  const children = members.filter(m => m.relation === "子")
  const youngestChildAge = children.length > 0
    ? Math.min(...children.map(c => thisYear - c.birth_year))
    : null
  const autoYearsUntilIndep = youngestChildAge != null ? Math.max(0, 22 - youngestChildAge) : 0

  const [f, setF] = useState({
    living: saved.living ?? String(Math.round(autoLiving / 10000)),
    yearsIndep: saved.yearsIndep ?? String(autoYearsUntilIndep),
    spouseYears: saved.spouseYears ?? "30",
    education: saved.education ?? String(Math.round(autoEducation / 10000)),
    housing: saved.housing ?? "0",
    housingYears: saved.housingYears ?? "0",
    funeral: saved.funeral ?? "200",
    emergency: saved.emergency ?? "300",
    pensionAnnual: saved.pensionAnnual ?? "",
    pensionYears: saved.pensionYears ?? "20",
    spouseIncome: saved.spouseIncome ?? "0",
    spouseWorkYears: saved.spouseWorkYears ?? "20",
    assets: saved.assets ?? String(Math.round(autoAssets / 10000)),
    deathBenefit: saved.deathBenefit ?? "0",
    // 遺族年金の自動計算用
    deceasedIncome: saved.deceasedIncome ?? "500",
    deceasedMonths: saved.deceasedMonths ?? "480",
  })

  const survivor = useMemo(() => calcSurvivorPension({
    avgAnnualIncome: manToYen(f.deceasedIncome),
    enrolledMonths: Number(f.deceasedMonths) || 0,
    childCount: children.length,
  }), [f.deceasedIncome, f.deceasedMonths, children.length])

  const r = useMemo(() => calcInsuranceNeed({
    annualLivingCost: manToYen(f.living),
    yearsUntilIndependence: Number(f.yearsIndep) || 0,
    spouseRemainingYears: Number(f.spouseYears) || 0,
    educationCost: manToYen(f.education),
    annualHousingCost: manToYen(f.housing),
    housingYears: Number(f.housingYears) || 0,
    funeralCost: manToYen(f.funeral),
    emergencyFund: manToYen(f.emergency),
    survivorPensionAnnual: manToYen(f.pensionAnnual),
    survivorPensionYears: Number(f.pensionYears) || 0,
    spouseAnnualIncome: manToYen(f.spouseIncome),
    spouseWorkYears: Number(f.spouseWorkYears) || 0,
    currentAssets: manToYen(f.assets),
    deathBenefit: manToYen(f.deathBenefit),
  }), [f])

  async function save() {
    await saveParams("insurance", null, f, scope)
  }

  return (
    <div className="space-y-3">
      <Note>
        <span className="font-semibold text-blue-300">必要保障額</span>とは、
        万一のときに<span className="font-semibold">遺族に必要なお金 − 遺族が受け取れるお金</span>の差額です。
        この差額だけを生命保険で用意すればよく、多くの人はこれを計算せずに必要以上の保険に入っています。
        遺族年金が想像以上に手厚いため、計算すると必要額がかなり小さくなることも珍しくありません。
      </Note>

      {/* 遺族年金の自動計算 */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3">
        <h4 className="text-xs font-semibold text-slate-300">① 遺族年金がいくら出るか</h4>
        <div className="grid grid-cols-2 gap-3">
          <Field label="亡くなる方の平均年収（万円）">
            <NumInput value={f.deceasedIncome} onChange={v => setF({ ...f, deceasedIncome: v })} suffix="万円" />
          </Field>
          <Field label="厚生年金の加入月数">
            <NumInput value={f.deceasedMonths} onChange={v => setF({ ...f, deceasedMonths: v })} suffix="ヶ月" />
          </Field>
        </div>
        <div className="bg-slate-800 rounded-lg p-3">
          <ResultRow label={`遺族基礎年金（子${children.length}人）`} value={`${fmtMan(survivor.izokuKiso)}万円/年`} />
          <ResultRow label="遺族厚生年金" value={`${fmtMan(survivor.izokuKousei)}万円/年`} />
          <ResultRow label="合計" value={`${fmtMan(survivor.total)}万円/年`} strong />
          <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
            遺族基礎年金は末子が18歳になる年度末まで。その後は遺族厚生年金のみになります
          </p>
        </div>
        <button onClick={() => setF({ ...f, pensionAnnual: String(Math.round(survivor.total / 10000)) })}
          className="w-full bg-slate-800 text-slate-300 rounded-lg py-2 text-xs hover:bg-slate-700 transition-colors">
          この金額を下の「遺族年金」に反映する
        </button>
      </div>

      {/* 必要なお金 */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3">
        <h4 className="text-xs font-semibold text-red-300">② 遺族に必要なお金</h4>
        <div className="grid grid-cols-2 gap-3">
          <Field label="現在の年間生活費（万円）" hint="家計簿の支出から自動セット済み">
            <NumInput value={f.living} onChange={v => setF({ ...f, living: v })} suffix="万円" />
          </Field>
          <Field label="末子が独立するまで（年）" hint={youngestChildAge != null ? `末子${youngestChildAge}歳 → 22歳まで` : "子の登録がない場合は0"}>
            <NumInput value={f.yearsIndep} onChange={v => setF({ ...f, yearsIndep: v })} suffix="年" />
          </Field>
          <Field label="独立後の配偶者の年数" hint="平均余命まで。30年程度で見ることが多い">
            <NumInput value={f.spouseYears} onChange={v => setF({ ...f, spouseYears: v })} suffix="年" />
          </Field>
          <Field label="教育費の総額（万円）" hint="ライフイベントの教育費から自動セット済み">
            <NumInput value={f.education} onChange={v => setF({ ...f, education: v })} suffix="万円" />
          </Field>
          <Field label="年間住居費（万円）" hint="団信付きの持ち家なら0。賃貸なら年間家賃">
            <NumInput value={f.housing} onChange={v => setF({ ...f, housing: v })} suffix="万円" />
          </Field>
          <Field label="住居費の年数">
            <NumInput value={f.housingYears} onChange={v => setF({ ...f, housingYears: v })} suffix="年" />
          </Field>
          <Field label="葬儀費用（万円）"><NumInput value={f.funeral} onChange={v => setF({ ...f, funeral: v })} suffix="万円" /></Field>
          <Field label="予備費（万円）" hint="住居の修繕や急な出費に">
            <NumInput value={f.emergency} onChange={v => setF({ ...f, emergency: v })} suffix="万円" />
          </Field>
        </div>
        <div className="bg-slate-800 rounded-lg p-3">
          <ResultRow label="遺族の生活費（独立まで・現在の70%）" value={`${fmtMan(r.livingBeforeIndependence)}万円`} />
          <ResultRow label="遺族の生活費（独立後・現在の50%）" value={`${fmtMan(r.livingAfterIndependence)}万円`} />
          <ResultRow label="住居費" value={`${fmtMan(r.housing)}万円`} />
          <ResultRow label="教育費・葬儀費用・予備費" value={`${fmtMan(manToYen(f.education) + manToYen(f.funeral) + manToYen(f.emergency))}万円`} />
          <ResultRow label="必要額 合計" value={`${fmtMan(r.needTotal)}万円`} strong />
        </div>
      </div>

      {/* 準備できているお金 */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3">
        <h4 className="text-xs font-semibold text-green-300">③ 遺族が受け取れるお金</h4>
        <div className="grid grid-cols-2 gap-3">
          <Field label="遺族年金（万円/年）"><NumInput value={f.pensionAnnual} onChange={v => setF({ ...f, pensionAnnual: v })} suffix="万円" /></Field>
          <Field label="受給年数"><NumInput value={f.pensionYears} onChange={v => setF({ ...f, pensionYears: v })} suffix="年" /></Field>
          <Field label="配偶者の年収（万円）"><NumInput value={f.spouseIncome} onChange={v => setF({ ...f, spouseIncome: v })} suffix="万円" /></Field>
          <Field label="配偶者が働く年数"><NumInput value={f.spouseWorkYears} onChange={v => setF({ ...f, spouseWorkYears: v })} suffix="年" /></Field>
          <Field label="現在の金融資産（万円）" hint="前提条件から自動セット済み">
            <NumInput value={f.assets} onChange={v => setF({ ...f, assets: v })} suffix="万円" />
          </Field>
          <Field label="死亡退職金・加入済み保険（万円）">
            <NumInput value={f.deathBenefit} onChange={v => setF({ ...f, deathBenefit: v })} suffix="万円" />
          </Field>
        </div>
        <div className="bg-slate-800 rounded-lg p-3">
          <ResultRow label="遺族年金の総額" value={`${fmtMan(r.pensionTotal)}万円`} />
          <ResultRow label="配偶者の収入" value={`${fmtMan(r.spouseIncomeTotal)}万円`} />
          <ResultRow label="金融資産・死亡退職金等" value={`${fmtMan(manToYen(f.assets) + manToYen(f.deathBenefit))}万円`} />
          <ResultRow label="準備できている額 合計" value={`${fmtMan(r.haveTotal)}万円`} strong />
        </div>
      </div>

      {/* 結論 */}
      <div className={`rounded-xl border-2 p-4 text-center ${
        r.shortfall > 0 ? "bg-amber-500/10 border-amber-500/40" : "bg-green-500/10 border-green-500/40"
      }`}>
        <p className="text-[11px] text-slate-400 mb-1">必要保障額（不足額）</p>
        <p className={`text-3xl font-bold ${r.shortfall > 0 ? "text-amber-300" : "text-green-400"}`}>
          {r.shortfall > 0 ? `${fmtMan(r.shortfall)}万円` : "0円"}
        </p>
        <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
          {r.shortfall > 0 ? (
            <>この金額を死亡保障で用意すれば、万一のときも遺族の生活は成り立つ計算です。
            <br />必要保障額は子の成長とともに減っていくので、
            <span className="text-slate-300">収入保障保険や逓減定期保険</span>のような
            「年々保障額が下がる代わりに保険料が安い」商品が合理的です。</>
          ) : (
            <>遺族年金・配偶者の収入・現在の資産で必要額をまかなえる計算です。
            <br />追加の死亡保障は必ずしも必要ありません。保険料を見直す余地があるかもしれません。</>
          )}
        </p>
      </div>

      <SaveButton onSave={save} label="入力内容を保存する" />

      <p className="text-[10px] text-slate-500 leading-relaxed px-1">
        ※ 遺族年金は簡易計算です。中高齢寡婦加算、自営業の場合の扱い、
        子の人数や年齢による受給期間の変化などは反映していません。
        実際の加入判断の前には、ねんきんネットや専門家で確認してください
      </p>
    </div>
  )
}
