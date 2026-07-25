/**
 * 取込明細に取込ログIDを持たせる。
 *
 * これまで取込の取り消しは「口座 + source='csv' + 日付範囲」で削除していたため、
 * 期間が重なる取込が複数あると、取り消したいものより前の取込データまで
 * 巻き添えで消えていた。行にログIDを紐付けて正確に取り消せるようにする。
 */

export const id = '002_import_log_link'

export async function up(sql) {
  await sql`
    ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS import_log_id INT REFERENCES csv_import_logs(id) ON DELETE SET NULL
  `
  await sql`
    ALTER TABLE incomes
    ADD COLUMN IF NOT EXISTS import_log_id INT REFERENCES csv_import_logs(id) ON DELETE SET NULL
  `
  await sql`CREATE INDEX IF NOT EXISTS transactions_import_log_idx ON transactions (import_log_id)`
  await sql`CREATE INDEX IF NOT EXISTS incomes_import_log_idx ON incomes (import_log_id)`
}
