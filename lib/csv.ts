import { decode as iconvDecode } from "iconv-lite"

/** Shift-JIS / UTF-8 を判別してテキスト化する（イオンカード等はShift-JIS） */
export function decodeCsvBuffer(buffer: Buffer): string {
  const utf8 = buffer.toString("utf-8")
  const garbled = /�/.test(utf8) || /[\x80-\x9F]/.test(utf8.slice(0, 200))
  const text = garbled ? iconvDecode(buffer, "Shift_JIS") : utf8
  return text.replace(/^﻿/, "")
}

export function parseCSV(text: string): string[][] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  return lines
    .filter(line => line.trim())
    .map(line => {
      const result: string[] = []
      let current = ""
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') inQuotes = !inQuotes
        else if (ch === "," && !inQuotes) { result.push(current.trim()); current = "" }
        else current += ch
      }
      result.push(current.trim())
      return result
    })
}

/** 日付を YYYY-MM-DD へ正規化 */
export function normalizeDate(raw: string): string | null {
  if (!raw) return null
  const s = toHalfWidth(raw.trim())
  const m0 = s.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/)
  if (m0) return `${m0[1]}-${m0[2].padStart(2, "0")}-${m0[3].padStart(2, "0")}`
  const m1 = s.match(/(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/)
  if (m1) return `${m1[1]}-${m1[2].padStart(2, "0")}-${m1[3].padStart(2, "0")}`
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m2) return `${m2[3]}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`
  const m3 = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m3) return `${m3[1]}-${m3[2]}-${m3[3]}`
  // YYMMDD（イオンカード等 例: 260211 → 2026-02-11）
  const m4 = s.match(/^(\d{2})(\d{2})(\d{2})$/)
  if (m4) {
    const yy = parseInt(m4[1])
    const year = yy >= 50 ? `19${m4[1]}` : `20${m4[1]}`
    const mm = parseInt(m4[2]); const dd = parseInt(m4[3])
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) return `${year}-${m4[2]}-${m4[3]}`
  }
  return null
}

/** 全角英数字・記号を半角へ */
export function toHalfWidth(s: string): string {
  return s.replace(/[０-９Ａ-Ｚａ-ｚ．，－／]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  )
}

/**
 * 金額文字列を符号付きの数値へ。
 * ▲ △ ・先頭マイナス・括弧囲みをマイナスとして扱う（日本の明細でよく使われる表記）。
 * 空欄や数値を含まない場合は null（「0円の行」と「金額欄が空の行」を区別するため）。
 */
