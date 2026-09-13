"use client"

/**
 * 年月の選択。
 *
 * <input type="month"> はブラウザ標準のカレンダーが開くが、
 * 年を選ぶのにスクロールが必要で、数年先を指定する用途（ローンの完済月など）には向かない。
 * 年と月の2つのプルダウンにして、目的の年月に2タップで届くようにしている。
 */
export function MonthSelect({ value, onChange, className = "", yearsBack = 3, yearsAhead = 40, placeholder = "—" }: {
  /** "YYYY-MM"。未選択は空文字 */
  value: string
  onChange: (v: string) => void
  className?: string
  yearsBack?: number
  yearsAhead?: number
  placeholder?: string
}) {
  const now = new Date()
  const thisYear = now.getFullYear()
  const [y, m] = value ? value.split("-") : ["", ""]

  const years: number[] = []
  for (let i = thisYear - yearsBack; i <= thisYear + yearsAhead; i++) years.push(i)
  // 選択済みの年が範囲外（かなり先・かなり前）でも表示できるようにしておく
  if (y && !years.includes(Number(y))) years.push(Number(y))
  years.sort((a, b) => a - b)

  const base = "border border-slate-700 rounded px-2 py-1.5 text-xs bg-slate-900 text-slate-100"

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <select
        value={y}
        onChange={e => onChange(e.target.value ? `${e.target.value}-${m || String(now.getMonth() + 1).padStart(2, "0")}` : "")}
        className={base}
        aria-label="年"
      >
        <option value="">{placeholder}</option>
        {years.map(yy => <option key={yy} value={yy}>{yy}年</option>)}
      </select>
      <select
        value={m}
        onChange={e => onChange(e.target.value ? `${y || thisYear}-${e.target.value}` : "")}
        className={base}
        aria-label="月"
        disabled={!y}
      >
        <option value="">{placeholder}</option>
        {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map(mm => (
          <option key={mm} value={mm}>{Number(mm)}月</option>
        ))}
      </select>
    </span>
  )
}
