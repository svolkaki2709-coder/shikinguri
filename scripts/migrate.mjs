/**
 * マイグレーションランナー。
 *   node scripts/migrate.mjs          … 未適用のマイグレーションを実行
 *   node scripts/migrate.mjs --status … 適用状況の確認のみ
 */
import { neon } from '@neondatabase/serverless'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

const env = fs.readFileSync('.env.local', 'utf-8')
const sql = neon(env.match(/DATABASE_URL="([^"]+)"/)[1])

const PRIMARY_EMAIL = 's.vol.kaki2709@gmail.com'
const PRIMARY_NAME = '柿岡慎也'

await sql`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT NOW()
  )
`

const applied = new Set((await sql`SELECT id FROM schema_migrations`).map(r => r.id))

const dir = path.join('scripts', 'migrations')
const files = fs.readdirSync(dir).filter(f => f.endsWith('.mjs')).sort()

if (process.argv.includes('--status')) {
  for (const f of files) {
    const mod = await import(pathToFileURL(path.resolve(dir, f)).href)
    console.log(`${applied.has(mod.id) ? '[適用済]' : '[未適用]'} ${mod.id}`)
  }
  process.exit(0)
}

for (const f of files) {
  const mod = await import(pathToFileURL(path.resolve(dir, f)).href)
  if (applied.has(mod.id)) {
    console.log(`skip  ${mod.id}`)
    continue
  }
  console.log(`apply ${mod.id}`)
  await mod.up(sql, { primaryEmail: PRIMARY_EMAIL, primaryName: PRIMARY_NAME })
  await sql`INSERT INTO schema_migrations (id) VALUES (${mod.id})`
  console.log(`done  ${mod.id}`)
}
console.log('\nマイグレーション完了')