export function parseAmountSigned(raw: string): number | null {
  if (raw == null) return null
  let s = toHalfWidth(String(raw)).trim()
  if (!s) return null

  let negative = false
  if (/^[▲△]/.test(s)) { negative = true; s = s.replace(/^[▲△]\s*/, "") }
  if (/^\(.*\)$/.test(s) || /^（.*）$/.test(s)) { negative = true; s = s.slice(1, -1) }
  if (/^-/.test(s)) { negative = true; s = s.replace(/^-\s*/, "") }

  const cleaned = s.replace(/[¥￥円,\s]/g, "")
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null
  const n = Math.round(Number(cleaned))
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

/** 従来互換: 常に正の値（カード明細の利用金額用） */
export function parseAmountAbs(raw: string): number {
  const n = parseAmountSigned(raw)
  return n == null ? 0 : Math.abs(n)
}

// ── 列の検出 ─────────────────────────────────────────────────────
// 各リストは「具体的なものから先に」並べる。列の並び順ではなくキーワードの
// 優先順で探すので、「摘要内容」を「摘要」より先に拾える。
const DATE_KEYS = [
  "利用日", "ご利用日", "取引日", "お取引日", "取扱日", "お取扱日", "処理日",
  "お支払日", "支払日", "発生日", "決済日", "計上日", "年月日", "日付", "date",
]
const WITHDRAW_KEYS = [
  "お引出し金額", "お引き出し金額", "引出金額", "出金金額", "お支払い金額", "支払い金額",
  "支払金額", "引落金額", "お引落し", "ご利用金額", "利用金額",
  "お引出し", "お引き出し", "引出し", "引出", "払出金額", "払戻金額", "出金", "支払額",
  "withdrawal", "debit", "payment",
]
const DEPOSIT_KEYS = [
  "お預入れ金額", "お預り金額", "お預かり金額", "預かり金額", "預り金額", "入金金額",
  "振込入金", "お預入れ", "お預け入れ", "お預かり", "預かり", "預り", "預入",
  "入金", "受取", "deposit", "credit",
]
const BALANCE_KEYS = ["差引残高", "残高", "balance"]
const MEMO_KEYS = [
  "お取扱内容", "取扱内容", "お取引内容", "取引内容", "摘要内容", "ご利用先", "利用先",
  "お店名", "店名", "加盟店", "詳細", "内容", "摘要", "備考", "memo", "description",
]

function norm(h: string) {
  return toHalfWidth(h).toLowerCase().replace(/\s/g, "")
}

/**
 * キーワード優先で列を探す。
 * 列の並び順で探すと「摘要」が「摘要内容」より手前にあるだけで
 * 情報量の少ない列を拾ってしまうため、キーワード側を外側で回す。
 */
function findIdx(headers: string[], keys: string[], exclude: number[] = []): number {
  const lower = headers.map(norm)
  for (const k of keys) {
    const nk = norm(k)
    for (let i = 0; i < lower.length; i++) {
      if (exclude.includes(i)) continue
      if (lower[i].includes(nk)) return i
    }
  }
  return -1
}

export interface ColumnMap {
  dateIdx: number
  withdrawIdx: number
  depositIdx: number
  balanceIdx: number
  memoIdx: number
  /** 「受払区分」のように入出金の向きを示す列（無ければ -1） */
  directionIdx: number
  /** 出金・入金が1列にまとまっている（符号で判別する）形式か */
  singleAmountColumn: boolean
}

const DEPOSIT_WORDS = ["預入", "預り", "預かり", "入金", "受入", "受取", "振込入金", "利息"]
const WITHDRAW_WORDS = ["払出", "払戻", "引出", "出金", "支払", "振替"]

/**
 * 「受払区分」列の値から入出金の向きを返す。
 * 金額が1列しかなく符号も付かない明細（ゆうちょ等）で使う。
 */
export function directionFromLabel(raw: string): "deposit" | "withdraw" | null {
  const s = norm(raw)
  if (!s) return null
  if (DEPOSIT_WORDS.some(w => s.includes(norm(w)))) return "deposit"
  if (WITHDRAW_WORDS.some(w => s.includes(norm(w)))) return "withdraw"
  return null
}

/**
 * ヘッダー行から列を推定する。
 * 銀行明細（出金・入金・残高が別列）と、カード明細（利用金額1列）の両方に対応。
 */
export function detectColumns(headers: string[]): ColumnMap {
  const balanceIdx = findIdx(headers, BALANCE_KEYS)
  const depositIdx = findIdx(headers, DEPOSIT_KEYS, [balanceIdx])
  const withdrawIdx = findIdx(headers, WITHDRAW_KEYS, [balanceIdx, depositIdx])
  let dateIdx = findIdx(headers, DATE_KEYS)

  // 「区分」列は内容ではなく種別なので摘要としては使わない
  const lower = headers.map(norm)
  const kubunIdx = lower.map((h, i) => (h.includes("区分") ? i : -1)).filter(i => i >= 0)
  // 「受払区分」「入払区分」のように向きを示す列
  const directionIdx = lower.findIndex(
    h => h.includes("区分") && (h.includes("払") || h.includes("入") || h.includes("受"))
  )
  let memoIdx = findIdx(headers, MEMO_KEYS, [balanceIdx, depositIdx, withdrawIdx, ...kubunIdx])
  if (memoIdx < 0) memoIdx = findIdx(headers, MEMO_KEYS, [balanceIdx, depositIdx, withdrawIdx])

  // 「日」を含むだけの列へのゆるいフォールバック（金額・件数系は除外）
  if (dateIdx < 0) {
    dateIdx = lower.findIndex(h => h.includes("日") && !h.includes("金額") && !h.includes("件数"))
  }

  // どちらの金額列も見つからない場合は、汎用の「金額」列を出金として扱う
  let w = withdrawIdx
  if (w < 0 && depositIdx < 0) {
    w = findIdx(headers, ["金額", "amount"], [balanceIdx])
  }

  return {
    dateIdx: dateIdx >= 0 ? dateIdx : 0,
    withdrawIdx: w,
    depositIdx,
    balanceIdx,
    memoIdx: memoIdx >= 0 ? memoIdx : 1,
    directionIdx,
    // 入金列が無い＝1列に符号付きで入っている可能性がある形式
    singleAmountColumn: depositIdx < 0,
  }
}

/** 明細のヘッダー行を探す（口座情報などのメタ行を読み飛ばす） */
export function findHeaderRowIndex(rows: string[][]): number {
  const amountKeys = [...WITHDRAW_KEYS, ...DEPOSIT_KEYS, "金額", "amount"]
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i].map(norm)
    const hasDate = row.some(h => DATE_KEYS.some(k => h.includes(norm(k))))
    const hasAmount = row.some(h => amountKeys.some(k => h.includes(norm(k))))
    if (hasDate && hasAmount) return i
  }
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i].map(norm)
    if (row.some(h => DATE_KEYS.some(k => h.includes(norm(k))))) return i
  }
  return 0
}
