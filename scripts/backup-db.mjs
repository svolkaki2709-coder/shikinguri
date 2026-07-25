// 全テーブルをJSONへダンプする。破壊的変更の前に必ず実行する。
import { neon } from '@neondatabase/serverless'
import fs from 'fs'
import path from 'path'

const env = fs.readFileSync('.env.local', 'utf-8')
const sql = neon(env.match(/DATABASE_URL="([^"]+)"/)[1])

const stamp = process.argv[2]
if (!stamp) {
  console.error('usage: node scripts/backup-db.mjs <YYYYMMDD-HHmm>')
  process.exit(1)
}

const tables = (await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name
`).map(r => r.table_name)

const dir = path.join('backups', stamp)
fs.mkdirSync(dir, { recursive: true })

const summary = {}
for (const t of tables) {
  const rows = await sql.query(`SELECT * FROM "${t}"`)
  fs.writeFileSync(path.join(dir, `${t}.json`), JSON.stringify(rows, null, 2), 'utf-8')
  summary[t] = rows.length
  console.log(`${t}: ${rows.length} rows`)
}
fs.writeFileSync(path.join(dir, '_summary.json'), JSON.stringify(summary, null, 2), 'utf-8')
console.log(`\nbackup written to ${dir}`)
