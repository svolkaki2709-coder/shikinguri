"use client"

import { useEffect, useState, useMemo } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"
import Link from "next/link"

interface PayslipDetail {
  id: number
  payment_month: string // YYYY-MM
  gross_pay: number | null
  net_pay: number | null
  income_tax: number | null
  resident_tax: number | null
  health_insurance: number | null
  pension: number | null
  employment_insurance: number | null
  travel_reimbursement: number | null
  nontaxable_commute: number | null
  taxable_commute: number | null
  total_deduction: number | null
  year_end_adjustment: number | null
}

function fmt(n: number | null | undefined) {
  if (n == null) return "—"
  return n.toLocaleString("ja-JP")
}
function fmtJPY(n: number | null | undefined) {
  if (n == null) return "—"
  return `¥${n.toLocaleString("ja-JP")}`
}
function pct(numerator: number | null | undefined, denominator: number | null | undefined) {
  if (!numerator || !denominator || denominator === 0) return "—"
  return `${((numerator / denominator) * 100).toFixed(1)}%`
}

function MonthLabel({ ym }: { ym: string }) {
  const [y, m] = ym.split("-")
  return <>{y}年{parseInt(m)}月</>
}

const TAX_NOTES = [
  {
    label: "所得税",
    color: "text-red-600",
    note: "月次は源泉徴収（概算）。12月の年末調整で過不足を精算。課税所得（支給額−社会保険料控除−給与所得控除）に税率を掛けた額。",
  },
  {
    label: "住民税",
    color: "text-orange-600",
    note: "前年の所得に基づき、6月〜翌5月の12回均等徴収。所得割（所得×10%）＋均等割（約5,000円/年）の合計。",
  },
  {
    label: "健康保険料",
    color: "text-blue-600",
    note: "標準報酬月額×保険料率（協会けんぽは約10%、会社と折半）。傷病・出産給付の財源。",
  },
  {
    label: "厚生年金保険料",
    color: "text-blue-600",
    note: "標準報酬月額×18.3%を会社と折半（個人負担9.15%）。将来の老齢・障害・遺族年金の財源。",
  },
  {
    label: "雇用保険料",
    color: "text-blue-600",
    note: "賃金総額×0.6%（労働者負担分）。失業給付・育児休業給付などの財源。",
  },
]

type FormulaType = "income_tax" | "resident_tax" | "health_insurance" | "pension" | "employment_insurance" | "total_deduction"

interface FormulaTarget {
  type: FormulaType
  row: PayslipDetail
}

