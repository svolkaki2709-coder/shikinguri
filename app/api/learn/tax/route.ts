import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized } from "@/lib/session"

/**
 * 税金シミュレーションの初期値を、給与明細と家計簿の実績から組み立てる。
 *
 * 給与収入・社会保険料は給与明細（payslip_details）が最も正確なのでそこから取る。
 * 生命保険料・医療費・ふるさと納税・iDeCoは家計簿のカテゴリ別支出から拾う。
 */
export async function GET() {
  const me = await requireUser()
  if (!me) return unauthorized()

  const since = new Date()
  since.setMonth(since.getMonth() - 12)
  const sinceStr = since.toISOString().slice(0, 10)

  const [payslips, catRows] = await Promise.all([
    sql<{
      payment_month: string
      gross_pay: number | null
      nontaxable_commute: number | null
      travel_reimbursement: number | null
      health_insurance: number | null
      nursing_insurance: number | null
      childcare_contribution: number | null
      pension: number | null
      employment_insurance: number | null
      income_tax: number | null
      resident_tax: number | null
    }>`
      SELECT payment_month, gross_pay, nontaxable_commute, travel_reimbursement,
             health_insurance, nursing_insurance, childcare_contribution,
             pension, employment_insurance, income_tax, resident_tax
      FROM payslip_details
      WHERE owner_user_id = ${me.id}
      ORDER BY payment_month DESC
      LIMIT 12
    `,
    sql<{ category: string; total: string }>`
      SELECT category, SUM(amount)::text AS total
      FROM transactions
      WHERE (owner_user_id IS NULL OR owner_user_id = ${me.id})
        AND date >= ${sinceStr}
      GROUP BY category
    `,
  ])

  const n = (v: number | null | undefined) => Number(v ?? 0)
  const months = payslips.length

  // 課税対象の給与収入＝支給合計から非課税の通勤手当・立替を除いたもの
  const taxableSalary = payslips.reduce(
    (s, p) => s + n(p.gross_pay) - n(p.nontaxable_commute) - n(p.travel_reimbursement),
    0
  )
  const social = payslips.reduce(
    (s, p) =>
      s + n(p.health_insurance) + n(p.nursing_insurance) + n(p.childcare_contribution) +
      n(p.pension) + n(p.employment_insurance),
    0
  )
  const actualIncomeTax = payslips.reduce((s, p) => s + n(p.income_tax), 0)
  const actualResidentTax = payslips.reduce((s, p) => s + n(p.resident_tax), 0)

  // 12ヶ月に満たない場合は年額へ換算する
  const toAnnual = (v: number) => (months > 0 ? Math.round((v / months) * 12) : 0)

  const cat: Record<string, number> = {}
  for (const r of catRows) cat[r.category] = Number(r.total)
  const sumBy = (re: RegExp) =>
    Object.entries(cat).filter(([k]) => re.test(k)).reduce((s, [, v]) => s + v, 0)

  return NextResponse.json({
    hasPayslip: months > 0,
    months,
    salaryIncome: toAnnual(taxableSalary),
    socialInsurance: toAnnual(social),
    actualIncomeTax: toAnnual(actualIncomeTax),
    actualResidentTax: toAnnual(actualResidentTax),
    // 家計簿から拾った実績（初期値として使う）
    lifeInsuranceAnnual: sumBy(/保険/),
    medicalExpense: sumBy(/医療|病院|歯科/),
    furusatoActual: sumBy(/ふるさと|納税/),
    idecoActual: sumBy(/iDeCo|イデコ|確定拠出/i),
  })
}
