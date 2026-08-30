/**
 * 積立投資のシミュレーション。
 *
 * NISAには2つの枠があり、シミュレーションでは両方を守る必要がある。
 *   年間投資枠   … つみたて120万円＋成長投資240万円＝最大360万円
 *   生涯投資枠   … 1,800万円（簿価＝取得価額ベース。評価額ではない）
 * 上限に達したらそれ以上は積み立てられないため、途中で積立が止まる。
 *
 * ⚠️ 制度の枠は改正されうる。数値はこのファイルの定数に集約している。
 */

/** NISAの年間投資枠 */
export const NISA_ANNUAL_LIMIT = 3_600_000
/** NISAの生涯投資枠（簿価ベース） */
export const NISA_LIFETIME_LIMIT = 18_000_000
/** 運用益にかかる税率（所得税15.315%＋住民税5%） */
export const CAPITAL_GAINS_TAX = 0.20315

export interface InvestInput {
  /** 現在の年齢 */
  currentAge: number
  /** 何歳まで積み立てるか */
  untilAge: number
  /** 毎月の積立額（円） */
  monthly: number
  /** ボーナス時などの年1回の追加積立（円） */
  annualExtra: number
  /** 想定の年利回り（%） */
  annualRate: number
  /** すでにNISAで保有している評価額（円） */
  initialValue: number
  /** すでに使った生涯投資枠（簿価、円） */
  usedLifetime: number
}

export interface YearRow {
  age: number
  year: number
  /** その年に積み立てた額 */
  contributed: number
  /** 積立元本の累計 */
  principal: number
  /** 年末の評価額 */
  value: number
  /** 運用益（評価額 − 元本） */
  gain: number
  /** 生涯投資枠の使用済み額 */
  usedLifetime: number
  /** この年に枠上限で積立が制限されたか */
  capped: boolean
}

export interface InvestResult {
  rows: YearRow[]
  /** 最終的な評価額 */
  finalValue: number
  /** 積立元本の合計 */
  totalPrincipal: number
  /** 運用益 */
  totalGain: number
  /** 課税口座だった場合に引かれる税金 */
  taxIfTaxable: number
  /** 生涯投資枠を使い切る年齢（届かなければ null） */
  lifetimeFullAge: number | null
}

/**
 * 月次で積み立てて複利運用した場合の推移を年単位で返す。
 * 積立は毎月末、運用は月利（年利÷12）で計算する。
 */
export function simulateInvest(p: InvestInput, startYear: number): InvestResult {
  const monthlyRate = p.annualRate / 100 / 12
  const years = Math.max(0, p.untilAge - p.currentAge)

  let value = p.initialValue
  let principal = p.initialValue
  let used = p.usedLifetime
  let lifetimeFullAge: number | null = null
  const rows: YearRow[] = []

  for (let y = 0; y < years; y++) {
    const age = p.currentAge + y
    let contributedThisYear = 0
    let capped = false

    for (let m = 0; m < 12; m++) {
      // 年間枠・生涯枠の残りを見て、積み立てられる額を決める
      const roomYear = NISA_ANNUAL_LIMIT - contributedThisYear
      const roomLife = NISA_LIFETIME_LIMIT - used
      let amount = Math.min(p.monthly, roomYear, roomLife)
      if (amount < 0) amount = 0
      if (amount < p.monthly) capped = true

      value = value * (1 + monthlyRate) + amount
      principal += amount
      contributedThisYear += amount
      used += amount
    }

    // 年1回の追加積立（ボーナスなど）
    if (p.annualExtra > 0) {
      const roomYear = NISA_ANNUAL_LIMIT - contributedThisYear
      const roomLife = NISA_LIFETIME_LIMIT - used
      const extra = Math.max(0, Math.min(p.annualExtra, roomYear, roomLife))
      if (extra < p.annualExtra) capped = true
      value += extra
      principal += extra
      contributedThisYear += extra
      used += extra
    }

    if (lifetimeFullAge === null && used >= NISA_LIFETIME_LIMIT) lifetimeFullAge = age + 1

    rows.push({
      age: age + 1,
      year: startYear + y + 1,
      contributed: Math.round(contributedThisYear),
      principal: Math.round(principal),
      value: Math.round(value),
      gain: Math.round(value - principal),
      usedLifetime: Math.round(used),
      capped,
    })
  }

  const finalValue = Math.round(value)
  const totalPrincipal = Math.round(principal)
  const totalGain = finalValue - totalPrincipal

  return {
    rows,
    finalValue,
    totalPrincipal,
    totalGain,
    taxIfTaxable: Math.round(Math.max(0, totalGain) * CAPITAL_GAINS_TAX),
    lifetimeFullAge,
  }
}

/**
 * 目標額から逆算して、必要な毎月の積立額を求める。
 * 毎月末に積み立てる年金終価の式を解く。
 */
export function requiredMonthly(target: number, years: number, annualRate: number, initialValue = 0): number {
  const i = annualRate / 100 / 12
  const m = years * 12
  if (m <= 0) return 0
  // 初期資産の将来価値を差し引いた残りを積立でまかなう
  const fvInitial = initialValue * Math.pow(1 + i, m)
  const need = Math.max(0, target - fvInitial)
  if (i === 0) return Math.ceil(need / m)
  return Math.ceil((need * i) / (Math.pow(1 + i, m) - 1))
}
