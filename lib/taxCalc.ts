/**
 * 所得税・住民税の計算。
 *
 * 会社員の節税は「所得控除をどれだけ積めるか」でほぼ決まる。
 * 控除1万円あたりの節税額＝限界税率（所得税率＋住民税10%）なので、
 * まず自分の限界税率を知ることが出発点になる。
 *
 * ⚠️ 税率・控除額は改正される。2026年初頭時点の制度で実装している。
 *    復興特別所得税（所得税額の2.1%）は2037年まで。
 */

/** 給与所得控除（2020年分以降） */
export function salaryDeduction(income: number): number {
  if (income <= 1_625_000) return Math.min(550_000, income)
  if (income <= 1_800_000) return income * 0.4 - 100_000
  if (income <= 3_600_000) return income * 0.3 + 80_000
  if (income <= 6_600_000) return income * 0.2 + 440_000
  if (income <= 8_500_000) return income * 0.1 + 1_100_000
  return 1_950_000
}

/** 所得税の速算表。課税所得から税率と控除額を返す */
export function incomeTaxBracket(taxable: number): { rate: number; deduction: number } {
  if (taxable <= 1_950_000) return { rate: 0.05, deduction: 0 }
  if (taxable <= 3_300_000) return { rate: 0.10, deduction: 97_500 }
  if (taxable <= 6_950_000) return { rate: 0.20, deduction: 427_500 }
  if (taxable <= 9_000_000) return { rate: 0.23, deduction: 636_000 }
  if (taxable <= 18_000_000) return { rate: 0.33, deduction: 1_536_000 }
  if (taxable <= 40_000_000) return { rate: 0.40, deduction: 2_796_000 }
  return { rate: 0.45, deduction: 4_796_000 }
}

/** 復興特別所得税の率 */
const RECONSTRUCTION = 1.021
/** 住民税の所得割 */
const RESIDENT_RATE = 0.10
/** 住民税の均等割（森林環境税1,000円込み） */
const RESIDENT_FLAT = 5_000

/**
 * 生命保険料控除（新制度）。
 * 一般・介護医療・個人年金それぞれに適用し、所得税は各4万円・合計12万円が上限。
 * 住民税は各2.8万円・合計7万円が上限。
 */
export function lifeInsuranceDeduction(premium: number): { income: number; resident: number } {
  let inc: number
  if (premium <= 20_000) inc = premium
  else if (premium <= 40_000) inc = premium * 0.5 + 10_000
  else if (premium <= 80_000) inc = premium * 0.25 + 20_000
  else inc = 40_000

  let res: number
  if (premium <= 12_000) res = premium
  else if (premium <= 32_000) res = premium * 0.5 + 6_000
  else if (premium <= 56_000) res = premium * 0.25 + 14_000
  else res = 28_000

  return { income: Math.floor(inc), resident: Math.floor(res) }
}

export interface TaxInput {
  /** 年間の給与収入（額面。通勤手当などの非課税分は除く） */
  salaryIncome: number
  /** 社会保険料の年額（健康保険・厚生年金・雇用保険・介護保険など） */
  socialInsurance: number
  /** iDeCo・企業型DCマッチングの年間掛金 */
  idecoAnnual: number
  /** 生命保険料の年間払込額（一般・介護医療・個人年金の合計として簡易に扱う） */
  lifeInsuranceAnnual: number
  /** 医療費控除の対象額（支払額−保険等で補填された額） */
  medicalExpense: number
  /** 配偶者控除・配偶者特別控除の額（0なら対象外） */
  spouseDeduction: number
  /** 扶養控除の合計額 */
  dependentDeduction: number
}

