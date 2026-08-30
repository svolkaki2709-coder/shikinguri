/**
 * ライフプランの計算ツール（住宅ローン・年金・必要保障額）の入力値を保存する。
 *
 * ツールごとに項目がまったく違うため、入力値は JSONB でまとめて持つ。
 * 後から入力項目を増やしてもマイグレーションが不要になる。
 *
 * 論理キーは (tool, member_id, owner_user_id)。
 * 年金は本人・配偶者それぞれで試算するため member_id を持たせている。
 */

export const id = '007_lifeplan_tools'

export async function up(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS life_tools (
      id SERIAL PRIMARY KEY,
      tool TEXT NOT NULL,
      member_id INT REFERENCES life_members(id) ON DELETE CASCADE,
      params JSONB NOT NULL DEFAULT '{}'::jsonb,
      owner_user_id INT REFERENCES users(id) ON DELETE CASCADE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS life_tools_tool_idx ON life_tools (tool)`
}
