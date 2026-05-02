"use client"

import { useRef, useState, useMemo, useEffect, useCallback } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"

interface ParsedPayslip {
  paymentMonth: string | null
  netPay: number | null
  grossPay: number | null
  incomeTax: number | null
  residentTax: number | null
  healthInsurance: number | null
  pension: number | null
  employmentInsurance: number | null
  travelReimbursement: number | null
  nonTaxableCommute: number | null
  taxableCommute: number | null
  totalDeduction: number | null
  yearEndAdjustment: number | null
  _debug?: { nums: number[]; labels: string[]; val: Record<string, number> }
}

interface ImportHistoryGroup {
  date: string       // YYYY-MM-DD
  month: string      // YYYY年MM月
  records: { id: number; amount: number; category: string }[]
}

interface AdjustmentRow {
  id: number
  label: string
  amount: string
}

type PayslipKey = keyof ParsedPayslip

function toJPY(n: number | null | undefined) {
  if (n == null) return "—"
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n)
}

const ADJUSTMENT_PRESETS = ["年末調整", "賞与", "特別手当", "その他"]

export default function ImportPayslipPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ParsedPayslip | null>(null)
  const [editingKey, setEditingKey] = useState<PayslipKey | null>(null)
  const [editingValue, setEditingValue] = useState("")
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([])
  const [nextId, setNextId] = useState(1)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState("")
  const [savedIds, setSavedIds] = useState<number[]>([])
  const [history, setHistory] = useState<ImportHistoryGroup[]>([])
  const [deletingDate, setDeletingDate] = useState<string | null>(null)

  // ─── 計算値 ───────────────────────────────────────────────────────
  const adjustmentTotal = useMemo(() => {
    return adjustments.reduce((s, a) => {
      const n = Number(a.amount.replace(/,/g, ""))
      return s + (isNaN(n) ? 0 : n)
    }, 0)
  }, [adjustments])

  const deductionTotal = useMemo(() => {
    if (!result) return 0
    return (result.incomeTax ?? 0)
      + (result.residentTax ?? 0)
      + (result.healthInsurance ?? 0)
      + (result.pension ?? 0)
      + (result.employmentInsurance ?? 0)
      + adjustmentTotal
  }, [result, adjustmentTotal])

  const commuteTotal = useMemo(() => {
    if (!result) return 0
    return (result.travelReimbursement ?? 0)
      + (result.nonTaxableCommute ?? 0)
      + (result.taxableCommute ?? 0)
  }, [result])

  // 登録する給与収入 = 差引総支給額 − 立替・通勤手当合計
  const salaryIncome = useMemo(() => {
    if (!result) return 0
    return (result.netPay ?? 0) - commuteTotal
  }, [result, commuteTotal])

  // ─── PDF解析 ─────────────────────────────────────────────────────
  async function doParse(f: File) {
    setLoading(true)
    setResult(null)
    setError("")
    setSaveMsg("")
    setSavedIds([])
    setEditingKey(null)
    setAdjustments([])
    const form = new FormData()
    form.append("file", f)
    try {
      const res = await fetch("/api/import-payslip", { method: "POST", body: form })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setResult(data)
      // 年末調整還付が検出されたら調整項目に自動セット
      if (data.yearEndAdjustment != null) {
        setAdjustments([{ id: 1, label: "年末調整還付", amount: String(data.yearEndAdjustment) }])
        setNextId(2)
      }
    } catch {
      setError("解析に失敗しました")
    } finally {
      setLoading(false)
    }
  }

  // ─── 金額インライン編集 ───────────────────────────────────────────
  function startEdit(key: PayslipKey, current: number | null) {
    setEditingKey(key)
    setEditingValue(current != null ? String(current) : "")
  }

  function commitEdit() {
    if (!editingKey || !result) { setEditingKey(null); return }
    const raw = editingValue.replace(/,/g, "")
    const num = raw === "" ? null : Number(raw)
    setResult(prev => prev ? { ...prev, [editingKey]: isNaN(num as number) ? prev[editingKey] : num } : prev)
    setEditingKey(null)
  }

  // ─── 調整項目 ─────────────────────────────────────────────────────
  function addAdjustment(preset?: string) {
    setAdjustments(prev => [...prev, { id: nextId, label: preset ?? "", amount: "" }])
    setNextId(n => n + 1)
  }

  function updateAdjustment(id: number, field: "label" | "amount", value: string) {
    setAdjustments(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a))
  }

  function removeAdjustment(id: number) {
    setAdjustments(prev => prev.filter(a => a.id !== id))
  }

  // ─── 保存 ─────────────────────────────────────────────────────────
  async function handleSave() {
    if (!result || !result.paymentMonth) return
    setSaving(true)
    setSaveMsg("")
    setSavedIds([])
    const date = `${result.paymentMonth}-25`
    const ids: number[] = []

    // ① 給与収入（差引総支給額 − 立替・通勤手当）
    if (salaryIncome !== 0) {
      const r = await fetch("/api/income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, amount: salaryIncome, category: "給与", memo: "給与明細取込", card_type: "self" }),
      }).then(r => r.json())
      if (r.income?.id) ids.push(r.income.id)
    }

    // ② 控除合計（給与源泉税として1件）
    if (deductionTotal > 0) {
      const r = await fetch("/api/income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, amount: -deductionTotal, category: "給与源泉税", memo: "給与明細取込（控除合計）", card_type: "self" }),
      }).then(r => r.json())
      if (r.income?.id) ids.push(r.income.id)
    }

    setSavedIds(ids)
    setSaveMsg(`保存しました: 給与 ${toJPY(salaryIncome)} / 給与源泉税 ${toJPY(-deductionTotal)}`)
    setSaving(false)
  }

  // ─── 取り消し ─────────────────────────────────────────────────────
  async function handleUndo() {
    if (savedIds.length === 0) return
    await Promise.all(savedIds.map(id =>
      fetch(`/api/income?id=${id}`, { method: "DELETE" })
    ))
    setSavedIds([])
    setSaveMsg("取り消しました")
    loadHistory()
  }

  // ─── 取込履歴（DBから） ───────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    // 直近6ヶ月分を検索して給与明細取込のメモを持つレコードをグループ化
    const now = new Date()
    const months: string[] = []
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
    }
    const results = await Promise.all(
      months.map(m => fetch(`/api/income?month=${m}&card_type=self`).then(r => r.json()))
    )
    const groups: ImportHistoryGroup[] = []
    for (const { incomes } of results) {
      if (!incomes) continue
      const payslipRecords = (incomes as Array<{ id: number; date: string; amount: number; category: string; memo: string }>)
        .filter(r => r.memo?.includes("給与明細取込"))
      if (payslipRecords.length === 0) continue
      // 日付ごとにグループ化
      const byDate: Record<string, typeof payslipRecords> = {}
      for (const r of payslipRecords) {
        const d = r.date.slice(0, 10)
        if (!byDate[d]) byDate[d] = []
        byDate[d].push(r)
      }
      for (const [date, records] of Object.entries(byDate)) {
        const [y, m] = date.split("-")
        groups.push({ date, month: `${y}年${m}月`, records })
      }
    }
    groups.sort((a, b) => b.date.localeCompare(a.date))
    setHistory(groups)
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  async function handleDeleteHistoryGroup(group: ImportHistoryGroup) {
    if (!confirm(`${group.month}支払分の給与明細取込データ（${group.records.length}件）を削除しますか？`)) return
    setDeletingDate(group.date)
    await Promise.all(group.records.map(r => fetch(`/api/income?id=${r.id}`, { method: "DELETE" })))
    setDeletingDate(null)
    loadHistory()
  }

  // ─── 編集可能行コンポーネント ─────────────────────────────────────
  function EditableRow({ label, field, color, bold }: { label: string; field: PayslipKey; color: string; bold?: boolean }) {
    if (!result) return null
    const value = result[field] as number | null
    const isEditing = editingKey === field
    return (
      <div className="flex justify-between items-center group">
        <span className="text-xs text-gray-600">{label}</span>
        {isEditing ? (
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400">¥</span>
            <input
              type="text" inputMode="numeric" autoFocus
              value={editingValue}
              onChange={e => { const r = e.target.value.replace(/,/g, ""); if (r === "" || /^\d+$/.test(r)) setEditingValue(r) }}
              onBlur={commitEdit}
              onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingKey(null) }}
              className="w-28 border-b border-blue-400 text-right text-xs font-medium outline-none bg-transparent py-0.5 text-gray-900"
            />
          </div>
        ) : (
          <button type="button" onClick={() => startEdit(field, value)}
            className={`text-xs ${color} ${bold ? "font-bold" : "font-medium"} flex items-center gap-1 hover:opacity-70 transition-opacity`}>
            {toJPY(value)}
            <span className="text-gray-300 group-hover:text-gray-400 text-[10px]">✎</span>
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="pb-20">
      <PageHeader title="給与明細取込" />
      <div className="max-w-lg mx-auto px-4 py-3 space-y-4">

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
          <p className="font-semibold">アイドマ・ホールディングス給与明細PDF対応</p>
          <p className="text-blue-500 mt-0.5">金額をタップして修正できます</p>
        </div>

        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === "application/pdf") { setFile(f); doParse(f) } }}
        >
          <div className="text-4xl mb-2">📄</div>
          <p className="text-sm font-medium text-gray-600">{file ? file.name : "タップしてPDFを選択"}</p>
          <p className="text-xs text-gray-400 mt-1">.pdf ファイル</p>
          <input ref={fileRef} type="file" accept=".pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); doParse(f) } }} />
        </div>

        {loading && <div className="text-center py-6 text-gray-400 text-sm">解析中...</div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600">{error}</div>}

        {result && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="bg-gray-800 text-white px-4 py-2 flex items-center justify-between">
              <span className="text-sm font-bold">
                {result.paymentMonth ? `${result.paymentMonth.replace("-", "年")}月支払分` : "支払月不明"}
              </span>
              <span className="text-[10px] text-gray-400">金額をタップして修正</span>
            </div>

            {/* 支給 */}
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 mb-2">支給</p>
              <div className="space-y-1.5">
                <EditableRow label="支給合計（額面）" field="grossPay" color="text-gray-800" />
                <EditableRow label="差引総支給額（手取り）" field="netPay" color="text-gray-800" />
                <EditableRow label="営業交通費" field="travelReimbursement" color="text-orange-600" />
                <EditableRow label="非課税通勤手当" field="nonTaxableCommute" color="text-orange-600" />
                <EditableRow label="課税通勤手当" field="taxableCommute" color="text-orange-600" />
              </div>
              {/* 登録される給与額 */}
              <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between items-center bg-green-50 -mx-4 px-4 py-1.5">
                <span className="text-xs text-green-700 font-semibold">登録する給与収入</span>
                <span className="text-xs text-green-700 font-bold">{toJPY(salaryIncome)}</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">差引総支給額 − 立替・通勤手当</p>
            </div>

            {/* 控除＋調整 */}
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 mb-2">控除・調整</p>
              <div className="space-y-1.5">
                <EditableRow label="所得税" field="incomeTax" color="text-red-500" />
                <EditableRow label="住民税" field="residentTax" color="text-red-500" />
                <EditableRow label="健康保険料" field="healthInsurance" color="text-red-500" />
                <EditableRow label="厚生年金保険料" field="pension" color="text-red-500" />
                <EditableRow label="雇用保険料" field="employmentInsurance" color="text-red-500" />

                {/* 調整項目 */}
                {adjustments.map(adj => {
                  const amt = Number(adj.amount.replace(/,/g, ""))
                  const isNeg = !isNaN(amt) && adj.amount !== "" && amt < 0
                  const isPos = !isNaN(amt) && adj.amount !== "" && amt > 0
                  return (
                    <div key={adj.id} className="flex items-center gap-2 pt-0.5">
                      <input
                        type="text" placeholder="項目名（例: 年末調整）"
                        value={adj.label}
                        onChange={e => updateAdjustment(adj.id, "label", e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-900 outline-none focus:ring-1 focus:ring-blue-400 min-w-0"
                      />
                      <div className="relative shrink-0">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">¥</span>
                        <input
                          type="text" inputMode="numeric" placeholder="0"
                          value={adj.amount}
                          onChange={e => {
                            const v = e.target.value
                            if (v === "" || v === "-" || /^-?\d*$/.test(v.replace(/,/g, ""))) updateAdjustment(adj.id, "amount", v)
                          }}
                          className={`w-28 border rounded-lg pl-5 pr-2 py-1 text-right text-xs font-medium outline-none focus:ring-1 focus:ring-blue-400 text-gray-900 ${
                            isNeg ? "border-green-300 bg-green-50" : isPos ? "border-red-300 bg-red-50" : "border-gray-200"
                          }`}
                        />
                      </div>
                      <button type="button" onClick={() => removeAdjustment(adj.id)}
                        className="text-gray-300 hover:text-red-400 text-lg leading-none shrink-0">×</button>
                    </div>
                  )
                })}

                {/* 調整追加ボタン */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {ADJUSTMENT_PRESETS.map(p => (
                    <button key={p} type="button" onClick={() => addAdjustment(p)}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                      ＋{p}
                    </button>
                  ))}
                  <button type="button" onClick={() => addAdjustment()}
                    className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-gray-300 text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors">
                    ＋その他
                  </button>
                </div>
                <p className="text-[10px] text-gray-400">マイナス入力（例: -37042）＝還付（控除を減らす）</p>
              </div>

              {/* 控除合計 */}
              <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between items-center bg-red-50 -mx-4 px-4 py-1.5">
                <span className="text-xs text-red-700 font-semibold">登録する控除合計（給与源泉税）</span>
                <span className="text-xs text-red-700 font-bold">{toJPY(deductionTotal)}</span>
              </div>
            </div>

            {/* 保存 */}
            <div className="px-4 py-3 space-y-2">
              <div className="bg-gray-50 rounded-lg px-3 py-2 space-y-1">
                <p className="text-[10px] font-semibold text-gray-500">登録内容（2件）</p>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">収入: 給与</span>
                  <span className="text-green-600 font-medium">{toJPY(salaryIncome)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">控除: 給与源泉税</span>
                  <span className="text-red-500 font-medium">−{toJPY(deductionTotal)}</span>
                </div>
              </div>

              {saveMsg && (
                <div className={`text-xs rounded-lg px-3 py-2 flex items-center justify-between ${savedIds.length > 0 ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500"}`}>
                  <span>{saveMsg}</span>
                  {savedIds.length > 0 && (
                    <button onClick={handleUndo}
                      className="text-[10px] text-red-500 hover:text-red-600 font-semibold ml-3 shrink-0">
                      取り消す
                    </button>
                  )}
                </div>
              )}

              <button onClick={handleSave} disabled={saving || !result.paymentMonth}
                className="w-full bg-blue-600 text-white text-sm font-semibold py-3 rounded-xl disabled:opacity-50 hover:bg-blue-700 transition-colors">
                {saving ? "保存中..." : "家計簿に保存する"}
              </button>
            </div>
          </div>
        )}
        {/* デバッグ: ラベル↔数値対応確認 */}
        {result?._debug && (
          <details className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs">
            <summary className="font-semibold text-gray-500 cursor-pointer">🔍 解析デバッグ（ズレ確認用）</summary>
            <div className="mt-2 space-y-2">
              <div>
                <p className="font-semibold text-gray-600 mb-1">数値リスト（順番）:</p>
                <p className="text-gray-700">{result._debug.nums.map((n, i) => `[${i}] ${n.toLocaleString()}`).join(" / ")}</p>
              </div>
              <div>
                <p className="font-semibold text-gray-600 mb-1">ラベルリスト（順番）:</p>
                <p className="text-gray-700">{result._debug.labels.map((l, i) => `[${i}] ${l}`).join(" / ")}</p>
              </div>
              <div>
                <p className="font-semibold text-gray-600 mb-1">対応結果:</p>
                {Object.entries(result._debug.val).map(([k, v]) => (
                  <span key={k} className="inline-block mr-2 text-gray-700">{k}: {v.toLocaleString()}</span>
                ))}
              </div>
            </div>
          </details>
        )}

        {/* 取込履歴 */}
        {history.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <p className="text-xs font-semibold text-gray-600 px-4 py-2.5 border-b bg-gray-50">取込履歴（直近6ヶ月）</p>
            {history.map(group => (
              <div key={group.date} className="flex items-center justify-between px-4 py-3 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-800">{group.month}支払分</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {group.records.map(r => `${r.category} ${toJPY(r.amount)}`).join(" / ")}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteHistoryGroup(group)}
                  disabled={deletingDate === group.date}
                  className="text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 shrink-0 ml-3"
                >
                  {deletingDate === group.date ? "削除中..." : "削除"}
                </button>
              </div>
            ))}
          </div>
        )}

      </div>
      <BottomNav />
    </div>
  )
}
