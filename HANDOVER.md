# kakeibo-app 構造ドキュメント（AI引き継ぎ用）

> 別のAIがこのアプリの改修・調査を引き継ぐ際に読む前提のドキュメント。
> このファイルは実装の変更に合わせて随時更新すること（古いままだと誤った前提でコードを書く原因になる）。

---

## プロジェクト概要

**家計簿アプリ（社内用・個人利用）**。2ユーザー（本人＋パートナー）で使う想定。
支出・入金の記録、予算管理（月次・年次）、定期支出/入金の自動候補、給与明細の取込・分析、
CSVインポート、自動振り分けルール、明細分割（立替精算）などを持つ。

- **リポジトリ**: https://github.com/svolkaki2709-coder/shikinguri
- **本番URL**: Vercel自動デプロイ（`main`ブランチへpushで即反映。プレビュー環境は使わず本番直push運用）
- **ローカル起動**: `npm run dev`（ただし本人の運用ルールにより通常は使わない。型チェック+`npm run build`で確認し、pushしてVercel上のURLで見る）

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| フレームワーク | Next.js 16 (App Router, Turbopack) |
| 言語 | TypeScript |
| UI | Tailwind CSS v4（ダークテーマ固定。`bg-slate-900/950`, `text-slate-100/400`が基調） |
| DB | PostgreSQL (Neon Serverless) |
| 認証 | NextAuth.js v5 (`/auth.ts`)、Google OAuth |
| ホスティング | Vercel |
| DBクライアント | `@neondatabase/serverless`（`lib/db.ts`の`sql`タグ関数） |
| グラフ | recharts |

---

## マルチユーザー・スコープモデル（最重要）

もともと1人用だったアプリを、パートナーも使えるように「個人」「共同」の2スコープに拡張した。
**このスコープ規約を理解しないとどの機能も正しく直せない。**

- `owner_user_id IS NULL` → **共同**データ。世帯メンバー全員が見える・編集できる。
- `owner_user_id = <user.id>` → **個人**データ。本人だけが見える。パートナーの個人データは互いに一切見えない。
- UI上は `card_type`（`'self'` | `'joint'`）という昔からの表現を使い続けている。`'joint'` = 共同 = `owner_user_id IS NULL`、`'self'` = 個人 = `owner_user_id = 本人`。

`lib/session.ts` に規約と一緒にヘルパーがまとまっている：

```ts
requireUser()          // ログイン中ユーザー取得（未ログインならnull）
unauthorized()         // 401
forbidden()            // 403
ownerFor(cardType, userId)   // 'joint' → null、それ以外 → userId
cardTypeOf(ownerUserId)      // null → 'joint'、それ以外 → 'self'
```

**参照系クエリの鉄則**（すべてのAPIで徹底されているはず）:
```sql
WHERE (owner_user_id IS NULL OR owner_user_id = ${me.id})
```
これを一部だけに付け忘れると、「個人タブなのに共同データが混ざって見える／共同のはずが個人にしか見えない」系の不具合が起きる。過去に何度もこれが原因のバグを踏んでいる（自動振り分けルールの一覧、年次グラフの収入集計など）。

新規メンバーを追加すると `lib/seed.ts` の `seedPersonalSpace(userId)` が呼ばれ、その人専用のカテゴリ・支払方法（「現金orPayPay」）を自動生成する（個人スペースが空だと支出を記録できないため）。

---

## ディレクトリ構成

