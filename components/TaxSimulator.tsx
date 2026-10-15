"use client"
import { fmtDecimalInput } from "@/lib/num"

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
      <details className="text-[11px] text-blue-200/90 leading-relaxed">
        <summary className="cursor-pointer text-blue-300 w-fit">ⓘ 節税の考え方</summary>
        <p className="mt-1">
          会社員の節税は<span className="font-semibold text-blue-300">所得控除をどれだけ積めるか</span>で決まります。
          控除を1万円増やすと、<span className="font-semibold">限界税率のぶんだけ</span>税金が減ります。
          まず自分の限界税率を知るのが出発点です。
        </p>
      </details>

      {!data?.hasPayslip && (
        <p className="text-[11px] text-amber-300"
          title="「給与明細取込」でPDFを取り込むと自動で入ります">
          ⚠ 給与明細が未取込のため、収入・社会保険料は手入力してください ⓘ
        </p>
      )}

      <div className="grid gap-3 @3xl:grid-cols-2 @3xl:items-start">
        {/* 入力 */}
        <div className="@container bg-slate-900 rounded-xl border border-slate-800 p-3 space-y-2">
          <h4 className="text-xs font-semibold text-slate-300">
            収入と社会保険料
            {data?.hasPayslip && (
              <span className="ml-2 text-[10px] font-normal text-slate-500">給与明細{data.months}ヶ月分から12ヶ月換算</span>
            )}
          </h4>
          <div className="grid grid-cols-2 @md:grid-cols-3 gap-x-3 gap-y-2">
            <Field label="年間の給与収入（万円）" hint="非課税の通勤手当を除いた額">
              <input type="text" inputMode="decimal" value={f.salary}
                onChange={e => setF({ ...f, salary: fmtDecimalInput(e.target.value) })}
                onFocus={e => e.currentTarget.select()}
                className={`${INPUT_CLS} w-24 text-right`} />
            </Field>
            <Field label="社会保険料の年額（万円）" hint="健康保険・厚生年金・雇用保険の合計">
              <input type="text" inputMode="decimal" value={f.social}
                onChange={e => setF({ ...f, social: fmtDecimalInput(e.target.value) })}
                onFocus={e => e.currentTarget.select()}
                className={`${INPUT_CLS} w-24 text-right`} />
            </Field>
          </div>
          <h4 className="text-xs font-semibold text-slate-300 pt-1">積んでいる控除</h4>
          <div className="grid grid-cols-2 @md:grid-cols-3 gap-x-3 gap-y-2">
            <Field label="iDeCo年間掛金（万円）">
              <input type="text" inputMode="decimal" value={f.ideco}
                onChange={e => setF({ ...f, ideco: fmtDecimalInput(e.target.value) })}
                onFocus={e => e.currentTarget.select()}
                className={`${INPUT_CLS} w-24 text-right`} />
            </Field>
            <Field label="生命保険料の年間払込（万円）" note={`控除 ${yen(life.income)}`}>
              <input type="text" inputMode="decimal" value={f.life}
                onChange={e => setF({ ...f, life: fmtDecimalInput(e.target.value) })}
                onFocus={e => e.currentTarget.select()}
                className={`${INPUT_CLS} w-24 text-right`} />
            </Field>
            <Field label="医療費（万円）"
              note={result.medicalDeduction > 0 ? `控除 ${yen(result.medicalDeduction)}` : undefined}
              hint="10万円を超えた分が控除">
              <input type="text" inputMode="decimal" value={f.medical}
                onChange={e => setF({ ...f, medical: fmtDecimalInput(e.target.value) })}
                onFocus={e => e.currentTarget.select()}
                className={`${INPUT_CLS} w-24 text-right`} />
            </Field>
            <Field label="扶養控除の合計（万円）" hint="一般38万・19〜22歳63万">
              <input type="text" inputMode="decimal" value={f.dependents}
                onChange={e => setF({ ...f, dependents: e.target.value })}
                onFocus={e => e.currentTarget.select()}
                className={`${INPUT_CLS} w-24 text-right`} />
            </Field>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer self-end pb-1.5">
              <input type="checkbox" checked={f.spouse}
                onChange={e => setF({ ...f, spouse: e.target.checked })}
                className="w-4 h-4 accent-blue-500" />
              配偶者控除（38万円）
            </label>
          </div>
        </div>

        <div className="space-y-3">
          {/* 限界税率 */}
          <div className="bg-slate-900 rounded-xl border-2 border-blue-500/40 px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
            <div>
              <p className="text-[11px] text-slate-400">あなたの限界税率</p>
              <p className="text-2xl font-bold text-blue-400">
                {(result.marginalTotalRate * 100).toFixed(1)}%
              </p>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              所得税{(result.marginalIncomeRate * 100).toFixed(0)}%（復興税込み{(result.marginalIncomeRate * 1.021 * 100).toFixed(1)}%）＋ 住民税10%
              <br />
              <span className="text-slate-300 font-semibold">
                控除を1万円増やすと、税金が約{yen(10000 * result.marginalTotalRate)}減ります
              </span>
            </p>
          </div>

          {/* 税額 */}
          <div className="@container bg-slate-900 rounded-xl border border-slate-800 px-4 py-2">
            <div className="grid @md:grid-cols-2 @md:gap-x-6">
              <div>
                <Row label="給与収入" value={yen(result.salaryIncome)} />
                <Row label="− 給与所得控除" value={yen(result.salaryIncome - result.employmentIncome)} />
                <Row label="− 所得控除の合計" value={yen(result.deductionsIncome)} />
                <Row label="＝ 課税所得" value={yen(result.taxableIncome)} strong />
              </div>
              <div>
                <Row label="所得税（復興税込み）" value={yen(result.incomeTax)} />
                <Row label="住民税" value={yen(result.residentTax)} />
                <Row label="税金の合計" value={yen(result.totalTax)} strong />
                {saved > 0 && (
                  <div className="flex justify-between items-baseline py-1.5">
                    <span className="text-xs text-green-300/80">控除による節税額</span>
                    <span className="text-sm font-bold text-green-400">−{yen(saved)}／年</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 実績との比較 */}
          {data?.hasPayslip && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 px-4 py-2">
              <h4 className="text-xs font-semibold text-slate-300 mb-1"
                title="住民税は前年の所得をもとに6月〜翌5月で徴収されます。収入が増えた翌年は住民税も上がるため、試算値（今年の所得ベース）は来年支払う額に近くなります。所得税も賞与や年末調整で変動します。">
                給与明細の実績と比べる ⓘ
              </h4>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500">
                    <th className="text-left font-medium py-1"></th>
                    <th className="text-right font-medium py-1">試算</th>
                    <th className="text-right font-medium py-1">実際に引かれた額</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-800">
                    <td className="py-1.5 text-slate-400">所得税</td>
                    <td className="py-1.5 text-right font-semibold text-slate-100">{yen(result.incomeTax)}</td>
                    <td className="py-1.5 text-right font-semibold text-slate-100">{yen(data.actualIncomeTax)}</td>
                  </tr>
                  <tr className="border-t border-slate-800">
                    <td className="py-1.5 text-slate-400">住民税</td>
                    <td className="py-1.5 text-right font-semibold text-slate-100">{yen(result.residentTax)}</td>
                    <td className="py-1.5 text-right font-semibold text-slate-100">{yen(data.actualResidentTax)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 打ち手 */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <h3 className="px-4 py-2 text-xs font-bold text-slate-200 border-b border-slate-800">いま使える打ち手</h3>
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
                  className={`${INPUT_CLS} max-w-full text-xs`}>
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
      </div>

      <p className="text-[10px] text-slate-500"
        title="税率・控除額は改正されます。この試算は概算であり、実際の税額は年末調整・確定申告で確定します。住宅ローン控除（税額控除）はこの試算に含めていません。">
        ※ 概算です（住宅ローン控除は含まず） ⓘ
      </p>
    </div>
  )
}

/** ヒントはラベル横のⓘ（title）、noteは計算結果などラベル行の右に出す短い値 */
function Field({ label, hint, note, children }: { label: string; hint?: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-slate-400 mb-0.5" title={hint}>
        {label}{hint && <span className="text-slate-500 cursor-help"> ⓘ</span>}
      </label>
      <div className="flex flex-wrap items-center gap-x-2">
        {children}
        {note && <span className="text-[10px] text-slate-500 whitespace-nowrap">{note}</span>}
      </div>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between items-baseline py-1 border-b border-slate-800 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`${strong ? "text-sm font-bold text-blue-400" : "text-sm font-semibold text-slate-100"}`}>
        {value}
      </span>
    </div>
  )
}

/** 1行の見出し（タイトル＋要点）。押すと本文と注意点が開く */
function Play({ title, headline, body, caution }: {
  title: string; headline: string; body: React.ReactNode; caution: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-slate-800 last:border-0">
      <button onClick={() => setOpen(v => !v)}
        className="w-full text-left px-4 py-2 hover:bg-slate-800/50 transition-colors flex items-baseline gap-2">
        <span className="text-xs font-bold text-slate-100 shrink-0">{title}</span>
        <span className="text-xs text-blue-300 font-semibold min-w-0 flex-1 truncate">{headline}</span>
        <span className="text-slate-600 text-[10px] shrink-0">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-2">
          <div className="text-xs text-slate-300 leading-relaxed">{body}</div>
          <p className="text-[11px] text-amber-200/90 leading-relaxed">
            <span className="font-semibold text-amber-300">注意：</span>{caution}
          </p>
        </div>
      )}
    </div>
  )
}
