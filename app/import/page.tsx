"use client"

import { useEffect, useRef, useState } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"

interface Card { id: number; name: string; card_type: string; color: string }
interface ImportLog {
  id: number
  card_name: string
  start_date: string
  end_date: string
  row_count: number
  file_name: string
  imported_at: string
}

export default function ImportPage() {
  const [cards, setCards] = useState<Card[]>([])
  const [cardId, setCardId] = useState<number | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    imported: number; skipped: number
    importedTotal?: number; csvBillingTotal?: number | null; verified?: boolean | null
  } | null>(null)
  const [error, setError] = useState("")
  const [logs, setLogs] = useState<ImportLog[]>([])
  const [warning, setWarning] = useState<{ message: string; newRange: { startDate: string; endDate: string } } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/cards").then(r => r.json()).then(d => {
      const c = d.cards ?? []
      setCards(c)
      if (c.length > 0) setCardId(c[0].id)
    })
    fetchLogs()
  }, [])

  async function fetchLogs() {
    const d = await fetch("/api/import-csv").then(r => r.json())
    setLogs(d.logs ?? [])
  }

  async function doImport(force: boolean) {
    if (!file || !cardId) return
    setLoading(true)
    setResult(null)
    setError("")
    setWarning(null)

    const form = new FormData()
    form.append("file", file)
    form.append("card_id", String(cardId))
    if (force) form.append("force", "true")

    try {
      const res = await fetch("/api/import-csv", { method: "POST", body: form })
      const data = await res.json()
      if (data.warning) {
        setWarning({ message: data.message, newRange: data.newRange })
      } else if (res.ok) {
        setResult({
          imported: data.imported, skipped: data.skipped,
          importedTotal: data.importedTotal, csvBillingTotal: data.csvBillingTotal, verified: data.verified,
        })
        setFile(null)
        if (fileRef.current) fileRef.current.value = ""
        fetchLogs()
      } else {
        setError(data.error ?? "インポートに失敗しました")
      }
    } catch (e: unknown) {
      setError("通信エラー: " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLoading(false)
    }
  }

  async function handleImport() {
    await doImport(false)
  }

  async function handleForceImport() {
    await doImport(true)
  }

  return (
    <div className="pb-20">
      <PageHeader title="CSVインポート" />
      <main className="max-w-md mx-auto px-4 py-2 space-y-3">

        {/* 説明 */}
        <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700 space-y-1">
          <p className="font-medium">各カード会社のCSVをインポートできます</p>
          <p className="text-xs text-blue-600">自動的に日付・金額・メモ列を検出します。カテゴリは「未分類」で取り込まれます。</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-3 space-y-3">
          {/* カード選択 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">取り込み先カード</label>
            <div className="flex gap-2">
              {cards.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCardId(c.id)}
                  className="flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all"
                  style={{
                    borderColor: cardId === c.id ? c.color : "#e5e7eb",
                    backgroundColor: cardId === c.id ? c.color + "18" : "white",
                    color: cardId === c.id ? c.color : "#6b7280",
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {/* ファイル選択 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">CSVファイル</label>
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {file ? (
                <div>
                  <p className="text-sm font-medium text-blue-600">{file.name}</p>
                  <p className="text-xs text-gray-700 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div>
                  <p className="text-2xl mb-1">📂</p>
                  <p className="text-sm text-gray-700">タップしてCSVを選択</p>
                  <p className="text-xs text-gray-700">.csv ファイル</p>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => { setFile(e.target.files?.[0] ?? null); setWarning(null); setResult(null) }}
            />
          </div>

          {/* エラー・結果 */}
          {error && (
            <div className="bg-red-50 text-red-600 rounded-lg px-3 py-2 text-sm">❌ {error}</div>
          )}
          {result && (
            <div className="space-y-2">
              <div className="bg-green-50 text-green-700 rounded-lg px-3 py-2 text-sm">
                ✅ {result.imported}件取り込み完了
                {result.skipped > 0 && <span className="text-gray-600 ml-2">（{result.skipped}件スキップ）</span>}
              </div>
              {/* 請求合計との照合 */}
              {result.csvBillingTotal != null && (
                <div className={`rounded-lg px-3 py-2 text-sm border ${
                  result.verified ? "bg-blue-50 border-blue-200 text-blue-800" : "bg-red-50 border-red-300 text-red-700"
                }`}>
                  {result.verified ? "✅" : "⚠️"} 請求合計照合：
                  <span className="font-semibold ml-1">
                    CSV請求額 ¥{result.csvBillingTotal.toLocaleString()} {result.verified ? "＝" : "≠"} 取込合計 ¥{(result.importedTotal ?? 0).toLocaleString()}
                  </span>
                  {!result.verified && (
                    <p className="text-xs mt-1">金額が一致していません。明細を確認してください。</p>
                  )}
                </div>
              )}
              {result.csvBillingTotal == null && result.importedTotal != null && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600">
                  取込合計：¥{(result.importedTotal).toLocaleString()}
                  <span className="text-xs ml-2">（このCSVは請求合計額が自動検出できませんでした）</span>
                </div>
              )}
            </div>
          )}

          {/* 重複警告 */}
          {warning && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-yellow-800">⚠️ 重複インポートの可能性</p>
              <p className="text-xs text-yellow-700">{warning.message}</p>
              <p className="text-xs text-yellow-700">今回のファイル: {warning.newRange.startDate} ～ {warning.newRange.endDate}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setWarning(null)}
                  className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-1.5 text-sm"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleForceImport}
                  disabled={loading}
                  className="flex-1 bg-yellow-500 text-white rounded-lg py-1.5 text-sm font-semibold disabled:opacity-50"
                >
                  それでも取り込む
                </button>
              </div>
            </div>
          )}

          {!warning && (
            <button
              onClick={handleImport}
              disabled={!file || !cardId || loading}
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "取り込み中..." : "インポートする"}
            </button>
          )}
        </div>

        {/* インポート履歴 */}
        {logs.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b">
              <h3 className="text-sm font-semibold text-gray-700">インポート履歴</h3>
            </div>
            {logs.slice(0, 10).map(log => (
              <div key={log.id} className="flex items-center px-3 py-2 border-b last:border-0 gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-800">{log.card_name}</span>
                    <span className="text-xs text-gray-700">{log.start_date} ～ {log.end_date}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{log.file_name} · {log.row_count}件</p>
                </div>
                <span className="text-xs text-gray-500 shrink-0 mr-1">{String(log.imported_at).slice(0, 10)}</span>
                <button
                  onClick={async () => {
                    if (!confirm(`「${log.card_name}」${log.start_date}〜${log.end_date} のインポートを取り消しますか？\n（この期間のCSV取り込み分が全て削除されます）`)) return
                    const res = await fetch(`/api/import-csv?log_id=${log.id}`, { method: "DELETE" })
                    const d = await res.json()
                    if (d.success) {
                      alert(`${d.deleted}件削除しました`)
                      fetchLogs()
                    } else {
                      alert("取り消しに失敗しました: " + d.error)
                    }
                  }}
                  className="text-xs text-red-400 hover:text-red-600 border border-red-200 rounded px-2 py-0.5 shrink-0"
                >
                  取り消し
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ヒント */}
        <div className="bg-white rounded-xl shadow-sm p-3">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">対応フォーマット</h3>
          <div className="space-y-1.5 text-xs text-gray-700">
            <div className="flex items-start gap-2">
              <span className="text-blue-500 shrink-0">•</span>
              <span>日付列：「利用日」「取引日」「date」などを自動検出</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-500 shrink-0">•</span>
              <span>金額列：「利用金額」「出金」「amount」などを自動検出</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-500 shrink-0">•</span>
              <span>メモ列：「店名」「摘要」「内容」などを自動検出</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-yellow-500 shrink-0">•</span>
              <span>取り込み後、明細履歴からカテゴリを変更できます</span>
            </div>
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
