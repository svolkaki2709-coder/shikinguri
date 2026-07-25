import { neon } from '@neondatabase/serverless'
import fs from 'fs'
const env = fs.readFileSync('.env.local', 'utf-8')
const sql = neon(env.match(/DATABASE_URL="([^"]+)"/)[1])

console.log('=== users ===')
console.table(await sql`SELECT id, email, display_name, is_active FROM users`)

const tables = ['cards','categories','budgets','transactions','incomes','assets','goals',
  'monthly_plans','payslip_details','recurring_expenses','store_category_rules','csv_import_logs']

console.log('\n=== owner_user_id の分布（NULL=共同 / 1=柿岡さん個人）===')
for (const t of tables) {
  const r = await sql.query(
    `SELECT COALESCE(owner_user_id::text,'共同(NULL)') AS owner, COUNT(*)::int AS n
     FROM "${t}" GROUP BY 1 ORDER BY 1`)
  console.log(`${t}: ` + (r.length ? r.map(x => `${x.owner}=${x.n}`).join(' , ') : '(0件)'))
}

console.log('\n=== 未割当（owner_user_id IS NULL）の内訳が本当に joint 由来か検証 ===')
for (const t of ['cards','categories','budgets','incomes']) {
  const r = await sql.query(
    `SELECT card_type, COUNT(*)::int AS n FROM "${t}" WHERE owner_user_id IS NULL GROUP BY 1`)
  const bad = r.filter(x => x.card_type !== 'joint')
  console.log(`${t}: ${r.map(x=>`${x.card_type}=${x.n}`).join(' , ') || '(なし)'}` +
    (bad.length ? `  ★異常: joint以外がNULL` : ''))
}
const txBad = await sql`
  SELECT COUNT(*)::int AS n FROM transactions t
  JOIN cards c ON c.id = t.card_id
  WHERE t.owner_user_id IS NULL AND c.card_type <> 'joint'`
console.log(`transactions: joint以外なのにNULLの行 = ${txBad[0].n} (0であるべき)`)

console.log('\n=== cards（口座）===')
console.table(await sql`SELECT id, name, card_type, kind, owner_user_id, has_csv, active FROM cards ORDER BY sort_order`)

console.log('\n=== 新規テーブル/列 ===')
const cols = await sql`
  SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema='public' AND (
    (table_name='incomes' AND column_name='account_id') OR
    (table_name='cards' AND column_name IN ('kind','institution','active')) OR
    (table_name='csv_import_logs' AND column_name IN ('kind','income_count')))
  ORDER BY 1,2`
for (const c of cols) console.log(`  ${c.table_name}.${c.column_name}`)
const ab = await sql`SELECT COUNT(*)::int AS n FROM account_balances`
console.log(`  account_balances テーブル: ${ab[0].n} 件`)

console.log('\n=== UNIQUE インデックス ===')
const idx = await sql`
  SELECT indexname FROM pg_indexes
  WHERE schemaname='public' AND indexname LIKE '%scope_key' OR indexname LIKE '%_key'
  ORDER BY indexname`
for (const i of idx) console.log(`  ${i.indexname}`)