```
kakeibo-app/
├── app/
│   ├── icon.tsx / apple-icon.tsx  # ファビコン・ホーム画面アイコン（next/ogのImageResponseで動的生成）
│   ├── layout.tsx / providers.tsx
│   ├── dashboard/page.tsx        # ダッシュボード（今月の予算差引・予算超過カテゴリ）
│   ├── input/page.tsx            # 支出・入金の入力フォーム＋定期の未登録候補 ★よく触る
│   ├── history/page.tsx          # 明細履歴一覧・編集・分割（⑂ボタン）
│   ├── budget/page.tsx           # 予算管理（月次・年次） ★かなり大きい・よく触る
│   ├── budget-table/page.tsx     # 年次予算テーブル（budget/page.tsxの年次タブとは別画面）
│   ├── payslip-details/page.tsx  # 給与明細詳細・源泉税等の計算式モーダル
│   ├── import/page.tsx           # CSVインポート
│   ├── import-payslip/page.tsx   # 給与明細インポート
│   ├── settings/page.tsx         # 設定（口座・カテゴリ・振り分けルール・定期・予算・計画・メンバー） ★かなり大きい・よく触る
│   ├── assets/page.tsx           # 資産管理
│   └── api/
│       ├── transactions/route.ts        # 支出CRUD
│       ├── transactions/split/route.ts  # 明細の分割（立替精算用。合計が元金額と一致必須）
│       ├── income/route.ts              # 入金CRUD
│       ├── history/route.ts             # transactions + incomes をUNION ALLで返す
│       ├── budget/route.ts               # 月次予算実績
│       ├── budget-table/route.ts         # 年次予算テーブル用データ
│       ├── categories/route.ts           # カテゴリマスタ（group_type一括再分類のPATCHも持つ）
│       ├── categories/reassign/route.ts  # カテゴリの一括付け替え
│       ├── cards/route.ts                # 口座・支払方法マスタ
│       ├── store-rules/route.ts          # 自動振り分けルール（CSVメモ→カテゴリ）
│       ├── recurring/route.ts            # 定期支出/入金テンプレート（GET/POST/PATCH/DELETE/PUT一括生成）
│       ├── recurring/skip/route.ts       # 定期項目を「この月だけスキップ」
│       ├── uncategorized-memos/route.ts  # 未分類明細の店舗名一覧
│       ├── members/route.ts              # 世帯メンバーの招待・停止・削除
│       ├── setup/route.ts                # 個人スペースの手動再作成
│       ├── payslip-details/route.ts
│       ├── import-csv/route.ts
│       └── import-payslip/route.ts
├── components/
│   ├── BottomNav.tsx / SideNav.tsx   # スマホ/PC表示でナビが切り替わる
│   ├── PageHeader.tsx
│   ├── ViewModeContext.tsx           # PC/スマホ表示切替コンテキスト（useViewMode）
│   ├── QuickInput.tsx                # クイック入力モーダル
│   ├── SplitTransactionModal.tsx     # 明細分割モーダル
│   └── MembersPanel.tsx              # 世帯メンバー管理パネル（設定画面から使用）
├── lib/
│   ├── db.ts        # Neon DB接続・初期スキーマ定義（`sql`タグ関数）
│   ├── session.ts   # 認証・スコープ規約ヘルパー（上記参照）
│   ├── seed.ts       # 新規メンバーの個人スペース初期化
│   └── csv.ts        # CSV解析共通処理
├── scripts/
│   ├── migrate.mjs           # migrations/*.mjs を`schema_migrations`テーブルで冪等に適用
│   ├── migrations/*.mjs      # 各マイグレーション（`{id, up(sql)}`をexport）
│   └── dump_schema.mjs       # 本番DBの現在のスキーマ・行数・制約を出力（構造調査用）
└── auth.ts          # NextAuth設定
```

---

## DBスキーマ（主要テーブル・2026年8月時点）

ほぼ全テーブルに `owner_user_id INT REFERENCES users(id) ON DELETE CASCADE` があり、上記スコープ規約に従う。

### `users`
```
id, email, display_name, is_active, role('owner'|'member'), created_at
```
`role='owner'`が世帯の管理者（メンバー追加・削除・停止ができる）。

