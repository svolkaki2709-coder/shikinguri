/**
 * ファイナンシャルプランニングの計算ロジック。
 *
 * UIから切り離した純粋関数にしてある（画面を変えても計算式は動かない）。
 * 金額はすべて「円」で受け渡す。
 *
 * 制度の数値は2024年度時点のもの。改定されたらここの定数だけ直せばよい。
 */

// ═══════════════════════════════════════════════════════════════
// 住宅ローン（元利均等返済）
// ═══════════════════════════════════════════════════════════════

export interface MortgageInput {
  principal: number      // 借入額（円）
  annualRate: number     // 年利（%）
  years: number          // 返済期間（年）
  startYear: number      // 返済開始年
  annualIncome: number   // 税込年収（円）※返済比率の判定に使う
  prepayment: number     // 繰上返済額（円）※0なら試算しない
  deductionCap: number   // 住宅ローン控除の借入限度額（円）
}

export interface MortgageResult {
  monthly: number
  annual: number
  totalPayment: number
  totalInterest: number
  endYear: number
  /** 年収に対する年間返済額の割合（%）。25%以下が安全圏、35%が金融機関の上限目安 */
  paymentRatio: number
  /** 繰上返済（期間短縮型）の効果 */
  prepayEffect: { interestSaved: number; monthsSaved: number } | null
  /** 住宅ローン控除（年末残高×0.7%、13年間）の目安 */
  deduction: { firstYear: number; total: number; annualAvg: number }
}

