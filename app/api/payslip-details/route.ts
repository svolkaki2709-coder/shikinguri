import { NextRequest, NextResponse } from "next/server"
import { requireUser, unauthorized, forbidden } from "@/lib/session"
import { sql } from "@/lib/db"

// スキーマ定義は scripts/migrations 側に集約した。
// （旧 ensureTable は owner_user_id を持たない・UNIQUE(payment_month) が世帯全体で
//   衝突する古い定義でテーブルを作り直してしまうため廃止）

export async function GET() {
  const me = await requireUser()
  if (!me) return unauthorized()


  const rows = await sql`
    SELECT *
    FROM payslip_details
    WHERE owner_user_id = ${me.id}
    ORDER BY payment_month DESC
  `
  return NextResponse.json({ details: rows })
}

export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()


  const body = await req.json()
  const {
    payment_month,
    gross_pay,
    net_pay,
    income_tax,
    resident_tax,
    health_insurance,
    nursing_insurance,
    childcare_contribution,
    pension,
    employment_insurance,
    travel_reimbursement,
    nontaxable_commute,
    taxable_commute,
    total_deduction,
    year_end_adjustment,
  } = body

  if (!payment_month) {
    return NextResponse.json({ error: "payment_month は必須です" }, { status: 400 })
  }

  // UPSERT: 同月のデータがあれば上書き（給与明細は常に個人データ）
  const existing = await sql`
    SELECT id FROM payslip_details
    WHERE payment_month = ${payment_month} AND owner_user_id = ${me.id} LIMIT 1
  `
  const result = existing.length > 0
    ? await sql`
        UPDATE payslip_details SET
          gross_pay            = ${gross_pay ?? null},
          net_pay              = ${net_pay ?? null},
          income_tax           = ${income_tax ?? null},
          resident_tax         = ${resident_tax ?? null},
          health_insurance     = ${health_insurance ?? null},
          nursing_insurance    = ${nursing_insurance ?? null},
          childcare_contribution = ${childcare_contribution ?? null},
          pension              = ${pension ?? null},
          employment_insurance = ${employment_insurance ?? null},
          travel_reimbursement = ${travel_reimbursement ?? null},
          nontaxable_commute   = ${nontaxable_commute ?? null},
          taxable_commute      = ${taxable_commute ?? null},
          total_deduction      = ${total_deduction ?? null},
          year_end_adjustment  = ${year_end_adjustment ?? null},
          updated_at           = NOW()
        WHERE id = ${existing[0].id}
        RETURNING *
      `
    : await sql`
        INSERT INTO payslip_details (
          payment_month, gross_pay, net_pay, income_tax, resident_tax,
          health_insurance, nursing_insurance, childcare_contribution,
          pension, employment_insurance,
          travel_reimbursement, nontaxable_commute, taxable_commute,
          total_deduction, year_end_adjustment, owner_user_id, updated_at
        ) VALUES (
          ${payment_month},
          ${gross_pay ?? null}, ${net_pay ?? null},
          ${income_tax ?? null}, ${resident_tax ?? null},
          ${health_insurance ?? null}, ${nursing_insurance ?? null}, ${childcare_contribution ?? null},
          ${pension ?? null}, ${employment_insurance ?? null},
          ${travel_reimbursement ?? null}, ${nontaxable_commute ?? null}, ${taxable_commute ?? null},
          ${total_deduction ?? null}, ${year_end_adjustment ?? null}, ${me.id},
          NOW()
        )
        RETURNING *
      `
  return NextResponse.json({ detail: result[0] })
}

export async function DELETE(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const month = searchParams.get("month")
  if (!month) return NextResponse.json({ error: "month が必要です" }, { status: 400 })

  const deleted = await sql`
    DELETE FROM payslip_details
    WHERE payment_month = ${month} AND owner_user_id = ${me.id}
    RETURNING id
  `
  if (deleted.length === 0) return forbidden()
  return NextResponse.json({ ok: true })
}
