/**
 * マルチユーザー化 + 口座(accounts)概念の導入
 *
 * スコープモデル:
 *   owner_user_id IS NULL  → 共同（世帯メンバー全員が閲覧可）
 *   owner_user_id = <id>   → そのユーザー個人（本人のみ閲覧可）
 *
 * 既存データの移行:
 *   card_type = 'joint' → owner_user_id = NULL（共同）
 *   card_type = 'self'  → owner_user_id = 初期ユーザーのid（個人）
 *
 * 冪等性は schema_migrations テーブルで担保する。
 */

export const id = '001_multiuser_and_accounts'

const OWNER_TABLES = [
  'cards', 'categories', 'budgets', 'transactions', 'incomes',
  'assets', 'goals', 'monthly_plans', 'payslip_details',
  'recurring_expenses', 'store_category_rules', 'csv_import_logs',
]

export async function up(sql, { primaryEmail, primaryName }) {
  // ── users ──────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`
    INSERT INTO users (email, display_name)
    VALUES (${primaryEmail}, ${primaryName})
    ON CONFLICT (email) DO NOTHING
  `
  const [me] = await sql`SELECT id FROM users WHERE email = ${primaryEmail}`
  const myId = me.id
  console.log(`  primary user: ${primaryEmail} (id=${myId})`)

  // ── owner_user_id 列の追加 ─────────────────────────────────────
  for (const t of OWNER_TABLES) {
    await sql.query(
      `ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS owner_user_id INT REFERENCES users(id) ON DELETE CASCADE`
    )
  }

  // ── バックフィル ───────────────────────────────────────────────
  // card_type を直接持つテーブル
  for (const t of ['cards', 'categories', 'budgets', 'incomes']) {
    const r = await sql.query(
      `UPDATE "${t}" SET owner_user_id = $1 WHERE card_type <> 'joint' AND owner_user_id IS NULL`,
      [myId]
    )
    console.log(`  ${t}: ${r.length ?? 0} 件を個人へ（joint行はNULLのまま=共同）`)
  }

  // card_id 経由で card_type を引くテーブル
  for (const t of ['transactions', 'recurring_expenses', 'csv_import_logs']) {
    await sql.query(
      `UPDATE "${t}" x SET owner_user_id = $1
       FROM cards c
       WHERE c.id = x.card_id AND c.card_type <> 'joint' AND x.owner_user_id IS NULL`,
      [myId]
    )
    // card_id が無い行（手入力の孤児など）は個人扱い
    await sql.query(
      `UPDATE "${t}" SET owner_user_id = $1 WHERE card_id IS NULL AND owner_user_id IS NULL`,
      [myId]
    )
  }

  // スコープ概念を持たなかったテーブル（既存行はすべて本人のもの）
  for (const t of ['assets', 'goals', 'monthly_plans', 'payslip_details', 'store_category_rules']) {
    await sql.query(`UPDATE "${t}" SET owner_user_id = $1 WHERE owner_user_id IS NULL`, [myId])
  }

  // ── UNIQUE 制約の張り替え ──────────────────────────────────────
  // 旧制約はユーザーを跨いで衝突するため、owner込みの式インデックスへ置き換える。
  // owner_user_id は共同でNULLになるので COALESCE(...,0) で正規化する（id=0は存在しない）。
  const dropConstraints = [
    ['cards', 'cards_name_cardtype_key'],
    ['categories', 'categories_name_cardtype_key'],
    ['budgets', 'budgets_category_cardtype_month_key'],
    ['assets', 'assets_month_key'],
    ['monthly_plans', 'monthly_plans_month_key'],
    ['payslip_details', 'payslip_details_payment_month_key'],
    ['store_category_rules', 'store_category_rules_keyword_key'],
  ]
  for (const [t, c] of dropConstraints) {
    await sql.query(`ALTER TABLE "${t}" DROP CONSTRAINT IF EXISTS "${c}"`)
  }

  const newIndexes = [
    ['cards_scope_key', 'cards', '(name, card_type, COALESCE(owner_user_id, 0))'],
    ['categories_scope_key', 'categories', '(name, card_type, COALESCE(owner_user_id, 0))'],
    ['budgets_scope_key', 'budgets', `(category, card_type, COALESCE(month, ''), COALESCE(owner_user_id, 0))`],
    ['assets_scope_key', 'assets', '(month, COALESCE(owner_user_id, 0))'],
    ['monthly_plans_scope_key', 'monthly_plans', '(month, COALESCE(owner_user_id, 0))'],
    ['payslip_details_scope_key', 'payslip_details', '(payment_month, COALESCE(owner_user_id, 0))'],
    ['store_rules_scope_key', 'store_category_rules', '(keyword, COALESCE(owner_user_id, 0))'],
  ]
  for (const [name, t, cols] of newIndexes) {
    await sql.query(`CREATE UNIQUE INDEX IF NOT EXISTS "${name}" ON "${t}" ${cols}`)
  }

  // 参照頻度の高いスコープ絞り込み用インデックス
  await sql`CREATE INDEX IF NOT EXISTS transactions_owner_date_idx ON transactions (owner_user_id, date)`
  await sql`CREATE INDEX IF NOT EXISTS incomes_owner_date_idx ON incomes (owner_user_id, date)`

  // ── 口座(accounts): cards を拡張 ───────────────────────────────
  // 既存の cards をそのまま「口座」として使う（カード/銀行/現金/電子マネー）。
  await sql`ALTER TABLE cards ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'card'`
  await sql`ALTER TABLE cards ADD COLUMN IF NOT EXISTS institution TEXT`
  await sql`ALTER TABLE cards ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE`
  // 「現金orPayPay」のような非カード口座を推定して種別を補正
  await sql`
    UPDATE cards SET kind = 'cash'
    WHERE kind = 'card' AND (name ILIKE '%現金%' OR name ILIKE '%paypay%' OR name ILIKE '%電子マネー%')
  `

  // 入金を口座に紐付けられるようにする（銀行CSVの入金行で必要）
  await sql`ALTER TABLE incomes ADD COLUMN IF NOT EXISTS account_id INT REFERENCES cards(id) ON DELETE SET NULL`

  // 銀行CSVの残高列を保持する
  await sql`
    CREATE TABLE IF NOT EXISTS account_balances (
      id SERIAL PRIMARY KEY,
      account_id INT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      balance BIGINT NOT NULL,
      source TEXT DEFAULT 'csv',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS account_balances_key ON account_balances (account_id, date)`

  // 取込ログを銀行CSVにも使えるように
  await sql`ALTER TABLE csv_import_logs ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'card'`
  await sql`ALTER TABLE csv_import_logs ADD COLUMN IF NOT EXISTS income_count INT NOT NULL DEFAULT 0`
}
