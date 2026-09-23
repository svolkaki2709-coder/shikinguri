/**
 * 予算レコードが「毎年くり返すもの」かどうかを持たせる。
 *
 * 月別の予算には2種類ある。
 *   ・隔月請求（水道代など）… 毎年くり返す。年額に含めてよい
 *   ・その月だけの単発予算 … 今年かぎり。翌年以降の見込みに含めると過大になる
 * これまで両方とも同じ形で保存していたため区別できなかった。
 *
 * recurring=TRUE は隔月のようにくり返すもの。既定は FALSE（単発）。
 */

export const id = '013_budget_recurring'

export async function up(sql) {
  await sql`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS recurring BOOLEAN NOT NULL DEFAULT FALSE`
}