### `transactions`（支出）
```
id, date, card_id→cards, category, amount, memo, source('manual'|'recurring'|'csv'),
type('self'|'joint' ※古い列・実質未使用), card_id, source, owner_user_id,
import_log_id, split_group_id
```
`split_group_id`: 1件の明細を分割した際、分割後の複数行を束ねるグループID（`transactions/split`で使用）。

### `incomes`（入金・控除）
```
id, date, amount, category, memo, card_type('self'/'joint'), owner_user_id,
account_id→cards, import_log_id
```
⚠️ `amount`は負値あり（給与源泉税、返済 等）。入金画面には負値レコードは表示しない（フィルタ済み）。

### `categories`（カテゴリマスタ）
```
id, name, card_type('self'/'joint'), group_type, sign('plus'/'minus'/'neutral'),
sort_order, owner_user_id
```
- `group_type`: `収入` / `支出` / `振替` / `投資` / `貯蓄` / `立替` / `税金`（2026年8月に追加。給与源泉税など「収入でも支出でもない」ものを別枠に分離する用途）
- `sign='plus'`→収入系（入金フォームに表示）、`sign='minus'`→支出系（支出フォームに表示）
- `sign`が未設定なら`group_type`から推測（`getEffectiveSign`/`effSign`関数、複数ファイルにほぼ同じ実装が重複して存在する点に注意）
- 予算ページ上部サマリーの「支出」「予算」は **`group_type==='支出'`のみ** を対象にする（投資・貯蓄・税金・立替はsign=-1でも含めない。2026年8月に変更）

### `cards`（口座・支払方法）
```
id, name, card_type('self'/'joint'), color, sort_order, has_csv, owner_user_id,
kind('card'|'bank'|'cash'等), institution, active
```

### `budgets`
```
id, category, amount, card_type, month, is_from_month, owner_user_id
```
`month`がNULL＝毎月共通予算、値あり＝その月だけ（`is_from_month`ならその月以降ずっと）。

### `recurring_expenses`（定期支出/入金テンプレート）
```
id, day_of_month, card_id→cards, category, amount, memo, active,
entry_type('expense'|'income'), owner_user_id
```
`entry_type`で確定時の投入先テーブルが分岐する（`expense`→`transactions`、`income`→`incomes`）。
過去にこの分岐が実装されておらず、入金の定期項目が常にtransactionsへ登録されて重複・誤分類する不具合があった（修正済み）。

### `recurring_skips`（定期項目の月次スキップ、2026年8月追加）
```
id, recurring_id→recurring_expenses, month, created_at
UNIQUE(recurring_id, month)
```
「この月だけ対象外にする」を記録。`/api/recurring?pending=true&month=`のクエリで
`NOT EXISTS`条件として使われ、スキップ済みの項目は未登録候補に出てこなくなる。

### `store_category_rules`（自動振り分けルール）
```
id, keyword, category, owner_user_id, created_at
```
CSVインポート時、メモに`keyword`を含む明細に`category`を自動設定する。
新規作成時に`card_type`を送らないと`owner_user_id`が本人固定になり、共同明細への遡及適用が0件になる不具合があった（修正済み・`app/settings/page.tsx`の`handleSaveRule`で`card_type: catViewType`を明示送信）。
`/api/store-rules`のGETは`card_type`クエリでスコープを厳密に絞れる（省略時は個人+共同の合算、互換用）。

### `payslip_details`（給与明細）
```
id, payment_month, gross_pay, net_pay, income_tax, resident_tax, health_insurance,
pension, employment_insurance, travel_reimbursement, nontaxable_commute,
taxable_commute, total_deduction, year_end_adjustment, owner_user_id
```
課税対象 = `gross_pay - nontaxable_commute - travel_reimbursement`。源泉税・社保はこのベースで計算。

