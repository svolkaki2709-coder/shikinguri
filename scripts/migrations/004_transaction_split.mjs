/**
 * 1件の明細を複数カテゴリへ分割できるようにする。
 *
 * 例: 飲食店で10,000円払い、そのうち6,000円は友人の立替。
 *     → 「立替費用 6,000」と「外食 4,000」の2行に分ける。
 *
 * 分割元のIDを split_group_id に持たせ、あとから同じ会計だったと分かるようにする。
 */

export const id = '004_transaction_split'

export async function up(sql) {
  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS split_group_id INT`
  await sql`CREATE INDEX IF NOT EXISTS transactions_split_group_idx ON transactions (split_group_id)`
}
