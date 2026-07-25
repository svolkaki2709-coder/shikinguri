import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf-8');
const m = env.match(/DATABASE_URL="([^"]+)"/);
const sql = neon(m[1]);

const cols = await sql`
  SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position
`;
let cur = null;
for (const c of cols) {
  if (c.table_name !== cur) { cur = c.table_name; console.log(`\n=== ${cur} ===`); }
  console.log(`  ${c.column_name} ${c.data_type}${c.is_nullable === 'NO' ? ' NOT NULL' : ''}${c.column_default ? ' DEFAULT ' + c.column_default : ''}`);
}

console.log("\n\n=== ROW COUNTS ===");
const tables = [...new Set(cols.map(c => c.table_name))];
for (const t of tables) {
  const r = await sql.query(`SELECT COUNT(*)::int AS n FROM "${t}"`);
  console.log(`${t}: ${r[0].n}`);
}

console.log("\n=== CONSTRAINTS ===");
const cons = await sql`
  SELECT conrelid::regclass AS tbl, conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
  WHERE connamespace = 'public'::regnamespace
  ORDER BY conrelid::regclass::text, conname
`;
for (const c of cons) console.log(`${c.tbl}: ${c.conname} — ${c.def}`);
