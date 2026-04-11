import { neon } from "@neondatabase/serverless"

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

export async function initDb() {
  // カード（共用/変動費/固定費）
  await sql`
    CREATE TABLE IF NOT EXISTS cards (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) NOT NULL UNIQUE,
      card_type VARCHAR(20) NOT NULL DEFAULT 'self',
      color VARCHAR(20) DEFAULT '#6366f1',
      sort_order INT DEFAULT 0
    )
  `

  // カテゴリ
  await sql`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      sort_order INT DEFAULT 0
    )
  `

  // 支出明細（card_id追加）
  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      card_id INT REFERENCES cards(id) ON DELETE SET NULL,
      category VARCHAR(100) NOT NULL DEFAULT '未分類',
      amount INT NOT NULL,
      memo TEXT DEFAULT '',
      source VARCHAR(20) DEFAULT 'manual',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `

  // 収入
  await sql`
    CREATE TABLE IF NOT EXISTS incomes (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      amount INT NOT NULL,
      category VARCHAR(50) DEFAULT '給与',
      memo TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `

  // 資産スナップショット（月次）
  await sql`
    CREATE TABLE IF NOT EXISTS assets (
      id SERIAL PRIMARY KEY,
      month VARCHAR(7) NOT NULL UNIQUE,
      savings_balance INT DEFAULT 0,
      investment_balance INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `

  // 目標
  await sql`
    CREATE TABLE IF NOT EXISTS goals (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      target_amount INT NOT NULL,
      deadline DATE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `

  // 定期支出テンプレート
  await sql`
    CREATE TABLE IF NOT EXISTS recurring_expenses (
      id SERIAL PRIMARY KEY,
      day_of_month INT NOT NULL DEFAULT 1,
      card_id INT REFERENCES cards(id) ON DELETE SET NULL,
      category VARCHAR(100) NOT NULL,
      amount INT NOT NULL,
      memo TEXT DEFAULT '',
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `

  // 共同費用ルール
  await sql`
    CREATE TABLE IF NOT EXISTS joint_rules (
      id SERIAL PRIMARY KEY,
      monthly_contribution INT DEFAULT 0,
      self_ratio INT DEFAULT 50,
      partner_ratio INT DEFAULT 50,
      effective_from DATE DEFAULT CURRENT_DATE
    )
  `

  // 予算
  await sql`
    CREATE TABLE IF NOT EXISTS budgets (
      id SERIAL PRIMARY KEY,
      category VARCHAR(100) NOT NULL,
      amount INT NOT NULL,
      card_type VARCHAR(20) NOT NULL DEFAULT 'self',
      UNIQUE(category, card_type)
    )
  `

  // 初期カードデータ（3枚）
  await sql`
    INSERT INTO cards (name, card_type, color, sort_order) VALUES
      ('共用', 'joint', '#f59e0b', 1),
      ('変動費', 'self', '#6366f1', 2),
      ('固定費', 'self', '#10b981', 3)
    ON CONFLICT (name) DO NOTHING
  `

  // 初期カテゴリ
  await sql`
    INSERT INTO categories (name, sort_order) VALUES
      ('食費', 1), ('日用品', 2), ('交通費', 3), ('外食', 4),
      ('娯楽', 5), ('医療', 6), ('衣類', 7), ('美容', 8),
      ('通信費', 9), ('光熱費', 10), ('家賃', 11), ('保険', 12),
      ('サブスク', 13), ('投資', 14), ('貯金', 15), ('その他', 99)
    ON CONFLICT (name) DO NOTHING
  `
}
