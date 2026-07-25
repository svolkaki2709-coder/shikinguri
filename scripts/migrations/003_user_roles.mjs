/**
 * 世帯メンバーの役割を追加する。
 *   owner  … メンバーの追加・削除ができる（世帯の管理者）
 *   member … 共同データの閲覧・編集はできるが、メンバー管理はできない
 *
 * 最初に登録されたユーザー（＝アプリの持ち主）を owner にする。
 */

export const id = '003_user_roles'

export async function up(sql) {
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'`
  await sql`
    UPDATE users SET role = 'owner'
    WHERE id = (SELECT MIN(id) FROM users)
      AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'owner')
  `
}
