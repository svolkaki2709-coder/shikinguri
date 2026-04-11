import { sql } from "@vercel/postgres"

export { sql }

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
