import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized, forbidden, ownerFor } from "@/lib/session"

// スキーマ定義は scripts/migrations 側に集約した。
// （旧 migrateBudgets はリクエスト毎にDDLを流し、owner込みのユニーク制約を
//   古い定義へ巻き戻してしまうため廃止）

export async function GET(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const now = new Date()
  const month =
    searchParams.get("month") ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  // 優先順位: この月だけ > この月以降（最新） > 毎月共通
  const budgets = await sql`
    SELECT DISTINCT ON (b.category, b.card_type)
      b.category, b.card_type, b.amount, b.month, b.is_from_month,
      c.group_type, c.sort_order, c.sign
    FROM budgets b
    LEFT JOIN categories c ON c.name = b.category AND c.card_type = b.card_type
      AND COALESCE(c.owner_user_id, 0) = COALESCE(b.owner_user_id, 0)
    WHERE (b.owner_user_id IS NULL OR b.owner_user_id = ${me.id})
      AND (b.month = ${month}
       OR (COALESCE(b.is_from_month, FALSE) = TRUE AND b.month <= ${month})
       OR b.month IS NULL)
    ORDER BY b.category, b.card_type,
      CASE
        WHEN b.month = ${month} AND NOT COALESCE(b.is_from_month, FALSE) THEN 0
        WHEN COALESCE(b.is_from_month, FALSE) = TRUE THEN 1
        ELSE 2
      END,
      b.month DESC NULLS LAST
  `

  const [actuals, incomeActuals] = await Promise.all([
    sql`
      SELECT t.category, c.card_type, SUM(t.amount) AS actual
      FROM transactions t
      LEFT JOIN cards c ON t.card_id = c.id
      WHERE TO_CHAR(t.date, 'YYYY-MM') = ${month}
        AND (t.owner_user_id IS NULL OR t.owner_user_id = ${me.id})
      GROUP BY t.category, c.card_type
    `,
    sql`
      SELECT category, card_type, SUM(amount) AS actual
      FROM incomes
      WHERE TO_CHAR(date, 'YYYY-MM') = ${month}
        AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
      GROUP BY category, card_type
    `,
  ])

  const actualMap: Record<string, number> = {}
  for (const r of actuals) {
    actualMap[`${r.category}__${r.card_type}`] = Number(r.actual)
  }
  // 収入テーブルの実績を合算
  for (const r of incomeActuals) {
    const key = `${r.category}__${r.card_type}`
    actualMap[key] = (actualMap[key] ?? 0) + Number(r.actual)
  }

  const rows = budgets.map((b) => {
    const effSign = b.sign === "plus" ? 1 : b.sign === "minus" ? -1
      : b.group_type === "収入" ? 1 : b.group_type === "振替" ? 0 : -1
    const rawActual = actualMap[`${b.category}__${b.card_type}`] ?? 0
    const actual = effSign === -1 && rawActual < 0 ? Math.abs(rawActual) : rawActual
    return {
      category: b.category,
      cardType: b.card_type,
      budget: Number(b.amount),
      actual,
      isMonthly: b.month === month && !b.is_from_month,
      isFromMonth: b.is_from_month === true,
      recordMonth: b.month ?? null,
      groupType: (b.group_type ?? null) as string | null,
      sortOrder: (b.sort_order ?? null) as number | null,
      sign: (b.sign ?? null) as string | null,
    }
  })

  // 予算が無くても実績があるカテゴリを行として補う。
  // 予実画面は budgets テーブルを起点に組み立てているため、その月に予算レコードが
  // 解決しないカテゴリ（例: 単発で登録した臨時収入）は、明細があるのに画面から
  // 丸ごと消えてしまい、上部の合計と グループカードの数字が食い違っていた。
  const seen = new Set(rows.map(r => `${r.category}__${r.cardType}`))
  const catRows = await sql<{
    name: string; card_type: string; group_type: string | null; sort_order: number | null; sign: string | null
  }>`
    SELECT name, card_type, group_type, sort_order, sign FROM categories
    WHERE (owner_user_id IS NULL OR owner_user_id = ${me.id})
  `
  const catMap = new Map(catRows.map(c => [`${c.name}__${c.card_type}`, c]))

  for (const [key, rawActual] of Object.entries(actualMap)) {
    if (seen.has(key) || !rawActual) continue
    const sep = key.lastIndexOf("__")
    const category = key.slice(0, sep)
    const cardType = key.slice(sep + 2)
    if (cardType !== "self" && cardType !== "joint") continue

    const c = catMap.get(key)
    const effSign = c?.sign === "plus" ? 1 : c?.sign === "minus" ? -1
      : c?.group_type === "収入" ? 1 : c?.group_type === "振替" ? 0 : -1
    rows.push({
      category,
      cardType,
      budget: 0,
      actual: effSign === -1 && rawActual < 0 ? Math.abs(rawActual) : rawActual,
      isMonthly: false,
      isFromMonth: false,
      recordMonth: null,
      groupType: c?.group_type ?? null,
      sortOrder: c?.sort_order ?? null,
      sign: c?.sign ?? null,
    })
  }

  // 全デフォルト一覧も返す（設定UI用）
  const defaults = await sql`
    SELECT category, card_type, amount FROM budgets
    WHERE month IS NULL AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    ORDER BY card_type, category
  `

  return NextResponse.json({
    budgets: rows,
    defaults: defaults.map(b => ({ category: b.category, cardType: b.card_type, budget: Number(b.amount) })),
    month,
  })
}

