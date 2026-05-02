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

function toJPY(n: number | null) {
  if (n == null) return "—"
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n)
}

export default function ImportPayslipPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ParsedPayslip | null>(null)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState("")

  async function doParse(f: File) {
    setLoading(true)
    setResult(null)
    setError("")
    setSaveMsg("")
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

  async function handleSave() {
    if (!result || !result.paymentMonth) return
    setSaving(true)
    setSaveMsg("")
    const date = `${result.paymentMonth}-25`
    const saved: string[] = []

    // 差引総支給額 → 収入（給与）
    if (result.netPay) {
      await fetch("/api/income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, amount: result.netPay, category: "給与", memo: "給与明細取込", card_type: "self" }),
      })
      saved.push(`給与 ${toJPY(result.netPay)}`)
    }

    // 控除項目 → 支出（transactions は card_id が必要なのでスキップ、incomes に別カテゴリで保存）
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

    setSaveMsg(`保存しました: ${saved.join(" / ")}`)
    setSaving(false)
  }

  return (
    <div className="pb-20">
      <PageHeader title="給与明細取込" />
      <div className="px-4 py-3 space-y-4">

        {/* アップロードエリア */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
          <p className="font-semibold">アイドマ・ホールディングス給与明細PDF対応</p>
          <p className="text-blue-500 mt-0.5">差引総支給額・各控除項目を自動取得します</p>
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

        {/* 解析結果 */}
        {result && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="bg-gray-800 text-white px-4 py-2 flex items-center justify-between">
              <span className="text-sm font-bold">
                {result.paymentMonth ? `${result.paymentMonth.replace("-", "年")}月支払分` : "支払月不明"}
              </span>
            </div>

            {/* 支給 */}
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 mb-2">支給</p>
              <div className="space-y-1.5">
                <Row label="支給合計（額面）" value={result.grossPay} color="text-gray-800" />
                <Row label="差引総支給額（手取り）" value={result.netPay} color="text-green-600" bold />
              </div>
            </div>

            {/* 控除 */}
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 mb-2">控除</p>
              <div className="space-y-1.5">
                <Row label="所得税" value={result.incomeTax} color="text-red-500" />
                <Row label="住民税" value={result.residentTax} color="text-red-500" />
                <Row label="健康保険料" value={result.healthInsurance} color="text-red-500" />
                <Row label="厚生年金保険料" value={result.pension} color="text-red-500" />
                <Row label="雇用保険料" value={result.employmentInsurance} color="text-red-500" />
                <Row label="控除合計" value={result.totalDeduction} color="text-gray-700" bold />
              </div>
            </div>

            {/* 立替 */}
            {(result.travelReimbursement || result.nonTaxableCommute || result.taxableCommute) && (
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-[10px] font-semibold text-gray-400 mb-2">立替・通勤手当</p>
                <div className="space-y-1.5">
                  <Row label="営業交通費" value={result.travelReimbursement} color="text-orange-600" />
                  <Row label="非課税通勤手当" value={result.nonTaxableCommute} color="text-orange-600" />
                  <Row label="課税通勤手当" value={result.taxableCommute} color="text-orange-600" />
                </div>
              </div>
            )}

            {/* 保存ボタン */}
            <div className="px-4 py-3 space-y-2">
              <p className="text-[10px] text-gray-400">
                保存すると「給与（差引総支給額）」と各控除項目を収入・支出として記録します
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

function Row({ label, value, color, bold }: { label: string; value: number | null; color: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-gray-600">{label}</span>
      <span className={`text-xs ${color} ${bold ? "font-bold" : "font-medium"}`}>{toJPY(value)}</span>
    </div>
  )
}
