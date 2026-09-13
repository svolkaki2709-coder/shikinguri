/**
 * 自動振り分けルールを、口座（カード）ごとに分けられるようにする。
 *
 * 同じ店名でも、どのカードで払ったかで意味が変わることがある
 * （例：あるカードの「GOOGLE」はサブスク、別カードでは仕事の経費）。
 * これまではキーワード1つにつきカテゴリ1つしか持てなかった。
 *
 * card_id が NULL のルールは「すべての口座に効く」共通ルール。
 * 取り込み時は、その口座専用のルールを優先し、無ければ共通ルールを使う。
 */

export const id = '011_store_rule_card'

export async function up(sql) {
  await sql`
    ALTER TABLE store_category_rules
    ADD COLUMN IF NOT EXISTS card_id INT REFERENCES cards(id) ON DELETE CASCADE
  `
  await sql`
    CREATE INDEX IF NOT EXISTS store_category_rules_card_idx
    ON store_category_rules (card_id)
  `
}
