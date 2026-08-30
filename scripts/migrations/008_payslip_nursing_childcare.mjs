/**
 * 給与明細に「介護保険料」「子ども・子育て支援金」を追加する。
 *
 * - 介護保険料: 40歳以上（介護保険第2号被保険者）になると健康保険料と別枠で控除される。
 *   40歳未満のうちは0円で明細に載る。
 * - 子ども・子育て支援金: 2026年4月開始。健康保険料と一緒に徴収される新しい控除項目。
 *
 * どちらも控除合計に含まれるため、取り込まないと給与源泉税の金額が実際より
 * 少なくなる（実際に471円ずれていた）。
 */

export const id = '008_payslip_nursing_childcare'

export async function up(sql) {
  await sql`ALTER TABLE payslip_details ADD COLUMN IF NOT EXISTS nursing_insurance INT`
  await sql`ALTER TABLE payslip_details ADD COLUMN IF NOT EXISTS childcare_contribution INT`
}
