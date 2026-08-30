"use client"

import { useEffect, useState, useMemo } from "react"
import {
  calcTax, furusatoLimit, lifeInsuranceDeduction, IDECO_LIMITS,
  type TaxInput,
} from "@/lib/taxCalc"

const INPUT_CLS =
  "border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm bg-slate-900 text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"

const yen = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`
const man = (n: number) => `${Math.round(n / 10000).toLocaleString("ja-JP")}万円`
const toYen = (v: string) => {
  const n = Number(String(v).replace(/,/g, ""))
  return isNaN(n) ? 0 : Math.round(n * 10000)
}

interface Loaded {
  hasPayslip: boolean
  months: number
  salaryIncome: number
  socialInsurance: number
  actualIncomeTax: number
  actualResidentTax: number
  lifeInsuranceAnnual: number
  medicalExpense: number
  furusatoActual: number
  idecoActual: number
}

export function TaxSimulator() {
  const [data, setData] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(true)

  // 入力（万円単位で持つ）
  const [f, setF] = useState({
    salary: "", social: "", ideco: "0", life: "0", medical: "0",
    spouse: false, dependents: "0",
  })
  const [idecoType, setIdecoType] = useState<string>("none")

  useEffect(() => {
    fetch("/api/learn/tax")
      .then(r => r.json())
      .then((d: Loaded) => {
        setData(d)
        setF(prev => ({
          ...prev,
          salary: d.salaryIncome ? String(Math.round(d.salaryIncome / 10000)) : "",
          social: d.socialInsurance ? String(Math.round(d.socialInsurance / 10000)) : "",
          ideco: String(Math.round((d.idecoActual ?? 0) / 10000)),
          life: String(Math.round((d.lifeInsuranceAnnual ?? 0) / 10000)),
          medical: String(Math.round((d.medicalExpense ?? 0) / 10000)),
        }))
      })
      .finally(() => setLoading(false))
  }, [])

  const input: TaxInput = useMemo(() => ({
    salaryIncome: toYen(f.salary),
    socialInsurance: toYen(f.social),
    idecoAnnual: toYen(f.ideco),
    lifeInsuranceAnnual: toYen(f.life),
    medicalExpense: toYen(f.medical),
    spouseDeduction: f.spouse ? 380_000 : 0,
    dependentDeduction: toYen(f.dependents),
  }), [f])

  const result = useMemo(() => calcTax(input), [input])
  // 控除をまったく積まない状態＝節税効果を測る基準
  const base = useMemo(
    () => calcTax({ ...input, idecoAnnual: 0, lifeInsuranceAnnual: 0, medicalExpense: 0 }),
    [input]
  )
  const limit = useMemo(() => furusatoLimit(result), [result])
  const idecoMax = IDECO_LIMITS.find(l => l.key === idecoType)?.monthly ?? 23_000

  // iDeCoを満額にした場合の追加節税
  const idecoFull = useMemo(() => {
    const full = calcTax({ ...input, idecoAnnual: idecoMax * 12 })
    return { tax: full.totalTax, saving: result.totalTax - full.totalTax }
  }, [input, idecoMax, result.totalTax])

  const life = lifeInsuranceDeduction(input.lifeInsuranceAnnual)
  const saved = base.totalTax - result.totalTax

  if (loading) return <p className="text-center text-slate-500 text-sm py-10">読み込み中...</p>

  return (
    <div className="space-y-3">
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3">
        <p className="text-xs text-blue-200/90 leading-relaxed">
          会社員の節税は<span className="font-semibold text-blue-300">所得控除をどれだけ積めるか</span>で決まります。
          控除を1万円増やすと、<span className="font-semibold">限界税率のぶんだけ</span>税金が減ります。
          まず自分の限界税率を知るのが出発点です。
        </p>
      </div>

      {!data?.hasPayslip && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          <p className="text-[11px] text-amber-200/90 leading-relaxed">
            給与明細がまだ取り込まれていないため、収入・社会保険料は手入力してください。
            「給与明細取込」でPDFを取り込むと自動で入ります。
          </p>
        </div>
      )}

      {/* 限界税率 */}
      <div className="bg-slate-900 rounded-xl border-2 border-blue-500/40 p-4 text-center">
        <p className="text-[11px] text-slate-400 mb-1">あなたの限界税率</p>
        <p className="text-3xl font-bold text-blue-400">
          {(result.marginalTotalRate * 100).toFixed(1)}%
        </p>
        <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
          所得税{(result.marginalIncomeRate * 100).toFixed(0)}%（復興税込み{(result.marginalIncomeRate * 1.021 * 100).toFixed(1)}%）＋ 住民税10%
          <br />
          <span className="text-slate-300 font-semibold">
            控除を1万円増やすと、税金が約{yen(10000 * result.marginalTotalRate)}減ります
          </span>
        </p>
      </div>

      {/* 収入・社会保険料 */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3">
        <h4 className="text-xs font-semibold text-slate-300">収入と社会保険料</h4>
        <div className="grid grid-cols-2 gap-3">
          <Field label="年間の給与収入（万円）" hint="非課税の通勤手当を除いた額">
            <input type="text" inputMode="decimal" value={f.salary}
              onChange={e => setF({ ...f, salary: e.target.value })}
              onFocus={e => e.currentTarget.select()}
              className={`${INPUT_CLS} w-full text-right`} />
          </Field>
          <Field label="社会保険料の年額（万円）" hint="健康保険・厚生年金・雇用保険の合計">
            <input type="text" inputMode="decimal" value={f.social}
              onChange={e => setF({ ...f, social: e.target.value })}
              onFocus={e => e.currentTarget.select()}
              className={`${INPUT_CLS} w-full text-right`} />
          </Field>
        </div>
        {data?.hasPayslip && (
          <p className="text-[10px] text-slate-500">
            給与明細{data.months}ヶ月分から算出（12ヶ月に換算）
          </p>
        )}
      </div>

      {/* 控除の入力 */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-3">
        <h4 className="text-xs font-semibold text-slate-300">積んでいる控除</h4>
        <div className="grid grid-cols-2 gap-3">
          <Field label="iDeCoの年間掛金（万円）">
            <input type="text" inputMode="decimal" value={f.ideco}
              onChange={e => setF({ ...f, ideco: e.target.value })}
              onFocus={e => e.currentTarget.select()}
              className={`${INPUT_CLS} w-full text-right`} />
          </Field>
          <Field label="生命保険料の年間払込（万円）" hint={`控除額 ${yen(life.income)}（所得税）`}>
            <input type="text" inputMode="decimal" value={f.life}
              onChange={e => setF({ ...f, life: e.target.value })}
              onFocus={e => e.currentTarget.select()}
              className={`${INPUT_CLS} w-full text-right`} />
          </Field>
          <Field label="医療費（万円）" hint={result.medicalDeduction > 0 ? `控除額 ${yen(result.medicalDeduction)}` : "10万円を超えた分が控除"}>
            <input type="text" inputMode="decimal" value={f.medical}
              onChange={e => setF({ ...f, medical: e.target.value })}
              onFocus={e => e.currentTarget.select()}
              className={`${INPUT_CLS} w-full text-right`} />
          </Field>
          <Field label="扶養控除の合計（万円）" hint="一般38万・19〜22歳63万">
            <input type="text" inputMode="decimal" value={f.dependents}
              onChange={e => setF({ ...f, dependents: e.target.value })}
              onFocus={e => e.currentTarget.select()}
              className={`${INPUT_CLS} w-full text-right`} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
          <input type="checkbox" checked={f.spouse}
            onChange={e => setF({ ...f, spouse: e.target.checked })}
            className="w-4 h-4 accent-blue-500" />
          配偶者控除を受ける（38万円）
        </label>
      </div>

      {/* 税額 */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
        <Row label="給与収入" value={yen(result.salaryIncome)} />
        <Row label="− 給与所得控除" value={yen(result.salaryIncome - result.employmentIncome)} />
        <Row label="− 所得控除の合計" value={yen(result.deductionsIncome)} />
        <Row label="＝ 課税所得" value={yen(result.taxableIncome)} strong />
        <div className="h-2" />
        <Row label="所得税（復興税込み）" value={yen(result.incomeTax)} />
        <Row label="住民税" value={yen(result.residentTax)} />
        <Row label="税金の合計" value={yen(result.totalTax)} strong />
        {saved > 0 && (
          <div className="mt-2 bg-green-500/10 border border-green-500/30 rounded-lg p-2.5 text-center">
            <p className="text-[11px] text-green-300/80">積んでいる控除による節税額</p>
            <p className="text-lg font-bold text-green-400">−{yen(saved)}／年</p>
          </div>
        )}
      </div>

      {/* 打ち手 */}
      <h3 className="text-sm font-bold text-slate-100 pt-1">いま使える打ち手</h3>

      <Play
        title="ふるさと納税"
        headline={`上限 ${yen(limit)}`}
        body={
          <>
            この収入なら<span className="font-semibold text-slate-200">{yen(limit)}</span>まで、
            自己負担2,000円で寄付できます。
            {data && data.furusatoActual > 0 ? (
              <>
                現在の寄付額は{yen(data.furusatoActual)}なので、
                <span className="font-semibold text-amber-300">
                  あと{yen(Math.max(0, limit - data.furusatoActual))}
                </span>
                の余裕があります。
              </>
            ) : (
              <>まだ寄付の記録がありません。12月31日までに寄付すれば今年分になります。</>
            )}
          </>
        }
        caution="医療費控除やiDeCoで課税所得が下がると上限も下がります。上限ぎりぎりを狙わず1割ほど余裕を持たせてください。"
      />

      <Play
        title="iDeCo"
        headline={`満額なら 年${yen(idecoFull.saving)} の節税`}
        body={
          <>
            <div className="mb-2">
              <select value={idecoType} onChange={e => setIdecoType(e.target.value)}
                className={`${INPUT_CLS} w-full text-xs`}>
                {IDECO_LIMITS.map(l => (
                  <option key={l.key} value={l.key}>{l.label}（月{l.monthly.toLocaleString()}円まで）</option>
                ))}
              </select>
            </div>
            上限は月{idecoMax.toLocaleString()}円（年{yen(idecoMax * 12)}）。
            現在の掛金{yen(input.idecoAnnual)}から満額にすると、
            税金が<span className="font-semibold text-green-300">年{yen(idecoFull.saving)}</span>減ります。
            掛金は全額が所得控除になるため、相場に関係なく確定するリターンです。
          </>
        }
        caution="原則60歳まで引き出せません。生活防衛資金と、教育費など途中で使う予定のお金は入れないでください。"
      />

      <Play
        title="生命保険料控除"
        headline={`控除額 ${yen(life.income)}（所得税）／ ${yen(life.resident)}（住民税）`}
        body={
          <>
            年間払込{yen(input.lifeInsuranceAnnual)}に対する控除額です。
            {input.lifeInsuranceAnnual > 80_000 && (
              <span className="text-amber-300">
                {" "}年8万円を超えた分は控除が増えません。
                これ以上の保険料は節税にならないため、保障が本当に必要かを見直す価値があります。
              </span>
            )}
            {" "}一般・介護医療・個人年金の3区分それぞれで最大4万円、合計12万円まで使えます。
          </>
        }
        caution="節税のために保険に入るのは本末転倒です。控除は最大でも12万円×限界税率＝年2.4万円程度の効果しかありません。"
      />

      <Play
        title="医療費控除"
        headline={result.medicalDeduction > 0 ? `控除額 ${yen(result.medicalDeduction)}` : "10万円を超えたら対象"}
        body={
          <>
            生計を一にする家族の医療費を合算できます。通院の交通費も対象です。
            所得が200万円未満の場合は「所得の5%」が基準になります。
            {result.medicalDeduction > 0 && (
              <> この控除で約{yen(result.medicalDeduction * result.marginalTotalRate)}の節税になります。</>
            )}
          </>
        }
        caution="会社員でも年末調整では処理できず、確定申告が必要です。家族の中で最も所得が高い人がまとめて申告すると還付額が大きくなります。"
      />

      {/* 実績との比較 */}
      {data?.hasPayslip && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-2">
          <h4 className="text-xs font-semibold text-slate-300">給与明細の実績と比べる</h4>
          <Row label="試算した所得税" value={yen(result.incomeTax)} />
          <Row label="実際に引かれた所得税" value={yen(data.actualIncomeTax)} />
          <div className="h-1.5" />
          <Row label="試算した住民税" value={yen(result.residentTax)} />
          <Row label="実際に引かれた住民税" value={yen(data.actualResidentTax)} />
          <p className="text-[10px] text-slate-500 leading-relaxed pt-1">
            住民税は<span className="text-slate-400">前年の所得</span>をもとに6月〜翌5月で徴収されます。
            収入が増えた翌年は住民税も上がるため、試算値（今年の所得ベース）は
            来年支払う額に近くなります。所得税も賞与や年末調整で変動します。
          </p>
        </div>
      )}

      <p className="text-[10px] text-slate-500 leading-relaxed">
        ※ 税率・控除額は改正されます。この試算は概算であり、実際の税額は年末調整・確定申告で確定します。
        住宅ローン控除（税額控除）はこの試算に含めていません。
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

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-slate-800 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`${strong ? "text-sm font-bold text-blue-400" : "text-sm font-semibold text-slate-100"}`}>
        {value}
      </span>
    </div>
  )
}

function Play({ title, headline, body, caution }: {
  title: string; headline: string; body: React.ReactNode; caution: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full text-left px-4 py-3 hover:bg-slate-800/50 transition-colors">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-100">{title}</p>
            <p className="text-xs text-blue-300 font-semibold mt-0.5">{headline}</p>
          </div>
          <span className="text-slate-600 text-xs shrink-0 mt-1">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-slate-800 pt-3 space-y-2.5">
          <div className="text-xs text-slate-300 leading-relaxed">{body}</div>
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg p-2.5">
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              <span className="font-semibold text-amber-300">注意：</span>{caution}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
