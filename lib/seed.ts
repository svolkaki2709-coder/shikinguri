import { sql } from "@/lib/db"

/**
 * 新しいメンバーの「個人」スペースの初期セットアップ。
 *
 * カテゴリも支払方法もすべて所有者に紐づくため、招待されたばかりのメンバーの
 * 個人タブは完全に空で、そのままでは1件も記録できない。
 * 最低限のカテゴリと現金の支払方法を用意して、ログインしてすぐ使える状態にする。
 *
 * 冪等。すでに個人カテゴリがあれば何もしない。
 */

const DEFAULT_CATEGORIES: Array<{ name: string; group: string; sign?: string }> = [
  { name: "給与", group: "収入" },
  { name: "臨時収入", group: "収入" },

  { name: "食費", group: "支出" },
  { name: "外食", group: "支出" },
  { name: "日用品", group: "支出" },
  { name: "交通費", group: "支出" },
  { name: "通信費", group: "支出" },
  { name: "サブスク", group: "支出" },
  { name: "医療費", group: "支出" },
  { name: "美容", group: "支出" },
  { name: "衣類", group: "支出" },
  { name: "交際費", group: "支出" },
  { name: "保険", group: "支出" },
  { name: "税金", group: "支出" },
  { name: "共同口座振替", group: "支出" },
  { name: "その他", group: "支出" },

  { name: "貯蓄", group: "貯蓄" },
  { name: "投資", group: "投資" },

  { name: "立替費用", group: "立替" },
  { name: "立替精算", group: "立替", sign: "plus" },

  { name: "振替", group: "振替", sign: "neutral" },
  { name: "未分類", group: "支出" },
]

export interface SeedResult {
  seeded: boolean
  categories: number
  accounts: number
}

export async function seedPersonalSpace(userId: number): Promise<SeedResult> {
  const [{ n }] = await sql<{ n: number }>`
    SELECT COUNT(*)::int AS n FROM categories WHERE owner_user_id = ${userId}
  `
  if (n > 0) return { seeded: false, categories: 0, accounts: 0 }

  let categories = 0
  for (const [i, c] of DEFAULT_CATEGORIES.entries()) {
    await sql`
      INSERT INTO categories (name, card_type, group_type, sign, sort_order, owner_user_id)
      VALUES (${c.name}, 'self', ${c.group}, ${c.sign ?? null}, ${i + 1}, ${userId})
    `
    categories++
  }

  // 現金・電子マネー用の支払方法。これが無いと支出を1件も記録できない
  const [{ m }] = await sql<{ m: number }>`
    SELECT COUNT(*)::int AS m FROM cards WHERE owner_user_id = ${userId}
  `
  let accounts = 0
  if (m === 0) {
    await sql`
      INSERT INTO cards (name, card_type, color, sort_order, kind, owner_user_id)
      VALUES ('現金orPayPay', 'self', '#6366f1', 1, 'cash', ${userId})
    `
    accounts = 1
  }

  return { seeded: true, categories, accounts }
}
