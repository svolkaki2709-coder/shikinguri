/**
 * 2人で進める手続き・タスクの管理。
 *
 * 入籍・引っ越し・出産などのライフイベントの前後は、役所・勤務先・金融機関・保険と
 * 期限付きの手続きが一気に発生する。どちらがどこまでやったのかが分からなくなりやすいので、
 * 「担当」と「期限」を持たせて共同スコープ（owner_user_id IS NULL）で共有する。
 *
 * template_key はテンプレートから取り込んだ項目の識別子。
 * 同じテンプレートを二重に取り込まないための重複チェックだけに使う。
 */

export const id = '009_todos'

export async function up(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS todos (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'その他',
      detail TEXT DEFAULT '',
      assignee TEXT DEFAULT '',
      due_date DATE,
      done BOOLEAN NOT NULL DEFAULT FALSE,
      done_at TIMESTAMPTZ,
      template_key TEXT,
      sort_order INT DEFAULT 0,
      owner_user_id INT REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS todos_due_idx ON todos (due_date)`
}
