/**
 * 定期項目を「この月だけスキップ」できるようにする。
 *
 * 未登録のまま残しておくと過去月に遡って確認する際にずっと候補として出てしまうため、
 * 「今月は対象外」を記録しておき、確定候補から除外できるようにする。
 */

export const id = '005_recurring_skips'

export async function up(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS recurring_skips (
      id SERIAL PRIMARY KEY,
      recurring_id INT NOT NULL REFERENCES recurring_expenses(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS recurring_skips_key ON recurring_skips (recurring_id, month)`
}
