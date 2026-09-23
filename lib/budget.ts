/**
 * 月ごとの予算の解決。
 *
 * budgets テーブルは3種類のレコードを持つ。
 *   month IS NULL                … 毎月の既定予算
 *   month=YYYY-MM, is_from_month=false … その月だけの予算
 *   month=YYYY-MM, is_from_month=true  … その月以降ずっとの予算
 *
 * 優先順位は「その月だけ > その月以降（直近のもの）> 既定」。
 * 予実画面とライフプランで解釈がずれないよう、ここに1つだけ置く。
 */

export interface BudgetRecord {
  category: string
  card_type: string
  amount: number | string
  month: string | null
  is_from_month?: boolean | null
}

export interface BudgetResolver {
  /** その月に効いている予算額 */
  resolve: (category: string, cardType: string, month: string) => number
  /** 予算レコードがあるカテゴリの一覧 */
  keys: { category: string; cardType: string }[]
}

export function buildBudgetResolver(rows: BudgetRecord[]): BudgetResolver {
  const def: Record<string, number> = {}
  const exact: Record<string, Record<string, number>> = {}
  const fromMonth: Record<string, { month: string; amount: number }[]> = {}
  const keySet = new Set<string>()

  for (const b of rows) {
    const key = `${b.category}__${b.card_type}`
    keySet.add(key)
    const amount = Number(b.amount)
    if (!b.month) {
      def[key] = amount
    } else if (b.is_from_month) {
      const mm = String(b.month).slice(0, 7)
      ;(fromMonth[key] ??= []).push({ month: mm, amount })
    } else {
      const mm = String(b.month).slice(0, 7)
      ;(exact[key] ??= {})[mm] = amount
    }
  }
  for (const k of Object.keys(fromMonth)) {
    fromMonth[k].sort((a, b) => b.month.localeCompare(a.month))
  }

  return {
    resolve(category, cardType, month) {
      const key = `${category}__${cardType}`
      if (exact[key]?.[month] !== undefined) return exact[key][month]
      for (const rec of fromMonth[key] ?? []) {
        if (rec.month <= month) return rec.amount
      }
      return def[key] ?? 0
    },
    keys: [...keySet].map(k => {
      const i = k.lastIndexOf("__")
      return { category: k.slice(0, i), cardType: k.slice(i + 2) }
    }),
  }
}

/** その年（12ヶ月）の予算合計。隔月や月別の上書きも織り込む */
export function annualBudget(
  resolver: BudgetResolver,
  year: number,
  include: (category: string, cardType: string) => boolean,
): number {
  let total = 0
  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${String(m).padStart(2, "0")}`
    for (const k of resolver.keys) {
      if (!include(k.category, k.cardType)) continue
      total += resolver.resolve(k.category, k.cardType, month)
    }
  }
  return total
}