/** 元利均等返済の毎月返済額 */
export function monthlyPayment(principal: number, annualRate: number, years: number): number {
  const r = annualRate / 100 / 12
  const n = years * 12
  if (n <= 0) return 0
  if (r === 0) return principal / n
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

/** 返済表を回して、総利息と各年末残高を出す */
function amortize(principal: number, annualRate: number, years: number, monthly: number) {
  const r = annualRate / 100 / 12
  const n = years * 12
  let bal = principal
  let totalInterest = 0
  const yearEndBalances: number[] = []

  for (let m = 1; m <= n; m++) {
    const interest = bal * r
    totalInterest += interest
    bal = bal + interest - monthly
    if (bal < 0) bal = 0
    if (m % 12 === 0) yearEndBalances.push(bal)
  }
  return { totalInterest, yearEndBalances }
}

/** 繰上返済（期間短縮型）後の総利息と返済月数 */
function simulatePrepay(principal: number, annualRate: number, monthly: number, prepay: number) {
  const r = annualRate / 100 / 12
  let bal = principal - prepay
  let interest = 0
  let months = 0
  if (bal <= 0) return { interest: 0, months: 0 }

  while (bal > 0 && months < 1200) {
    const i = bal * r
    const principalPaid = monthly - i
    if (principalPaid <= 0) return null // 返済額が利息を下回る＝完済しない
    interest += i
    bal -= principalPaid
    months++
  }
  return { interest, months }
}

export function calcMortgage(p: MortgageInput): MortgageResult {
  const monthly = monthlyPayment(p.principal, p.annualRate, p.years)
  const n = p.years * 12
  const { totalInterest, yearEndBalances } = amortize(p.principal, p.annualRate, p.years, monthly)

  let prepayEffect: MortgageResult["prepayEffect"] = null
  if (p.prepayment > 0 && p.prepayment < p.principal) {
    const after = simulatePrepay(p.principal, p.annualRate, monthly, p.prepayment)
    if (after) {
      prepayEffect = {
        interestSaved: totalInterest - after.interest,
        monthsSaved: n - after.months,
      }
    }
  }

  // 住宅ローン控除: 年末残高（借入限度額まで）× 0.7% を最大13年
  let deductionTotal = 0
  let deductionFirst = 0
  const deductionYears = Math.min(13, yearEndBalances.length)
  for (let i = 0; i < deductionYears; i++) {
    const target = Math.min(yearEndBalances[i], p.deductionCap)
    const amount = target * 0.007
    if (i === 0) deductionFirst = amount
    deductionTotal += amount
  }

  return {
    monthly,
    annual: monthly * 12,
    totalPayment: monthly * n,
    totalInterest,
    endYear: p.startYear + p.years - 1,
    paymentRatio: p.annualIncome > 0 ? (monthly * 12) / p.annualIncome * 100 : 0,
    prepayEffect,
    deduction: {
      firstYear: deductionFirst,
      total: deductionTotal,
      annualAvg: deductionYears > 0 ? deductionTotal / deductionYears : 0,
    },
  }
}

// ═══════════════════════════════════════════════════════════════
// 公的年金
// ═══════════════════════════════════════════════════════════════

/** 老齢基礎年金の満額（2024年度・年額） */
export const BASIC_PENSION_FULL = 816000
/** 報酬比例部分の給付乗率（2003年4月以降の総報酬制） */
const KOUSEI_COEF = 5.481 / 1000
/** 標準報酬月額の上限 */
const REMUNERATION_CAP = 650000

export interface PensionInput {
  avgAnnualIncome: number  // 生涯の平均年収（円・賞与込み）
  enrolledMonths: number   // 厚生年金の加入月数
  basicMonths: number      // 国民年金の納付月数（最大480ヶ月＝40年）
  startAge: number         // 受給開始年齢（60〜75）
}

export interface PensionResult {
  basic: number        // 老齢基礎年金（年額）
  kousei: number       // 老齢厚生年金（年額）
  total: number        // 合計（年額）
  monthly: number      // 月額
  /** 繰上げ／繰下げによる増減率（1.0 = 65歳受給） */
  rate: number
  /** 65歳受給の場合の合計（比較用） */
  baseTotal: number
}

export function calcPension(p: PensionInput): PensionResult {
  const avgMonthly = Math.min(p.avgAnnualIncome / 12, REMUNERATION_CAP)
  const basic = BASIC_PENSION_FULL * (Math.min(p.basicMonths, 480) / 480)
  const kousei = avgMonthly * KOUSEI_COEF * p.enrolledMonths

  // 繰上げ 月0.4%減 / 繰下げ 月0.7%増（2022年4月以降のルール）
  let rate = 1
  if (p.startAge < 65) rate = 1 - 0.004 * (65 - p.startAge) * 12
  if (p.startAge > 65) rate = 1 + 0.007 * (p.startAge - 65) * 12
  rate = Math.max(0, rate)

  const total = (basic + kousei) * rate
  return {
    basic: basic * rate,
    kousei: kousei * rate,
    total,
    monthly: total / 12,
    rate,
    baseTotal: basic + kousei,
  }
}

// ═══════════════════════════════════════════════════════════════
// 遺族年金・必要保障額
// ═══════════════════════════════════════════════════════════════

/** 遺族年金の年額（簡易計算） */
export function calcSurvivorPension(p: {
  avgAnnualIncome: number
  enrolledMonths: number
  /** 18歳年度末までの子の人数 */
  childCount: number
}) {
  const avgMonthly = Math.min(p.avgAnnualIncome / 12, REMUNERATION_CAP)
  // 遺族厚生年金 = 老齢厚生年金の報酬比例部分の3/4
  const izokuKousei = avgMonthly * KOUSEI_COEF * p.enrolledMonths * 0.75

  // 遺族基礎年金 = 満額 + 子の加算（第1・2子 各234,800円、第3子以降 各78,300円）
  let childAdd = 0
  for (let i = 1; i <= p.childCount; i++) childAdd += i <= 2 ? 234800 : 78300
  const izokuKiso = p.childCount > 0 ? BASIC_PENSION_FULL + childAdd : 0

  return { izokuKiso, izokuKousei, total: izokuKiso + izokuKousei }
}

export interface InsuranceInput {
  // ── 遺族に必要なお金 ──
  annualLivingCost: number       // 現在の年間生活費
  yearsUntilIndependence: number // 末子が独立するまでの年数
  spouseRemainingYears: number   // 末子独立後、配偶者が生きる想定年数
  educationCost: number          // 教育費の総額
  annualHousingCost: number      // 遺族が負担し続ける年間住居費（団信ありの持ち家なら0）
  housingYears: number
  funeralCost: number
  emergencyFund: number          // 予備費
  // ── 遺族が受け取れるお金 ──
  survivorPensionAnnual: number  // 遺族年金の年額
  survivorPensionYears: number   // 遺族年金を受け取る年数
  spouseAnnualIncome: number     // 配偶者の年収
  spouseWorkYears: number        // 配偶者が働く年数
  currentAssets: number          // 現在の金融資産
  deathBenefit: number           // 死亡退職金・既加入の死亡保険金
}

export interface InsuranceResult {
  /** 遺族の生活費（末子独立まで70%、その後50%で見積もる標準的な方法） */
  livingBeforeIndependence: number
  livingAfterIndependence: number
  housing: number
  needTotal: number
  pensionTotal: number
  spouseIncomeTotal: number
  haveTotal: number
  /** 必要保障額（不足額）。マイナスなら保険は不要という判定 */
  shortfall: number
}

export function calcInsuranceNeed(p: InsuranceInput): InsuranceResult {
  // 遺族の生活費は「現在の生活費の70%（末子独立まで）→ 50%（その後）」で見るのが一般的
  const livingBefore = p.annualLivingCost * 0.7 * p.yearsUntilIndependence
  const livingAfter = p.annualLivingCost * 0.5 * p.spouseRemainingYears
  const housing = p.annualHousingCost * p.housingYears

  const needTotal =
    livingBefore + livingAfter + housing + p.educationCost + p.funeralCost + p.emergencyFund

  const pensionTotal = p.survivorPensionAnnual * p.survivorPensionYears
  const spouseIncomeTotal = p.spouseAnnualIncome * p.spouseWorkYears
  const haveTotal = pensionTotal + spouseIncomeTotal + p.currentAssets + p.deathBenefit

  return {
    livingBeforeIndependence: livingBefore,
    livingAfterIndependence: livingAfter,
    housing,
    needTotal,
    pensionTotal,
    spouseIncomeTotal,
    haveTotal,
    shortfall: needTotal - haveTotal,
  }
}
