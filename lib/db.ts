import { neon } from "@neondatabase/serverless"

// 遅延初期化（ビルド時ではなく実行時に接続）
function getDb() {
  const url = process.env.DATABASE_URL ?? process.env.STORAGE_URL
  if (!url) throw new Error("DATABASE_URL is not set")
  return neon(url)
}

export async function sql<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  const db = getDb()
  return db(strings, ...values) as Promise<T[]>
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const db = getDb()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (db as any)(text, params) as Promise<T[]>
}

export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      sort_order INT DEFAULT 0
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      category VARCHAR(100) NOT NULL,
      amount INT NOT NULL,
      memo TEXT DEFAULT '',
      type VARCHAR(20) DEFAULT 'self',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS budgets (
      id SERIAL PRIMARY KEY,
      category VARCHAR(100) NOT NULL,
      amount INT NOT NULL,
      type VARCHAR(20) NOT NULL DEFAULT 'self',
      UNIQUE(category, type)
    )
  `
}