### その他
- `assets`: 月次資産スナップショット（savings_balance, investment_balance）
- `goals`: 目標（現状ほぼ未使用）
- `monthly_plans`: 月次貯蓄・投資計画（savings_target, nisa_target）
- `csv_import_logs`: CSVインポート履歴（重複インポート防止に使用）
- `account_balances`: 口座残高スナップショット（CSVの残高列から）
- `joint_rules`: 共同費用の分担ルール（現状ほぼ未使用）
- `schema_migrations`: `scripts/migrate.mjs`の適用済みマイグレーションID記録

---

## 重要ロジック・落とし穴

### getEffectiveSign / effSign（カテゴリの符号判定）
複数ファイル（`app/budget/page.tsx`, `app/input/page.tsx`等）にほぼ同じ実装が独立して存在する：
```typescript
function getEffectiveSign(r): number {
  if (r.sign === "plus") return 1
  if (r.sign === "minus") return -1
  if (r.sign === "neutral") return 0
  if (r.groupType === "収入") return 1
  if (r.groupType === "振替") return 0
  if (r.groupType === "立替") return r.category.includes("精算") ? 1 : -1
  return -1  // 支出・投資・貯蓄・税金・未設定
}
```
共通化されていないため、符号判定ロジックを変える時は**全ファイルを検索して直す**こと。

### 予算ページ（`app/budget/page.tsx`）の状態管理
- `month` / `mainTab` / `cardTypeFilter` / `year` / `yearCardTypeFilter` / `viewMode` は全てURLクエリ（`?month=` `?tab=` `?ct=` `?year=` `?yct=` `?vm=`）と同期する設計。**新しいstateを追加したら同様にURL同期の setter wrapper を書くこと**（`month`だけこの同期が漏れていて「リロードすると今月に戻る」不具合があった＝修正済みだが同種のミスは再発しやすい）。
- インライン編集input（予算金額など）は `ref={focusAndSelect}`（マウント直後に確実にfocus+select）を使う。`autoFocus` + `onFocus`のみに頼ると環境によって全選択が効かず、既存値の先頭に入力文字が混入する不具合があった。
- 金額編集inputに`onClick`で`select()`すると、2回目以降のクリック（カーソル位置調整）でも毎回全選択されてしまい部分編集できない。全選択は`onFocus`（初回フォーカス時のみ）で行うこと。
- ドリルダウンモーダル内の`<select>`・`<input>`には必ず`bg-slate-900`を明示すること。`text-slate-100`だけだとブラウザデフォルトの白背景に白文字同然になり読めなくなる（ダークテーマ全体のルール）。

### history API（UNION ALL）
`/api/history`はtransactionsとincomesをUNION ALLで返す。incomeのsourceは`'income'`固定、history画面で色分け・削除エンドポイントを切り替える。

### 定期支出/入金（`/api/recurring`）
- `pending=true&month=`で「その月の未登録候補」を返す。過去月は全日経過済み扱い、今月は`day_of_month <= 今日`、未来月は対象外。
- `recurring_skips`にある項目は候補から除外。
- 確定時（`app/input/page.tsx`の`handleConfirmRecurring`）は`entry_type`で`/api/income`か`/api/transactions`に振り分ける。
- 入力画面の「定期（未登録）」バナーは、未登録が0件でも**常に表示**する（月切り替えボタンをバナーの外に出さず、バナー自体を条件表示にしていたため、0件になった月で切り替え手段が消える不具合があった＝修正済み）。

### 給与明細の課税ベース計算
```
課税対象 = gross_pay - nontaxable_commute - travel_reimbursement
```
源泉税・社保の料率はこのベースに対して計算する（支給合計ではない）。

---

## 画面ごとのメモ

### `/input`（入力）
- タブ: 支出 / 入金
- 各タブ上部に「定期（未登録）」バナー：対象月を‹›で切り替え可能（過去に遡って登録漏れを確認できる）、各項目に「スキップ」（この月だけ対象外）「確定」ボタン、金額はその場で上書き入力可能
- 入金履歴はプラスのみ表示（マイナス非表示）

