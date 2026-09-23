/**
 * ライフイベントに月を持たせる。
 *
 * 年だけだと「2027年に結婚式、同じ年にご祝儀が入る」という前後関係が分からず、
 * 支払いが先・入金が後のときに資金がショートしても気づけない。
 *
 * month は 1〜12。NULL は未設定で、計算上は年の半ば（6月）として扱う。
 */

export const id = '012_life_event_month'

export async function up(sql) {
  await sql`ALTER TABLE life_events ADD COLUMN IF NOT EXISTS month INT`
  await sql`
    ALTER TABLE life_events
    ADD CONSTRAINT life_events_month_range CHECK (month IS NULL OR (month >= 1 AND month <= 12))
  `.catch(() => {})
}