export interface TaxResult {
  salaryIncome: number
  /** 給与所得（収入 − 給与所得控除） */
  employmentIncome: number
  /** 所得控除の合計（所得税ベース） */
  deductionsIncome: number
  /** 課税所得（所得税ベース） */
  taxableIncome: number
  /** 課税所得（住民税ベース。基礎控除が43万円で計算する） */
  taxableResident: number
  /** 所得税（復興特別所得税込み） */
  incomeTax: number
  /** 住民税（所得割＋均等割） */
  residentTax: number
  /** 合計 */
  totalTax: number
  /** 所得税の限界税率（復興特別所得税を除く） */
  marginalIncomeRate: number
  /** 控除1円あたりの節税額。所得税率×1.021 ＋ 住民税10% */
  marginalTotalRate: number
  /** 住民税の所得割額。ふるさと納税の上限計算に使う */
  residentIncomeLevy: number
  /** 医療費控除の額（10万円 or 所得5%を超えた分） */
  medicalDeduction: number
}

/** 基礎控除（合計所得2,400万円以下） */
const BASIC_INCOME = 480_000
const BASIC_RESIDENT = 430_000

export function calcTax(p: TaxInput): TaxResult {
  const employmentIncome = Math.max(0, p.salaryIncome - salaryDeduction(p.salaryIncome))

  // 医療費控除: 10万円と「所得の5%」の少ないほうを超えた分
  const medicalThreshold = Math.min(100_000, employmentIncome * 0.05)
  const medicalDeduction = Math.max(0, p.medicalExpense - medicalThreshold)

  const life = lifeInsuranceDeduction(p.lifeInsuranceAnnual)

  const common =
    p.socialInsurance + p.idecoAnnual + medicalDeduction + p.spouseDeduction + p.dependentDeduction

  const deductionsIncome = common + BASIC_INCOME + life.income
  const deductionsResident = common + BASIC_RESIDENT + life.resident

  const taxableIncome = Math.max(0, Math.floor((employmentIncome - deductionsIncome) / 1000) * 1000)
  const taxableResident = Math.max(0, Math.floor((employmentIncome - deductionsResident) / 1000) * 1000)

  const b = incomeTaxBracket(taxableIncome)
  const baseIncomeTax = Math.max(0, taxableIncome * b.rate - b.deduction)
  const incomeTax = Math.floor(baseIncomeTax * RECONSTRUCTION)

  const residentIncomeLevy = Math.floor(taxableResident * RESIDENT_RATE)
  const residentTax = residentIncomeLevy + RESIDENT_FLAT

  return {
    salaryIncome: p.salaryIncome,
    employmentIncome,
    deductionsIncome,
    taxableIncome,
    taxableResident,
    incomeTax,
    residentTax,
    totalTax: incomeTax + residentTax,
    marginalIncomeRate: b.rate,
    marginalTotalRate: b.rate * RECONSTRUCTION + RESIDENT_RATE,
    residentIncomeLevy,
    medicalDeduction,
  }
}

/**
 * ふるさと納税の控除上限額（自己負担2,000円で済む寄付額）。
 *
 * 特例分の控除は住民税所得割の20%が上限なので、そこから逆算する。
 *   上限 = 住民税所得割 × 20% ÷ (90% − 所得税率 × 1.021) + 2,000円
 */
export function furusatoLimit(r: TaxResult): number {
  const denominator = 0.9 - r.marginalIncomeRate * RECONSTRUCTION
  if (denominator <= 0) return 0
  return Math.floor((r.residentIncomeLevy * 0.2) / denominator + 2000)
}

/** iDeCoの上限額（月額）。企業年金の有無で変わる */
export const IDECO_LIMITS = [
  { key: "none", label: "企業年金なし（会社員）", monthly: 23_000 },
  { key: "dc", label: "企業型DCのみ加入", monthly: 20_000 },
  { key: "db", label: "確定給付企業年金（DB）等に加入", monthly: 12_000 },
  { key: "self", label: "自営業・フリーランス（第1号）", monthly: 68_000 },
  { key: "spouse", label: "専業主婦(夫)（第3号）", monthly: 23_000 },
] as const

/** ある控除額を積んだときの節税額 */
export function savingFrom(base: TaxResult, extraDeduction: number, input: TaxInput): number {
  const after = calcTax({ ...input, idecoAnnual: input.idecoAnnual + extraDeduction })
  return base.totalTax - after.totalTax
}