### `/budget`（予算管理）
- タブ: 月次 / 年次
- 月次上部サマリー: 収入 / 支出 / 予算 / 予実差（支出グループのみ集計。投資・貯蓄・税金は含めない）
- 月次: プログレスバー形式、実績クリック→明細ドリルダウンモーダル（日付・カテゴリ・メモ・金額をその場で編集可）
- 年次: 月×カテゴリのテーブル、期間計列あり、実績クリック→ドリルダウン
- グループ（収入/支出/振替/投資/貯蓄/立替/税金）ごとに色分けされたボックスで表示。カテゴリのグループはカテゴリ一覧のドロップダウンで手動変更できる

### `/settings`（設定）
- タブ: 口座・カテゴリ / 定期 / 予算 / 計画 / メンバー
- 「口座・カテゴリ」タブの4ブロック（口座・カテゴリ一覧・自動振り分けルール・未分類明細）は**単一の個人/共同トグル（`catViewType`）**で統一されており、タブ上部に「個人/共同のデータを表示中」の大きなバナーで現在のスコープを明示する（以前は口座ブロックだけ別トグルを持っていて、スコープ不一致に気付きにくい構造だった＝修正済み）
- 「登録済み定期」一覧：カテゴリ名クリックでプルダウンに切り替わり、その場で変更・保存できる
- 「メンバー」タブ：世帯メンバーの招待（Googleアカウントのメールアドレス登録）・停止・削除、個人スペース初期化状況の表示

### `/history`（明細履歴）
- transactions + incomes をUNION ALLで表示
- 入金は緑バッジ「収入」表示
- キーワード・カテゴリ・月・カードでフィルタ
- ⑂ボタンで明細分割（立替精算用。合計金額が元の金額と一致する必要あり）

### `/payslip-details`（給与明細詳細）
- 月別テーブル、各金額クリック→計算式モーダル（課税対象ベース）

---

## 新PCでの環境構築手順

```bash
git clone https://github.com/svolkaki2709-coder/shikinguri.git kakeibo-app
cd kakeibo-app
npm install
# .env.local を作成（DATABASE_URL / NEXTAUTH_SECRET / NEXTAUTH_URL / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET）
npm run dev
```
`.env.local`はgit管理外。Vercelのダッシュボードから環境変数を確認してコピーすること。

DB構造を確認したい時は `node scripts/dump_schema.mjs` で本番DBの現在のテーブル定義・行数・制約を出力できる。
新しいマイグレーションは `scripts/migrations/NNN_名前.mjs` に `{id, up(sql)}` をexportする形で追加し、`node scripts/migrate.mjs` で適用する。

---

## 運用ルール（このプロジェクトに特有の作業フロー）

- **コード編集後は必ず `npm run build` で確認 → `git push`** までする（Vercel自動デプロイ、pushで即反映）。プレビュー確認はローカルdevサーバーではなく本番URLで行う。
- pushは通常のGit認証（Windows Credential Manager／`shikinguri-deploy`という名前のPAT）で行う。認証エラーが出た場合は他のGitHub運用アカウント（`ma-aidma`等）と混線している可能性があるため、リポジトリ専用PATをURLに一時的に埋め込んでpushし、直後にremote URLから除去する（グローバルな認証情報は変更しない）。
- 金額フィールドは常にカンマ区切り表示（`toLocaleString("ja-JP")`）。編集用inputは`onChange`で桁区切りを再フォーマットしつつ、`ref={focusAndSelect}`かそれに準じる方法でフォーカス時に全選択させる。
- ダークテーマ固定。`bg-slate-900`系の背景に対して`text-slate-100`系の文字色、input/select には必ず両方を明示する。
- タブ・フィルタ等のページ内状態はURLクエリパラメータに同期させ、リロードしても状態が保持されるようにする。
- ログイン後は元いたページへリダイレクト（callbackUrl）。
- 返答・コメント・変数名は日本語OK。
