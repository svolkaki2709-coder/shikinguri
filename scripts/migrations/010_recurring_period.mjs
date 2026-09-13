/**
 * 定期項目に「いつからいつまで」を持たせる。
 *
 * これまでは一度登録すると無期限に毎月発生していたため、
 * 12回払いのローンや2年契約の保険のように終わりのあるものを登録できず、
 * 終わったら手で削除する運用になっていた。
 *
 * start_month / end_month はどちらも 'YYYY-MM'。NULL は「制限なし」。
 * 同じ月を両方に入れれば「その月だけの予定支出」になる。
 */

export const id = '010_recurring_period'

export async function up(sql) {
  await sql`ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS start_month VARCHAR(7)`
  await sql`ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS end_month VARCHAR(7)`
}