function FormulaModal({ target, onClose }: { target: FormulaTarget; onClose: () => void }) {
  const { type, row } = target
  const g = row.gross_pay ?? 0
  const nc = row.nontaxable_commute ?? 0
  const tr = row.travel_reimbursement ?? 0
  const taxable = g - nc - tr
  const hi = row.health_insurance ?? 0
  const pe = row.pension ?? 0
  const ei = row.employment_insurance ?? 0
  const it = row.income_tax ?? 0
  const rt = row.resident_tax ?? 0
  const socialTotal = hi + pe + ei

  const rate = (n: number, base: number) =>
    base > 0 ? `${((n / base) * 100).toFixed(2)}%` : "—"

  type Step = { label: string; value?: string; formula?: string; note?: string; highlight?: boolean }
  let title = ""
  let steps: Step[] = []

  if (type === "income_tax") {
    title = "所得税（源泉徴収）の計算"
    steps = [
      { label: "支給合計", value: `${g.toLocaleString()}円` },
      { label: "非課税控除", formula: `− ${nc.toLocaleString()}（非課税通勤） − ${tr.toLocaleString()}（営業交通費）`, value: `= ${taxable.toLocaleString()}円` },
      { label: "社会保険料合計", value: `${socialTotal.toLocaleString()}円（健保＋年金＋雇用）` },
      { label: "課税対象額（概算）", formula: `${taxable.toLocaleString()} − ${socialTotal.toLocaleString()}`, value: `= ${(taxable - socialTotal).toLocaleString()}円` },
      { label: "源泉所得税", value: `${it.toLocaleString()}円`, highlight: true },
      { label: "実効税率", value: `${rate(it, taxable - socialTotal)}（課税対象比）`, note: "月次は源泉徴収税額表による概算。年末調整で確定。" },
    ]
  } else if (type === "resident_tax") {
    title = "住民税の計算"
    steps = [
      { label: "月額住民税", value: `${rt.toLocaleString()}円`, highlight: true },
      { label: "計算方式", formula: "前年の課税所得 × 10%（所得割）＋ 均等割（約5,000円/年）を12分割" },
      { label: "課税ベース比", value: rate(rt, taxable), note: "支給合計から非課税分を除いた課税対象額に対する割合" },
      { label: "課税対象額", value: `${taxable.toLocaleString()}円（支給 ${g.toLocaleString()} − 非課税 ${(nc + tr).toLocaleString()}）` },
    ]
  } else if (type === "health_insurance") {
    title = "健康保険料の計算"
    steps = [
      { label: "課税対象額（標準報酬月額の目安）", value: `${taxable.toLocaleString()}円` },
      { label: "健康保険料（個人負担）", value: `${hi.toLocaleString()}円`, highlight: true },
      { label: "実効料率", value: rate(hi, taxable), note: "協会けんぽの場合、総額の約10%を会社と折半（個人負担≈5%）" },
      { label: "計算式", formula: "標準報酬月額 × 保険料率（都道府県別） ÷ 2" },
    ]
  } else if (type === "pension") {
    title = "厚生年金保険料の計算"
    steps = [
      { label: "課税対象額（標準報酬月額の目安）", value: `${taxable.toLocaleString()}円` },
      { label: "厚生年金保険料（個人負担）", value: `${pe.toLocaleString()}円`, highlight: true },
      { label: "実効料率", value: rate(pe, taxable), note: "法定料率 18.3%を会社と折半 → 個人負担 9.15%" },
      { label: "計算式", formula: `標準報酬月額 × 18.3% ÷ 2（≈ ${taxable.toLocaleString()} × 9.15% = ${Math.round(taxable * 0.0915).toLocaleString()}円の目安）` },
    ]
  } else if (type === "employment_insurance") {
    title = "雇用保険料の計算"
    steps = [
      { label: "賃金総額（課税対象額）", value: `${taxable.toLocaleString()}円` },
      { label: "雇用保険料（個人負担）", value: `${ei.toLocaleString()}円`, highlight: true },
      { label: "実効料率", value: rate(ei, taxable), note: "2024年度の労働者負担率は賃金の0.6%" },
      { label: "計算式", formula: `課税対象額 × 0.6% = ${Math.round(taxable * 0.006).toLocaleString()}円（目安）` },
    ]
  } else if (type === "total_deduction") {
    title = "控除合計の内訳"
    const total = it + rt + hi + pe + ei
    steps = [
      { label: "所得税", value: `${it.toLocaleString()}円（${rate(it, taxable)}）` },
      { label: "住民税", value: `${rt.toLocaleString()}円（${rate(rt, taxable)}）` },
      { label: "健康保険料", value: `${hi.toLocaleString()}円（${rate(hi, taxable)}）` },
      { label: "厚生年金保険料", value: `${pe.toLocaleString()}円（${rate(pe, taxable)}）` },
      { label: "雇用保険料", value: `${ei.toLocaleString()}円（${rate(ei, taxable)}）` },
      { label: "控除合計", value: `${total.toLocaleString()}円`, highlight: true },
      { label: "実効負担率", value: `${rate(total, taxable)}（課税対象 ${taxable.toLocaleString()}円 比）` },
      { label: "手取り計算", formula: `支給合計 ${g.toLocaleString()} − 控除合計 ${total.toLocaleString()} = ${(g - total).toLocaleString()}円（目安）` },
    ]
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <p className="text-sm font-bold text-gray-800">{title}</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-2.5">
          {steps.map((s, i) => (
            <div key={i} className={`rounded-lg px-3 py-2 ${s.highlight ? "bg-indigo-50 border border-indigo-200" : "bg-gray-50"}`}>
              <p className="text-[10px] text-gray-500 font-medium mb-0.5">{s.label}</p>
              {s.formula && <p className="text-xs text-gray-600 font-mono leading-relaxed">{s.formula}</p>}
              {s.value && <p className={`text-sm font-bold ${s.highlight ? "text-indigo-700" : "text-gray-800"}`}>{s.value}</p>}
              {s.note && <p className="text-[10px] text-gray-400 mt-0.5">{s.note}</p>}
            </div>
          ))}
        </div>
        <div className="px-5 pb-4">
          <p className="text-[10px] text-gray-400">※ 計算式は目安です。実際の金額は標準報酬月額・保険料率・税額表により決定されます。</p>
        </div>
      </div>
    </div>
  )
}

