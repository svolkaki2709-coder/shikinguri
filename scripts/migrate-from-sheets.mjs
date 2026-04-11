import { google } from "googleapis"
import { createServer } from "http"
import { URL } from "url"
import open from "open"

const SPREADSHEET_ID = "1SEWj-C4rfLPkqZZgrPblOeR5NgwEkLvHeoOymn5w2To"
const APP_URL = "https://kakeibo-app-indol-eight.vercel.app"
const MIGRATION_SECRET = process.env.MIGRATION_SECRET || "migrate-secret-2024"

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const REDIRECT_URI = "http://localhost:3001/callback"

// OAuth認証フロー
async function getAccessToken() {
  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })

  console.log("\n以下のURLをブラウザで開いてください：")
  console.log(authUrl)
  console.log("\nまたは自動で開きます...")

  // コールバックを待つ
  const code = await new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, "http://localhost:3001")
      const code = url.searchParams.get("code")
      if (code) {
        res.end("認証完了！このウィンドウを閉じてください。")
        server.close()
        resolve(code)
      }
    })
    server.listen(3001, () => {
      try { open(authUrl) } catch {}
    })
  })

  const { tokens } = await oauth2Client.getToken(code)
  oauth2Client.setCredentials(tokens)
  return oauth2Client
}

async function getSheetValues(sheets, range) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  })
  return res.data.values || []
}

async function callMigrate(action, data) {
  const res = await fetch(`${APP_URL}/api/admin/migrate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-migration-secret": MIGRATION_SECRET,
    },
    body: JSON.stringify({ action, data }),
  })
  return res.json()
}

async function main() {
  console.log("=== スプレッドシート → DB 移行スクリプト ===\n")

  const auth = await getAccessToken()
  const sheets = google.sheets({ version: "v4", auth })

  // 1. カテゴリ移行
  console.log("1. カテゴリ読み込み中...")
  const catRows = await getSheetValues(sheets, "カテゴリマスタ!A2:A50")
  const categories = catRows.flat().filter(Boolean)
  console.log(`   ${categories.length}件: ${categories.join(", ")}`)
  const catResult = await callMigrate("import_categories", categories)
  console.log("   結果:", catResult)

  // 2. 明細履歴移行
  console.log("\n2. 取引履歴読み込み中...")
  const txRows = await getSheetValues(sheets, "明細_全履歴!A2:E5000")
  const transactions = txRows
    .filter(row => row[0] && row[2])
    .map(([date, category, amount, memo, type]) => ({
      date,
      category: category || "その他",
      amount: parseInt(String(amount).replace(/[^0-9-]/g, "")) || 0,
      memo: memo || "",
      type: type || "self",
    }))
    .filter(t => t.amount !== 0)
  console.log(`   ${transactions.length}件`)

  // バッチで送信（100件ずつ）
  for (let i = 0; i < transactions.length; i += 100) {
    const batch = transactions.slice(i, i + 100)
    const result = await callMigrate("import_transactions", batch)
    console.log(`   ${i + batch.length}/${transactions.length} 件完了`)
  }

  // 3. 予算_自分
  console.log("\n3. 予算（自分）読み込み中...")
  const selfBudgetRows = await getSheetValues(sheets, "予算_自分!A2:C50")
  const selfBudgets = selfBudgetRows
    .filter(r => r[0] && r[1])
    .map(([category, amount]) => ({
      category,
      amount: parseInt(String(amount).replace(/[^0-9-]/g, "")) || 0,
      type: "self",
    }))
    .filter(b => b.amount > 0)
  if (selfBudgets.length > 0) {
    const result = await callMigrate("import_budgets", selfBudgets)
    console.log(`   ${selfBudgets.length}件:`, result)
  }

  // 4. 予算_共同
  console.log("\n4. 予算（共同）読み込み中...")
  const jointBudgetRows = await getSheetValues(sheets, "予算_共同!A2:C50")
  const jointBudgets = jointBudgetRows
    .filter(r => r[0] && r[1])
    .map(([category, amount]) => ({
      category,
      amount: parseInt(String(amount).replace(/[^0-9-]/g, "")) || 0,
      type: "joint",
    }))
    .filter(b => b.amount > 0)
  if (jointBudgets.length > 0) {
    const result = await callMigrate("import_budgets", jointBudgets)
    console.log(`   ${jointBudgets.length}件:`, result)
  }

  console.log("\n✅ 移行完了！")
}

main().catch(console.error)
