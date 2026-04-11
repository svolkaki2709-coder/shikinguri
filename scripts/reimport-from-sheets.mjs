/**
 * スプレッドシートからカテゴリ・取引データを直接DBに再インポート
 * 実行: node scripts/reimport-from-sheets.mjs
 */
import { google } from "googleapis"
import { createServer } from "http"
import { URL } from "url"
import { neon } from "@neondatabase/serverless"
import { readFileSync } from "fs"

// .env.local から環境変数を読み込み
const envContent = readFileSync(".env.local", "utf8")
const env = Object.fromEntries(
  envContent.split("\n")
    .filter(l => l.includes("="))
    .map(l => {
      const idx = l.indexOf("=")
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, "")]
    })
)

const CLIENT_ID = env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET
const DATABASE_URL = env.DATABASE_URL
const SPREADSHEET_ID = "1SEWj-C4rfLPkqZZgrPblOeR5NgwEkLvHeoOymn5w2To"
const REDIRECT_URI = "http://localhost:3002/callback"

const sql = neon(DATABASE_URL)

// ── OAuth認証 ──────────────────────────────────
async function getAccessToken() {
  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })

  console.log("\n📋 以下のURLをブラウザで開いてGoogleアカウントを認証してください:")
  console.log(authUrl)
  console.log("\n認証後、ブラウザのURLに表示されるcodeを待ちます...")

  const code = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, "http://localhost:3001")
      const code = url.searchParams.get("code")
      if (code) {
        res.end("<h1>認証完了！このウィンドウを閉じてください。</h1>")
        server.close()
        resolve(code)
      } else {
        res.end("<h1>エラー</h1>")
        reject(new Error("認証失敗"))
      }
    })
    server.listen(3002, () => console.log("✅ localhost:3002 で待機中..."))
    setTimeout(() => reject(new Error("タイムアウト（5分）")), 300000)
  })

  const { tokens } = await oauth2Client.getToken(code)
  oauth2Client.setCredentials(tokens)
  return oauth2Client
}

async function getValues(sheets, range) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range })
  return res.data.values || []
}

// ── メイン ────────────────────────────────────
async function main() {
  console.log("=== スプレッドシート再インポート ===\n")
  const auth = await getAccessToken()
  const sheets = google.sheets({ version: "v4", auth })

  // ①シート名一覧取得
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets.properties" })
  const sheetList = meta.data.sheets.map(s => ({ id: s.properties.sheetId, title: s.properties.title }))
  console.log("\n📊 シート一覧:")
  sheetList.forEach(s => console.log(`  gid=${s.id} : ${s.title}`))

  // ②カテゴリマスタ
  console.log("\n📁 カテゴリマスタ読み込み...")
  try {
    const catRows = await getValues(sheets, "カテゴリマスタ!A2:A100")
    const cats = catRows.flat().filter(Boolean)
    console.log(`  ${cats.length}件: ${cats.slice(0,5).join(", ")}...`)
    // カテゴリをDBに保存（既存の正しいカテゴリは上書きしない）
    for (const name of cats) {
      if (name && name.length < 50) { // 店舗名（長い）は除外
        await sql`INSERT INTO categories (name) VALUES (${name}) ON CONFLICT DO NOTHING`
      }
    }
  } catch(e) { console.log("  スキップ:", e.message) }

  // ③明細_全履歴 → transactionsの category/card_id を更新
  console.log("\n📋 取引履歴 読み込み中（時間がかかります）...")
  try {
    const txRows = await getValues(sheets, "明細_全履歴!A2:F5000")
    const transactions = txRows
      .filter(r => r[0] && r[2])
      .map(([date, category, amount, memo, type, cardName]) => ({
        date: date.trim(),
        category: (category || "").trim() || "未分類",
        amount: parseInt(String(amount).replace(/[^0-9-]/g, "")) || 0,
        memo: (memo || "").trim(),
        type: (type || "self").trim(),
        cardName: (cardName || "").trim(),
      }))
      .filter(t => t.amount !== 0)

    console.log(`  ${transactions.length}件 取得`)
    console.log(`  カテゴリ例: ${[...new Set(transactions.map(t=>t.category))].slice(0,8).join(", ")}`)

    // カテゴリ分布
    const catDist = {}
    transactions.forEach(t => { catDist[t.category] = (catDist[t.category]||0) + 1 })
    console.log("\n  カテゴリ分布（上位10）:")
    Object.entries(catDist).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([k,v]) => console.log(`    ${k}: ${v}件`))

  } catch(e) { console.log("  エラー:", e.message) }

  // ④予算_自分
  console.log("\n💰 予算_自分 読み込み...")
  try {
    const selfRows = await getValues(sheets, "予算_自分!A2:B50")
    const selfBudgets = selfRows.filter(r => r[0] && r[1]).map(([cat, amt]) => ({
      category: cat.trim(),
      amount: parseInt(String(amt).replace(/[^0-9]/g, "")) || 0,
      card_type: "self"
    })).filter(b => b.amount > 0)
    console.log(`  ${selfBudgets.length}件: ${selfBudgets.map(b=>`${b.category}¥${b.amount}`).join(", ")}`)
    for (const b of selfBudgets) {
      await sql`INSERT INTO budgets (category, amount, card_type) VALUES (${b.category}, ${b.amount}, ${b.card_type}) ON CONFLICT (category, card_type) DO UPDATE SET amount = EXCLUDED.amount`
    }
  } catch(e) { console.log("  エラー:", e.message) }

  // ⑤予算_共同
  console.log("\n💰 予算_共同 読み込み...")
  try {
    const jointRows = await getValues(sheets, "予算_共同!A2:B50")
    const jointBudgets = jointRows.filter(r => r[0] && r[1]).map(([cat, amt]) => ({
      category: cat.trim(),
      amount: parseInt(String(amt).replace(/[^0-9]/g, "")) || 0,
      card_type: "joint"
    })).filter(b => b.amount > 0)
    console.log(`  ${jointBudgets.length}件: ${jointBudgets.map(b=>`${b.category}¥${b.amount}`).join(", ")}`)
    for (const b of jointBudgets) {
      await sql`INSERT INTO budgets (category, amount, card_type) VALUES (${b.category}, ${b.amount}, ${b.card_type}) ON CONFLICT (category, card_type) DO UPDATE SET amount = EXCLUDED.amount`
    }
  } catch(e) { console.log("  エラー:", e.message) }

  console.log("\n✅ 完了！")
}

main().catch(console.error)