export default function PayslipDetailsPage() {
  const [details, setDetails] = useState<PayslipDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingMonth, setDeletingMonth] = useState<string | null>(null)
  const [showNotes, setShowNotes] = useState(false)
  const [formulaTarget, setFormulaTarget] = useState<FormulaTarget | null>(null)

  useEffect(() => {
    fetch("/api/payslip-details")
      .then(r => r.json())
      .then(d => { setDetails(d.details ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // 年別にグループ化
  const byYear = useMemo(() => {
    const map: Record<string, PayslipDetail[]> = {}
    for (const d of details) {
      const y = d.payment_month.slice(0, 4)
      if (!map[y]) map[y] = []
      map[y].push(d)
    }
    // 年を降順で返す
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]))
  }, [details])

  async function handleDelete(month: string) {
    if (!confirm(`${month.replace("-", "年")}月のデータを削除しますか？`)) return
    setDeletingMonth(month)
    await fetch(`/api/payslip-details?month=${month}`, { method: "DELETE" })
    setDetails(prev => prev.filter(d => d.payment_month !== month))
    setDeletingMonth(null)
  }

  // 年次合計を計算
  function yearSum(rows: PayslipDetail[], key: keyof PayslipDetail): number {
    return rows.reduce((s, r) => {
      const v = r[key]
      return s + (typeof v === "number" ? v : 0)
    }, 0)
  }

  return (
    <div className="pb-20">
      <PageHeader title="給与源泉管理" />
      <div className="max-w-4xl mx-auto px-4 py-3 space-y-4">

        {/* ヘッダー説明 */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">給与明細取込データから自動反映</p>
            <p className="text-blue-500 mt-0.5">
              月次の税・社会保険料内訳を一覧管理。
              <Link href="/import-payslip" className="underline ml-1 hover:text-blue-700">給与明細取込</Link>
              で保存すると自動登録されます。
            </p>
          </div>
          <button
            onClick={() => setShowNotes(n => !n)}
            className="text-blue-600 border border-blue-300 rounded-lg px-2.5 py-1 text-[10px] font-semibold whitespace-nowrap hover:bg-blue-100 transition-colors shrink-0"
          >
            {showNotes ? "解説を閉じる" : "税金の仕組みを見る"}
          </button>
        </div>

        {/* 税金の仕組み解説 */}
        {showNotes && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="bg-gray-700 text-white px-4 py-2.5">
              <p className="text-sm font-bold">給与から引かれる税・社会保険料の仕組み</p>
            </div>
            <div className="divide-y divide-gray-100">
              {TAX_NOTES.map(item => (
                <div key={item.label} className="px-4 py-3 flex gap-3">
                  <span className={`text-xs font-bold ${item.color} w-24 shrink-0 pt-0.5`}>{item.label}</span>
                  <p className="text-xs text-gray-600 leading-relaxed">{item.note}</p>
                </div>
              ))}
              <div className="px-4 py-3 bg-gray-50">
                <p className="text-[10px] text-gray-500">
                  <span className="font-semibold">参考：負担率の目安</span>
                  所得税：0〜45%（累進）　住民税：10%固定　健康保険：約5%（折半後）　厚生年金：約9.15%　雇用保険：0.6%
                </p>
                <p className="text-[10px] text-gray-400 mt-1">※税率・保険料率は法改正・会社・所得水準によって異なります</p>
              </div>
            </div>
          </div>
        )}

        {loading && <div className="text-center py-10 text-gray-400 text-sm">読み込み中...</div>}

        {!loading && details.length === 0 && (
          <div className="text-center py-10 space-y-3">
            <p className="text-gray-400 text-sm">まだデータがありません</p>
            <Link href="/import-payslip"
              className="inline-block bg-blue-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-colors">
              給与明細を取り込む
            </Link>
          </div>
        )}

        {/* 年別テーブル */}
        {byYear.map(([year, rows]) => {
          const totalGross = yearSum(rows, "gross_pay")
          const totalNontaxableCommute = yearSum(rows, "nontaxable_commute")
          const totalTravelReimbursement = yearSum(rows, "travel_reimbursement")
          const totalTaxableBase = totalGross - totalNontaxableCommute - totalTravelReimbursement
          const totalIncomeTax = yearSum(rows, "income_tax")
          const totalResidentTax = yearSum(rows, "resident_tax")
          const totalHealthIns = yearSum(rows, "health_insurance")
          const totalPension = yearSum(rows, "pension")
          const totalEmployment = yearSum(rows, "employment_insurance")
          const totalDeduction = totalIncomeTax + totalResidentTax + totalHealthIns + totalPension + totalEmployment
          const totalYEA = yearSum(rows, "year_end_adjustment")

          return (
            <div key={year} className="bg-white rounded-xl shadow-sm overflow-hidden">
              {/* 年ヘッダー */}
              <div className="bg-gray-800 text-white px-4 py-2.5 flex items-center justify-between">
                <span className="text-sm font-bold">{year}年</span>
                <span className="text-xs text-gray-400">{rows.length}ヶ月分</span>
              </div>

              {/* PC: 横スクロールテーブル */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 border-b border-gray-200">
                      <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">支払月</th>
                      <th className="text-right px-3 py-2 font-semibold whitespace-nowrap text-gray-700">支給合計</th>
                      <th className="text-right px-3 py-2 font-semibold whitespace-nowrap text-red-500">所得税</th>
                      <th className="text-right px-3 py-2 font-semibold whitespace-nowrap text-orange-500">住民税</th>
                      <th className="text-right px-3 py-2 font-semibold whitespace-nowrap text-blue-500">健康保険</th>
                      <th className="text-right px-3 py-2 font-semibold whitespace-nowrap text-blue-500">厚生年金</th>
                      <th className="text-right px-3 py-2 font-semibold whitespace-nowrap text-blue-500">雇用保険</th>
                      <th className="text-right px-3 py-2 font-semibold whitespace-nowrap text-gray-600">控除合計</th>
                      <th className="text-right px-3 py-2 font-semibold whitespace-nowrap text-green-600">手取り</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map(row => {
                      const calcDeduction =
                        (row.income_tax ?? 0) + (row.resident_tax ?? 0) +
                        (row.health_insurance ?? 0) + (row.pension ?? 0) +
                        (row.employment_insurance ?? 0)
                      // 課税対象ベース = 支給合計 − 非課税通勤手当 − 営業交通費
                      const taxableBase = (row.gross_pay ?? 0)
                        - (row.nontaxable_commute ?? 0)
                        - (row.travel_reimbursement ?? 0)
                      return (
                        <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2.5 font-medium text-gray-800 whitespace-nowrap">
                            <MonthLabel ym={row.payment_month} />
                            {row.year_end_adjustment != null && row.year_end_adjustment !== 0 && (
                              <span className="ml-1.5 text-[9px] bg-yellow-100 text-yellow-700 px-1 py-0.5 rounded font-semibold">年調</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-700 font-medium whitespace-nowrap">{fmt(row.gross_pay)}</td>
                          <td className="px-3 py-2.5 text-right text-red-600 whitespace-nowrap cursor-pointer hover:bg-red-50 rounded"
                            onClick={() => setFormulaTarget({ type: "income_tax", row })}>
                            <div className="hover:underline">{fmt(row.income_tax)}</div>
                            <div className="text-[10px] text-gray-400">{pct(row.income_tax, taxableBase)}</div>
                          </td>
                          <td className="px-3 py-2.5 text-right text-orange-600 whitespace-nowrap cursor-pointer hover:bg-orange-50 rounded"
                            onClick={() => setFormulaTarget({ type: "resident_tax", row })}>
                            <div className="hover:underline">{fmt(row.resident_tax)}</div>
                            <div className="text-[10px] text-gray-400">{pct(row.resident_tax, taxableBase)}</div>
                          </td>
                          <td className="px-3 py-2.5 text-right text-blue-600 whitespace-nowrap cursor-pointer hover:bg-blue-50 rounded"
                            onClick={() => setFormulaTarget({ type: "health_insurance", row })}>
                            <div className="hover:underline">{fmt(row.health_insurance)}</div>
                            <div className="text-[10px] text-gray-400">{pct(row.health_insurance, taxableBase)}</div>
                          </td>
                          <td className="px-3 py-2.5 text-right text-blue-600 whitespace-nowrap cursor-pointer hover:bg-blue-50 rounded"
                            onClick={() => setFormulaTarget({ type: "pension", row })}>
                            <div className="hover:underline">{fmt(row.pension)}</div>
                            <div className="text-[10px] text-gray-400">{pct(row.pension, taxableBase)}</div>
                          </td>
                          <td className="px-3 py-2.5 text-right text-blue-600 whitespace-nowrap cursor-pointer hover:bg-blue-50 rounded"
                            onClick={() => setFormulaTarget({ type: "employment_insurance", row })}>
                            <div className="hover:underline">{fmt(row.employment_insurance)}</div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-gray-700 whitespace-nowrap cursor-pointer hover:bg-gray-100 rounded"
                            onClick={() => setFormulaTarget({ type: "total_deduction", row })}>
                            <div className="hover:underline">{fmt(calcDeduction)}</div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-green-600 whitespace-nowrap">{fmt(row.net_pay)}</td>
                          <td className="px-2 py-2.5 text-center">
                            <button
                              onClick={() => handleDelete(row.payment_month)}
                              disabled={deletingMonth === row.payment_month}
                              className="text-gray-300 hover:text-red-400 transition-colors text-base leading-none disabled:opacity-40"
                              title="削除"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>

                  {/* 年次合計行 */}
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                      <td className="px-3 py-2.5 text-gray-700">合計</td>
                      <td className="px-3 py-2.5 text-right text-gray-800">{fmt(totalGross)}</td>
                      <td className="px-3 py-2.5 text-right text-red-600">
                        <div>{fmt(totalIncomeTax)}</div>
                        <div className="text-[10px] text-gray-400 font-normal">{pct(totalIncomeTax, totalTaxableBase)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-orange-600">
                        <div>{fmt(totalResidentTax)}</div>
                        <div className="text-[10px] text-gray-400 font-normal">{pct(totalResidentTax, totalTaxableBase)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-blue-600">
                        <div>{fmt(totalHealthIns)}</div>
                        <div className="text-[10px] text-gray-400 font-normal">{pct(totalHealthIns, totalTaxableBase)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-blue-600">
                        <div>{fmt(totalPension)}</div>
                        <div className="text-[10px] text-gray-400 font-normal">{pct(totalPension, totalTaxableBase)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-blue-600">{fmt(totalEmployment)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-800">
                        <div>{fmt(totalDeduction)}</div>
                        <div className="text-[10px] text-gray-400 font-normal">{pct(totalDeduction, totalTaxableBase)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-green-600" colSpan={2}>
                        {totalYEA !== 0 && (
                          <div className="text-[10px] text-yellow-600 font-normal">年調還付: {fmt(totalYEA)}</div>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* サマリーカード（モバイル向け補足） */}
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 grid grid-cols-2 gap-2 md:hidden">
                <div className="text-center">
                  <p className="text-[10px] text-gray-400">年間支給合計</p>
                  <p className="text-sm font-bold text-gray-800">{fmtJPY(totalGross)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-400">年間控除合計（税＋社保）</p>
                  <p className="text-sm font-bold text-red-600">{fmtJPY(totalDeduction)}</p>
                  <p className="text-[10px] text-gray-400">{pct(totalDeduction, totalTaxableBase)}</p>
                </div>
              </div>
            </div>
          )
        })}

      </div>
      <BottomNav />

      {formulaTarget && (
        <FormulaModal target={formulaTarget} onClose={() => setFormulaTarget(null)} />
      )}
    </div>
  )
}
