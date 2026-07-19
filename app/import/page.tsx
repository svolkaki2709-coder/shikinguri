"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"
import { useViewMode } from "@/components/ViewModeContext"

interface Card { id: number; name: string; card_type: string; color: string; has_csv: boolean }
interface ImportLog {
  id: number
  card_id: number
  card_name: string
  start_date: string
  end_date: string
  row_count: number
  file_name: string
  imported_at: string
}

export default function ImportPage() {
  const { mode } = useViewMode()
  const isPC = mode === "pc"
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
      const c = (d.cards ?? []).filter((card: Card) => card.has_csv)
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

  // カードごとにインポート履歴をグルーピング（cards の並び順に揃え、削除済みカードは末尾）
  const groupedLogs = useMemo(() => {
    const byId = new Map<number, ImportLog[]>()
    for (const log of logs) {
      if (!byId.has(log.card_id)) byId.set(log.card_id, [])
      byId.get(log.card_id)!.push(log)
    }
    const groups: { cardId: number; cardName: string; color: string; logs: ImportLog[] }[] = []
    for (const c of cards) {
      if (byId.has(c.id)) {
        groups.push({ cardId: c.id, cardName: c.name, color: c.color, logs: byId.get(c.id)! })
        byId.delete(c.id)
      }
    }
    for (const [cid, cardLogs] of byId) {
      groups.push({ cardId: cid, cardName: cardLogs[0].card_name, color: "#9ca3af", logs: cardLogs })
    }
    return groups
  }, [logs, cards])

  const FormCard = (
    <div className="space-y-3">
      {/* 説明 */}
      <div className="bg-blue-500/10 rounded-xl p-3 text-sm text-blue-300 space-y-1">
        <p className="font-medium">各カード会社のCSVをインポートできます</p>
        <p className="text-xs text-blue-400">自動的に日付・金額・メモ列を検出します。カテゴリは「未分類」で取り込まれます。</p>
      </div>

      <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 p-3 space-y-3">
        {/* カード選択・ファイル選択（PCは横並び） */}
        <div className={isPC ? "grid grid-cols-2 gap-3" : "space-y-3"}>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">取り込み先カード</label>
            <div className="flex gap-2 flex-wrap">
              {cards.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCardId(c.id)}
                  className="flex-1 min-w-[100px] py-2 rounded-xl text-sm font-medium border-2 transition-all"
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

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">CSVファイル</label>
            <div
              className="border-2 border-dashed border-slate-800 rounded-xl px-4 py-2 cursor-pointer hover:border-blue-500/40 hover:bg-blue-500/10 transition-colors flex items-center gap-3 h-[38px]"
              onClick={() => fileRef.current?.click()}
            >
              <span className="text-lg shrink-0">📂</span>
              {file ? (
                <div className="min-w-0">
                  <p className="text-sm font-medium text-blue-400 truncate">{file.name}</p>
                  <p className="text-xs text-slate-300">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <p className="text-sm text-slate-300">タップしてCSVを選択</p>
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
        </div>

        {/* エラー・結果 */}
        {error && (
          <div className="bg-red-500/10 text-red-400 rounded-lg px-3 py-2 text-sm">❌ {error}</div>
        )}
        {result && (
          <div className="space-y-2">
            <div className="bg-green-500/10 text-green-300 rounded-lg px-3 py-2 text-sm">
              ✅ {result.imported}件取り込み完了
              {result.skipped > 0 && <span className="text-slate-400 ml-2">（{result.skipped}件スキップ）</span>}
            </div>
            {/* 請求合計との照合 */}
            {result.csvBillingTotal != null && (
              <div className={`rounded-lg px-3 py-2 text-sm border ${
                result.verified ? "bg-blue-500/10 border-blue-500/30 text-blue-300" : "bg-red-500/10 border-red-500/40 text-red-300"
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
              <div className="bg-slate-800 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-400">
                取込合計：¥{(result.importedTotal).toLocaleString()}
                <span className="text-xs ml-2">（このCSVは請求合計額が自動検出できませんでした）</span>
              </div>
            )}
          </div>
        )}

        {/* 重複警告 */}
        {warning && (
          <div className="bg-yellow-500/10 border border-yellow-500/40 rounded-lg p-3 space-y-2">
            <p className="text-sm font-medium text-yellow-300">⚠️ 重複インポートの可能性</p>
            <p className="text-xs text-yellow-300">{warning.message}</p>
            <p className="text-xs text-yellow-300">今回のファイル: {warning.newRange.startDate} ～ {warning.newRange.endDate}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setWarning(null)}
                className="flex-1 border border-slate-700 text-slate-400 rounded-lg py-1.5 text-sm"
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

      {/* ヒント */}
      <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 p-3">
        <h3 className="text-sm font-semibold text-slate-300 mb-2">対応フォーマット</h3>
        <div className={`gap-1.5 text-xs text-slate-300 ${isPC ? "grid grid-cols-2" : "space-y-1.5"}`}>
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
    </div>
  )

  // ─── インポート履歴（カード別グルーピング） ───────────────────
  const HistoryCard = groupedLogs.length > 0 && (
    <div className="space-y-3">
      {groupedLogs.map(group => (
        <div key={group.cardId} className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 overflow-hidden">
          <div className="px-3 py-2 border-b flex items-center gap-2" style={{ backgroundColor: group.color + "14" }}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
            <h3 className="text-sm font-semibold text-slate-300">{group.cardName}</h3>
            <span className="text-xs text-slate-500 ml-auto">{group.logs.length}件</span>
          </div>
          {group.logs.slice(0, 10).map(log => (
            <div key={log.id} className="flex items-center px-3 py-2 border-b last:border-0 gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-300">{log.start_date} ～ {log.end_date}</p>
                <p className="text-xs text-slate-400 truncate">{log.file_name} · {log.row_count}件</p>
              </div>
              <span className="text-xs text-slate-500 shrink-0">{String(log.imported_at).slice(0, 10)}</span>
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
                className="text-xs text-red-400 hover:text-red-400 border border-red-500/30 rounded px-2 py-0.5 shrink-0"
              >
                取り消し
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )

  return (
    <div className={isPC ? "" : "pb-20"}>
      <PageHeader title="CSVインポート" />
      <div className={isPC ? "px-6 py-4" : "max-w-md mx-auto px-4 py-2"}>
        {isPC ? (
          <div className="grid grid-cols-[420px_1fr] gap-4 items-start">
            {FormCard}
            {HistoryCard || (
              <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 p-6 text-center text-sm text-slate-500">
                インポート履歴はまだありません
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {FormCard}
            {HistoryCard}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  )
}
