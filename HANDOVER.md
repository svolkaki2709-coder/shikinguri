# kakeibo-app 引き継ぎドキュメント

> 新しいPCでこのファイルを読み込めば即作業再開できます。

---

## プロジェクト概要

**家計簿アプリ（社内用）**。支出・入金の記録・予算管理・給与明細取込を一元管理するWebアプリ。

- **リポジトリ**: https://github.com/svolkaki2709-coder/shikinguri
- **本番URL**: Vercel自動デプロイ（`main`ブランチへpushで即反映）
- **ローカル起動**: `npm run dev`（ポート3000）

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| フレームワーク | Next.js 16 (App Router) |
| 言語 | TypeScript |
| UI | Tailwind CSS |
| DB | PostgreSQL (Neon Serverless) |
| 認証 | NextAuth.js (`/auth.ts`) |
| ホスティング | Vercel |
| DBクライアント | `@neondatabase/serverless`（`lib/db.ts`の`sql`タグ関数） |

---

## ディレクトリ構成

```
kakeibo-app/
├── app/
│   ├── page.tsx               # トップ（リダイレクト）
│   ├── layout.tsx
│   ├── dashboard/page.tsx     # ダッシュボード
│   ├── input/page.tsx         # 支出・入金の入力フォーム ★よく触る
│   ├── history/page.tsx       # 明細履歴一覧
│   ├── budget/page.tsx        # 予算管理（月次・年次） ★よく触る
│   ├── payslip-details/page.tsx # 給与明細詳細・源泉税計算
│   ├── import/page.tsx        # CSVインポート
│   ├── import-payslip/page.tsx # 給与明細インポート
│   ├── settings/page.tsx      # 設定（カード・カテゴリ管理）
│   ├── assets/page.tsx        # 資産管理
│   └── api/
│       ├── transactions/route.ts  # 支出CRUD (GET/POST/PATCH/DELETE)
│       ├── income/route.ts        # 入金CRUD (GET/POST/PUT/DELETE)
│       ├── history/route.ts       # 履歴取得（transactions + incomes UNION ALL）
│       ├── budget/route.ts        # 月次予算実績
│       ├── budget-table/route.ts  # 年次予算テーブル
│       ├── categories/route.ts    # カテゴリマスタ
│       ├── cards/route.ts         # カードマスタ
│       ├── payslip-details/route.ts
│       ├── import-csv/route.ts
│       ├── import-payslip/route.ts
│       └── recurring/route.ts     # 定期支出テンプレート
├── components/
│   ├── BottomNav.tsx
│   ├── PageHeader.tsx
│   └── ViewModeContext.tsx    # PC/スマホ表示切替コンテキスト
├── lib/db.ts                  # Neon DB接続・初期スキーマ定義
└── auth.ts                    # NextAuth設定
```

---

## DBスキーマ（主要テーブル）

### `transactions`（支出）
```sql
id SERIAL PK, date DATE, card_id INT→cards, category VARCHAR,
amount INT, memo TEXT, source VARCHAR('manual'/'recurring'/'csv'), created_at
```

### `incomes`（入金・控除）
```sql
id SERIAL PK, date DATE, amount INT, category VARCHAR, memo TEXT,
card_type VARCHAR('self'/'joint'), created_at
```
⚠️ **重要**: `amount`は負値あり（給与源泉税=-66,957、返済=-49,000 等）  
　マイナスレコードは入金画面には**表示しない**（フィルタ済み）

### `categories`（カテゴリマスタ）
```sql
id, name, card_type('self'/'joint'), group_type('収入'/'支出'/'振替'/'投資'/'貯蓄'/'立替'),
sign('plus'/'minus'/'neutral'), sort_order
```
- `sign='plus'` → 収入系カテゴリ（入金フォームに表示）
- `sign='minus'` → 支出系カテゴリ（支出フォームに表示）
- `effSign()`関数でsign/group_typeから+1/-1/0を算出

### `cards`
```sql
id, name, card_type('self'/'joint'), color, sort_order, has_csv(BOOL)
```

### `budgets`
```sql
id, category, amount, card_type, is_monthly(BOOL), UNIQUE(category, card_type)
```

### `payslip_details`（給与明細）
```sql
id, month('YYYY-MM'), gross_pay, income_tax, resident_tax, health_insurance,
pension, employment_insurance, total_deduction, nontaxable_commute,
travel_reimbursement, net_pay, ...
```

