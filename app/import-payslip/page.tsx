"use client"

import { useRef, useState } from "react"
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
}

interface Adjustment {
  id: number
  label: string
  amount: string  // 正=収入加算、負=マイナス記入（例: -50000）
}

type PayslipKey = keyof ParsedPayslip

function toJPY(n: number | null) {
  if (n == null) return "—"
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n)
}

const ADJUSTMENT_PRESETS = ["年末調整", "賞与", "特別手当", "交通費精算", "その他"]

export default function ImportPayslipPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ParsedPayslip | null>(null)
  const [editingKey, setEditingKey] = useState<PayslipKey | null>(null)
  const [editingValue, setEditingValue] = useState("")
  const [adjustments, setAdjustments] = useState<Adjustment[]>([])
  const [nextId, setNextId] = useState(1)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState("")

  async function doParse(f: File) {
    setLoading(true)
    setResult(null)
    setError("")
    setSaveMsg("")
    setEditingKey(null)
    setAdjustments([])
    const form = new FormData()
    form.append("file", f)
    try {
      const res = await fetch("/api/import-payslip", { method: "POST", body: form })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setResult(data)
    } catch {
      setError("解析に失敗しました")
    } finally {
      setLoading(false)
    }
  }

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

  async function handleSave() {
    if (!result || !result.paymentMonth) return
    setSaving(true)
    setSaveMsg("")
    const date = `${result.paymentMonth}-25`
    const saved: string[] = []

    if (result.netPay) {
      await fetch("/api/income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, amount: result.netPay, category: "給与", memo: "給与明細取込", card_type: "self" }),
      })
      saved.push(`給与 ${toJPY(result.netPay)}`)
    }

    const deductions: Array<{ amount: number | null; category: string }> = [
      { amount: result.incomeTax, category: "給与源泉税" },
      { amount: result.residentTax, category: "住民税" },
      { amount: result.healthInsurance, category: "保険" },
      { amount: result.pension, category: "保険" },
    ]
    for (const d of deductions) {
      if (d.amount && d.amount > 0) {
        await fetch("/api/income", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, amount: -d.amount, category: d.category, memo: "給与明細取込（控除）", card_type: "self" }),
        })
        saved.push(`${d.category} ${toJPY(d.amount)}`)
      }
    }

    // 調整項目
    for (const adj of adjustments) {
      const amt = Number(adj.amount.replace(/,/g, ""))
      if (!adj.label || isNaN(amt) || amt === 0) continue
      const label = adj.label || "調整"
      await fetch("/api/income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, amount: amt, category: label, memo: "給与明細取込（調整）", card_type: "self" }),
      })
      saved.push(`${label} ${toJPY(amt)}`)
    }

    setSaveMsg(`保存しました: ${saved.join(" / ")}`)
    setSaving(false)
  }

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
              type="text"
              inputMode="numeric"
              autoFocus
              value={editingValue}
              onChange={e => {
                const raw = e.target.value.replace(/,/g, "")
                if (raw === "" || /^\d+$/.test(raw)) setEditingValue(raw)
              }}
              onBlur={commitEdit}
              onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingKey(null) }}
              className="w-28 border-b border-blue-400 text-right text-xs font-medium outline-none bg-transparent py-0.5 text-gray-900"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => startEdit(field, value)}
            className={`text-xs ${color} ${bold ? "font-bold" : "font-medium"} flex items-center gap-1 hover:opacity-70 transition-opacity`}
          >
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
      <div className="px-4 py-3 space-y-4">

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
          <p className="font-semibold">アイドマ・ホールディングス給与明細PDF対応</p>
          <p className="text-blue-500 mt-0.5">差引総支給額・各控除項目を自動取得します。金額をタップして修正できます。</p>
        </div>

        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault()
            const f = e.dataTransfer.files[0]
            if (f?.type === "application/pdf") { setFile(f); doParse(f) }
          }}
        >
          <div className="text-4xl mb-2">📄</div>
          <p className="text-sm font-medium text-gray-600">
            {file ? file.name : "タップしてPDFを選択"}
          </p>
          <p className="text-xs text-gray-400 mt-1">.pdf ファイル</p>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) { setFile(f); doParse(f) }
            }}
          />
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
                <EditableRow label="差引総支給額（手取り）" field="netPay" color="text-green-600" bold />
              </div>
            </div>

            {/* 控除 */}
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 mb-2">控除</p>
              <div className="space-y-1.5">
                <EditableRow label="所得税" field="incomeTax" color="text-red-500" />
                <EditableRow label="住民税" field="residentTax" color="text-red-500" />
                <EditableRow label="健康保険料" field="healthInsurance" color="text-red-500" />
                <EditableRow label="厚生年金保険料" field="pension" color="text-red-500" />
                <EditableRow label="雇用保険料" field="employmentInsurance" color="text-red-500" />
                <div className="flex justify-between items-center pt-1 border-t border-gray-100 mt-1">
                  <span className="text-xs text-gray-600 font-bold">控除合計</span>
                  <span className="text-xs text-gray-700 font-bold">{toJPY(result.totalDeduction)}</span>
                </div>
              </div>
            </div>

            {/* 立替・通勤手当 */}
            {(result.travelReimbursement || result.nonTaxableCommute || result.taxableCommute) && (
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-[10px] font-semibold text-gray-400 mb-2">立替・通勤手当</p>
                <div className="space-y-1.5">
                  <EditableRow label="営業交通費" field="travelReimbursement" color="text-orange-600" />
                  <EditableRow label="非課税通勤手当" field="nonTaxableCommute" color="text-orange-600" />
                  <EditableRow label="課税通勤手当" field="taxableCommute" color="text-orange-600" />
                </div>
              </div>
            )}

            {/* 調整項目 */}
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-gray-400">調整項目</p>
                <button
                  type="button"
                  onClick={() => addAdjustment()}
                  className="text-[10px] text-blue-600 hover:text-blue-700 font-semibold px-2 py-0.5 rounded border border-blue-200 hover:bg-blue-50 transition-colors"
                >
                  ＋ 追加
                </button>
              </div>

              {/* プリセット */}
              {adjustments.length === 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {ADJUSTMENT_PRESETS.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => addAdjustment(p)}
                      className="text-[10px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}

              {adjustments.length > 0 && (
                <div className="space-y-2">
                  {adjustments.map(adj => {
                    const amt = Number(adj.amount.replace(/,/g, ""))
                    const isNeg = !isNaN(amt) && amt < 0
                    const isPos = !isNaN(amt) && amt > 0
                    return (
                      <div key={adj.id} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="項目名（例: 年末調整）"
                          value={adj.label}
                          onChange={e => updateAdjustment(adj.id, "label", e.target.value)}
                          className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 outline-none focus:ring-1 focus:ring-blue-400 min-w-0"
                        />
                        <div className="relative shrink-0">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">¥</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={adj.amount}
                            onChange={e => {
                              const v = e.target.value
                              if (v === "" || v === "-" || /^-?\d*$/.test(v.replace(/,/g, ""))) {
                                updateAdjustment(adj.id, "amount", v)
                              }
                            }}
                            className={`w-28 border rounded-lg pl-6 pr-2 py-1.5 text-right text-xs font-medium outline-none focus:ring-1 focus:ring-blue-400 text-gray-900 ${
                              isNeg ? "border-red-300 bg-red-50" : isPos ? "border-green-300 bg-green-50" : "border-gray-200"
                            }`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAdjustment(adj.id)}
                          className="text-gray-300 hover:text-red-400 text-lg leading-none shrink-0"
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {ADJUSTMENT_PRESETS.map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => addAdjustment(p)}
                        className="text-[10px] px-2 py-0.5 rounded-full border border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-600 transition-colors"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[10px] text-gray-400 mt-2">
                プラス＝収入加算、マイナス（例: -50000）＝控除として記録します
              </p>
            </div>

            {/* 保存 */}
            <div className="px-4 py-3 space-y-2">
              <p className="text-[10px] text-gray-400">
                保存すると「給与（差引総支給額）」と各控除・調整項目を収入として記録します
              </p>
              {saveMsg && <p className="text-xs text-green-600 font-medium">{saveMsg}</p>}
              <button
                onClick={handleSave}
                disabled={saving || !result.paymentMonth}
                className="w-full bg-blue-600 text-white text-sm font-semibold py-3 rounded-xl disabled:opacity-50 hover:bg-blue-700 transition-colors"
              >
                {saving ? "保存中..." : "家計簿に保存する"}
              </button>
            </div>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  )
}
