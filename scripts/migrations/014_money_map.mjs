/**
 * 口座マップ（お金の流れの図）。
 *
 * 家計簿の「支払方法（cards）」は明細を付ける先なので、貯蓄用口座・証券口座・
 * 給与の振込先のように明細を付けない口座は登録されていない。
 * 口座の整理にはそれらも並べて見たいので、図専用のノードとして別に持つ。
 * 家計簿の口座と同じものは card_id でひも付ける。
 *
 * money_accounts … 図に並べる口座（銀行・カード・証券・電子マネー・収入源）
 * money_flows    … 口座間のお金の流れ（振替・引き落とし・給与振込など）
 *
 * どちらも owner_user_id IS NULL が共同、それ以外が個人。
 * 流れは、片方でも共同の口座が絡むなら共同（相手にも見える）として保存する。
 */

export const id = '014_money_map'

export async function up(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS money_accounts (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'bank',
      institution TEXT DEFAULT '',
      purpose TEXT DEFAULT '',
      card_id INT REFERENCES cards(id) ON DELETE SET NULL,
      sort_order INT DEFAULT 0,
      owner_user_id INT REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS money_flows (
      id SERIAL PRIMARY KEY,
      from_id INT NOT NULL REFERENCES money_accounts(id) ON DELETE CASCADE,
      to_id INT NOT NULL REFERENCES money_accounts(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'transfer',
      amount INT,
      day_of_month INT,
      memo TEXT DEFAULT '',
      owner_user_id INT REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
}
