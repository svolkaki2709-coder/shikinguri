import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { sql } from "@/lib/db"

// テーブル自動作成
async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS payslip_details (
      id            SERIAL PRIMARY KEY,
      payment_month VARCHAR(7) NOT NULL,  -- YYYY-MM
      gross_pay     INTEGER,
      net_pay       INTEGER,
      income_tax    INTEGER,
      resident_tax  INTEGER,
      health_insurance    INTEGER,
      pension             INTEGER,
      employment_insurance INTEGER,
      travel_reimbursement    INTEGER,
      nontaxable_commute      INTEGER,
      taxable_commute         INTEGER,
      total_deduction    INTEGER,
      year_end_adjustment INTEGER,
      created_at    TIMESTAMP DEFAULT NOW(),
      updated_at    TIMESTAMP DEFAULT NOW(),
      UNIQUE (payment_month)
    )
  `
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await ensureTable()

  const rows = await sql`
    SELECT *
    FROM payslip_details
    ORDER BY payment_month DESC
  `
  return NextResponse.json({ details: rows })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await ensureTable()

  const body = await req.json()
  const {
    payment_month,
    gross_pay,
    net_pay,
    income_tax,
    resident_tax,
    health_insurance,
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

  // UPSERT: 同月のデータがあれば上書き
  const result = await sql`
    INSERT INTO payslip_details (
      payment_month, gross_pay, net_pay, income_tax, resident_tax,
      health_insurance, pension, employment_insurance,
      travel_reimbursement, nontaxable_commute, taxable_commute,
      total_deduction, year_end_adjustment, updated_at
    ) VALUES (
      ${payment_month},
      ${gross_pay ?? null}, ${net_pay ?? null},
      ${income_tax ?? null}, ${resident_tax ?? null},
      ${health_insurance ?? null}, ${pension ?? null}, ${employment_insurance ?? null},
      ${travel_reimbursement ?? null}, ${nontaxable_commute ?? null}, ${taxable_commute ?? null},
      ${total_deduction ?? null}, ${year_end_adjustment ?? null},
      NOW()
    )
    ON CONFLICT (payment_month) DO UPDATE SET
      gross_pay            = EXCLUDED.gross_pay,
      net_pay              = EXCLUDED.net_pay,
      income_tax           = EXCLUDED.income_tax,
      resident_tax         = EXCLUDED.resident_tax,
      health_insurance     = EXCLUDED.health_insurance,
      pension              = EXCLUDED.pension,
      employment_insurance = EXCLUDED.employment_insurance,
      travel_reimbursement = EXCLUDED.travel_reimbursement,
      nontaxable_commute   = EXCLUDED.nontaxable_commute,
      taxable_commute      = EXCLUDED.taxable_commute,
      total_deduction      = EXCLUDED.total_deduction,
      year_end_adjustment  = EXCLUDED.year_end_adjustment,
      updated_at           = NOW()
    RETURNING *
  `
  return NextResponse.json({ detail: result[0] })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = searchParams.get("month")
  if (!month) return NextResponse.json({ error: "month が必要です" }, { status: 400 })

  await sql`DELETE FROM payslip_details WHERE payment_month = ${month}`
  return NextResponse.json({ ok: true })
}
