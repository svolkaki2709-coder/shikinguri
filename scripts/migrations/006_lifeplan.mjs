/**
 * ライフプラン（キャッシュフロー表）機能。
 *
 * 家計簿として「過去の記録」を持つだけでなく、
 * 将来のライフイベント（教育・住宅・車・老後など）を織り込んだ
 * 数十年分の資金繰りを試算できるようにする。
 *
 * - life_members  … 家族構成。生年から各年の年齢を自動計算する
 * - life_settings … 前提条件（開始年・試算年数・物価上昇率・運用利回り・初期資産）
 * - life_streams  … 毎年継続的に発生する収入・支出（給与、生活費、住居費、年金 など）
 * - life_events   … 特定の年に発生するスポットの収入・支出（入学、住宅購入、車検 など）
 *
 * 金額はアプリ内の他テーブルと同じく「円」で保持する（UIでは万円で入出力する）。
 */

export const id = '006_lifeplan'

export async function up(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS life_members (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      birth_year INT NOT NULL,
      relation TEXT NOT NULL DEFAULT '本人',
      sort_order INT DEFAULT 0,
      owner_user_id INT REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS life_settings (
      id SERIAL PRIMARY KEY,
      start_year INT NOT NULL,
      years INT NOT NULL DEFAULT 40,
      inflation_rate NUMERIC(5,2) NOT NULL DEFAULT 1.00,
      return_rate NUMERIC(5,2) NOT NULL DEFAULT 3.00,
      initial_savings BIGINT NOT NULL DEFAULT 0,
      initial_investment BIGINT NOT NULL DEFAULT 0,
      owner_user_id INT REFERENCES users(id) ON DELETE CASCADE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS life_streams (
      id SERIAL PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'expense',
      name TEXT NOT NULL,
      annual_amount BIGINT NOT NULL DEFAULT 0,
      start_year INT,
      end_year INT,
      growth_rate NUMERIC(5,2),
      note TEXT DEFAULT '',
      sort_order INT DEFAULT 0,
      owner_user_id INT REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS life_events (
      id SERIAL PRIMARY KEY,
      year INT NOT NULL,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'その他',
      kind TEXT NOT NULL DEFAULT 'expense',
      amount BIGINT NOT NULL DEFAULT 0,
      repeat_years INT NOT NULL DEFAULT 1,
      inflate BOOLEAN NOT NULL DEFAULT TRUE,
      member_id INT REFERENCES life_members(id) ON DELETE SET NULL,
      note TEXT DEFAULT '',
      owner_user_id INT REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`CREATE INDEX IF NOT EXISTS life_events_year_idx ON life_events (year)`
}