export async function PUT(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  try {
    const { category, amount, card_type, month, is_from_month } = await req.json()
    const ct = card_type === "joint" ? "joint" : "self"
    const owner = ownerFor(ct, me.id)

    if (month) {
      if (is_from_month) {
        // 新しい開始月以降のレコードだけ削除（それより前の「以降」レコードは残す）
        await sql`
          DELETE FROM budgets
          WHERE category = ${category} AND card_type = ${ct}
            AND COALESCE(owner_user_id, 0) = COALESCE(${owner}, 0)
            AND COALESCE(is_from_month, FALSE) = TRUE AND month >= ${month}
        `
      }
      // 同じ month のレコードを削除（制約違反を防ぐ）
      await sql`
        DELETE FROM budgets
        WHERE category = ${category} AND card_type = ${ct}
          AND COALESCE(owner_user_id, 0) = COALESCE(${owner}, 0)
          AND month = ${month}
      `
      await sql`
        INSERT INTO budgets (category, amount, card_type, month, is_from_month, owner_user_id)
        VALUES (${category}, ${Number(amount)}, ${ct}, ${month}, ${!!is_from_month}, ${owner})
      `
    } else {
      // デフォルト予算（month = NULL）
      const existing = await sql<{ id: number }>`
        SELECT id FROM budgets
        WHERE category = ${category} AND card_type = ${ct}
          AND COALESCE(owner_user_id, 0) = COALESCE(${owner}, 0)
          AND month IS NULL
      `
      if (existing.length > 0) {
        await sql`UPDATE budgets SET amount = ${Number(amount)} WHERE id = ${existing[0].id}`
      } else {
        await sql`
          INSERT INTO budgets (category, amount, card_type, month, owner_user_id)
          VALUES (${category}, ${Number(amount)}, ${ct}, NULL, ${owner})
        `
      }
    }
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[PUT /api/budget] error:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { searchParams } = new URL(req.url)
  const category = searchParams.get("category")
  const cardType = searchParams.get("card_type")
  const month = searchParams.get("month")  // なければデフォルトを削除

  if (!category || !cardType) return NextResponse.json({ error: "category, card_type は必須です" }, { status: 400 })
  const owner = ownerFor(cardType, me.id)

  const deleted = month
    ? await sql`
        DELETE FROM budgets
        WHERE category = ${category} AND card_type = ${cardType}
          AND COALESCE(owner_user_id, 0) = COALESCE(${owner}, 0)
          AND month = ${month}
        RETURNING id
      `
    : await sql`
        DELETE FROM budgets
        WHERE category = ${category} AND card_type = ${cardType}
          AND COALESCE(owner_user_id, 0) = COALESCE(${owner}, 0)
          AND month IS NULL
        RETURNING id
      `
  if (deleted.length === 0) return forbidden()
  return NextResponse.json({ success: true })
}
