"use client"

import { useEffect, useRef, useState } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"

interface Card { id: number; name: string; card_type: string; color: string }

export default function ImportPage() {
  const [cards, setCards] = useState<Card[]>([])
  const [cardId, setCardId] = useState<number | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [error, setError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/cards").then(r => r.json()).then(d => {
      const c = d.cards ?? []
      setCards(c)
      if (c.length > 0) setCardId(c[0].id)
    })
  }, [])

  async function handleImport() {
    if (!file || !cardId) return
    setLoading(true)
    setResult(null)
    setError("")

    const form = new FormData()
    form.append("file", file)
    form.append("card_id", String(cardId))

    try {
      const res = await fetch("/api/import-csv", { method: "POST", body: form })
      const data = await res.json()
      if (res.ok) {
        setResult({ imported: data.imported, skipped: data.skipped })
        setFile(null)
        if (fileRef.current) fileRef.current.value = ""
      } else {
        setError(data.error ?? "インポートに失敗しました")
      }
    } catch {
      setError("通信エラーが発生しました")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pb-20">
      <PageHeader title="CSVインポート" />
      <main className="max-w-md mx-auto px-4 py-4 space-y-4">

        {/* 説明 */}
        <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700 space-y-1">
          <p className="font-medium">各カード会社のCSVをインポートできます</p>
          <p className="text-xs text-blue-500">自動的に日付・金額・メモ列を検出します。カテゴリは「未分類」で取り込まれます。</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
          {/* カード選択 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">取り込み先カード</label>
            <div className="flex gap-2">
              {cards.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCardId(c.id)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all"
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
              className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {file ? (
                <div>
                  <p className="text-sm font-medium text-blue-600">{file.name}</p>
                  <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div>
                  <p className="text-3xl mb-2">📂</p>
                  <p className="text-sm text-gray-500">タップしてCSVを選択</p>
                  <p className="text-xs text-gray-400 mt-1">.csv ファイル</p>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {/* エラー・結果 */}
          {error && (
            <div className="bg-red-50 text-red-600 rounded-lg px-3 py-2 text-sm">❌ {error}</div>
          )}
          {result && (
            <div className="bg-green-50 text-green-700 rounded-lg px-3 py-2 text-sm">
              ✅ {result.imported}件取り込み完了
              {result.skipped > 0 && <span className="text-gray-400 ml-2">（{result.skipped}件スキップ）</span>}
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={!file || !cardId || loading}
            className="w-full bg-blue-600 text-white rounded-lg py-3 font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "取り込み中..." : "インポートする"}
          </button>
        </div>

        {/* ヒント */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">対応フォーマット</h3>
          <div className="space-y-2 text-xs text-gray-500">
            <div className="flex items-start gap-2">
              <span className="text-blue-400 shrink-0">•</span>
              <span>日付列：「利用日」「取引日」「date」などを自動検出</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-400 shrink-0">•</span>
              <span>金額列：「利用金額」「出金」「amount」などを自動検出</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-400 shrink-0">•</span>
              <span>メモ列：「店名」「摘要」「内容」などを自動検出</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-yellow-400 shrink-0">•</span>
              <span>取り込み後、明細履歴からカテゴリを変更できます</span>
            </div>
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
