import { NextResponse } from "next/server"

/**
 * 旧・初期セットアップ／一括投入用エンドポイント。
 *
 * どの action も owner_user_id を設定せずに書き込むため、マルチユーザー化以降は
 * 所有者不明のデータを作ってしまう（誰の画面にも出ない、または個人と共同の境界が壊れる）。
 * initDb() に至っては古いスキーマでテーブルを作り直し、owner込みのユニーク制約を
 * 巻き戻す。危険なため無効化した。
 *
 * スキーマ変更は scripts/migrations 配下に追加し、
 *   node scripts/migrate.mjs
 * で適用すること。
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "このエンドポイントは廃止されました。スキーマ変更は scripts/migrations に追加し node scripts/migrate.mjs を実行してください。",
    },
    { status: 410 }
  )
}