---

## 重要ロジック

### effSign（カテゴリの符号判定）
```typescript
function effSign(r: CategoryRow): number {
  if (r.sign === "plus") return 1
  if (r.sign === "minus") return -1
  if (r.group_type === "収入") return 1
  if (r.group_type === "振替") return 0
  return -1
}
```

### budget APIのMath.abs処理
sign=-1カテゴリのactualが負値の場合、`Math.abs()`で正数化して予算比較に使う。

### history API（UNION ALL）
`/api/history`はtransactionsとincomesをUNION ALLで返す。  
incomeのsourceは`'income'`固定、history画面で色分け・削除エンドポイントを切り替え。

### 課税ベースの計算（給与明細）
```
課税対象 = gross_pay - nontaxable_commute - travel_reimbursement
```
源泉税・社保の料率はこのベースに対して計算（支給合計ではない）。

---

## 画面ごとのメモ

### `/input`（入力）
- タブ: 支出 / 入金
- 支出: カード選択 → カテゴリ → 日付 → 金額 → メモ
- 入金: 個人/共用切替 → 日付 → カテゴリ → 金額 → メモ
- 入金履歴はプラスのみ表示（マイナス非表示）
- 定期支出候補（未登録）をバナー表示・ワンタップ登録

### `/budget`（予算管理）
- タブ: 月次 / 年次
- 月次: プログレスバー形式、実績クリック→明細ドリルダウンモーダル
- 年次: 月×カテゴリのテーブル、期間計列あり、実績クリック→ドリルダウン
- ドリルダウンモーダル: 各行に ✎ ボタン、インライン編集（日付・カテゴリ・メモ・金額）
- 実績数字にCSS `underline decoration-dotted` でクリック可能を示唆

### `/history`（明細履歴）
- transactions + incomes を UNION ALL で表示
- 入金は緑バッジ「収入」表示
- キーワード・カテゴリ・月・カードでフィルタ

### `/payslip-details`（給与明細詳細）
- 月別テーブル
- 各金額クリック→計算式モーダル（例: 所得税 = 課税対象×税率）
- 料率表示は課税対象ベース

---

## 最近の主な変更（直近10コミット）

| コミット | 内容 |
|---------|------|
| 9e2f33b | ドリルダウンモーダルから明細の編集機能を追加 |
| 3c0f673 | 月次予算の実績金額クリックでドリルダウン |
| 64defeb | 「収入を記録」→「入金を記録」に変更 |
| 253d5a0 | 入金記録にマイナス金額を表示しない |
| 07c92b5 | 入金フォームに日付選択を追加、負の金額表示バグ修正 |
| 136d175 | 給与明細の各金額クリックで計算式モーダル |
| 0daed10 | 給与源泉の料率を課税対象ベースで計算 |
| 85aa2d4 | 年次テーブルの実績金額クリックでドリルダウン |
| （以前） | 年次テーブルに期間計列追加 |
| （以前） | history画面にincomesレコードを表示 |

---

## 新PCでの環境構築手順

```bash
# 1. リポジトリのクローン
git clone https://github.com/svolkaki2709-coder/shikinguri.git kakeibo-app
cd kakeibo-app

# 2. 依存インストール
npm install

# 3. 環境変数設定（.env.local を作成）
# DATABASE_URL=（NeonのPostgreSQL接続文字列）
# NEXTAUTH_SECRET=（既存の値を引き継ぐ）
# NEXTAUTH_URL=http://localhost:3000
# GOOGLE_CLIENT_ID=（GoogleOAuth）
# GOOGLE_CLIENT_SECRET=（GoogleOAuth）

# 4. 起動
npm run dev
```

> ⚠️ `.env.local`はgit管理外。Vercelのダッシュボードから環境変数を確認してコピーすること。

---

## コーディング規則

- **コード編集後は必ず `git push`** までする（Vercel自動デプロイ）
- 金額フィールドは **カンマ区切り**（`toLocaleString("ja-JP")`）
- input/textareaには **`text-gray-900`** を付与（デフォルト色が薄いため）
- ページ内タブ・viewModeは **URLパラメータに同期**（`?tab=` `?vm=` 等）
- ログイン後は**元いたページへリダイレクト**（callbackUrl）
- 返答・コメント・変数名は日本語OK
