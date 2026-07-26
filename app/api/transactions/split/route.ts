import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized, forbidden } from "@/lib/session"

interface Part {
  category: string
  amount: number
  memo?: string
}

/**
 * 1件の明細を複数カテゴリへ分割する。
 * 例: 10,000円の会計を「立替費用 6,000」と「外食 4,000」に分ける。
 *
 * 分割後の合計は元の金額と一致していなければならない（家計の総額は変わらないため）。
 * 元の行を1つ目の内訳に書き換え、残りを同じ日付・口座で追加する。
 */
export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { id, parts } = (await req.json()) as { id: number; parts: Part[] }
  if (!id || !Array.isArray(parts) || parts.length < 2) {
    return NextResponse.json(
      { error: "分割するには内訳が2つ以上必要です" }, { status: 400 }
    )
  }

  const cleaned = parts.map(p => ({
    category: String(p.category ?? "").trim(),
    amount: Math.round(Number(p.amount)),
    memo: typeof p.memo === "string" ? p.memo : null,
  }))
  if (cleaned.some(p => !p.category)) {
    return NextResponse.json({ error: "カテゴリが未選択の内訳があります" }, { status: 400 })
  }
  if (cleaned.some(p => !Number.isFinite(p.amount) || p.amount <= 0)) {
    return NextResponse.json({ error: "金額は1円以上で入力してください" }, { status: 400 })
  }

  const [original] = await sql<{
    id: number; date: string; card_id: number | null; amount: number; memo: string | null
    source: string | null; owner_user_id: number | null
    import_log_id: number | null; split_group_id: number | null
  }>`
    SELECT id, date::text, card_id, amount, memo, source, owner_user_id, import_log_id, split_group_id
    FROM transactions
    WHERE id = ${Number(id)} AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
    LIMIT 1
  `
  if (!original) return forbidden()

  const total = cleaned.reduce((s, p) => s + p.amount, 0)
  if (total !== Number(original.amount)) {
    return NextResponse.json(
      {
        error: `内訳の合計（¥${total.toLocaleString()}）が元の金額（¥${Number(original.amount).toLocaleString()}）と一致しません`,
      },
      { status: 400 }
    )
  }

  // 既に分割済みの行を再分割した場合も、元の会計にまとめて紐付ける
  const groupId = original.split_group_id ?? original.id

  const [first, ...rest] = cleaned
  await sql`
    UPDATE transactions
    SET category = ${first.category},
        amount = ${first.amount},
        memo = ${first.memo ?? original.memo ?? ""},
        split_group_id = ${groupId}
    WHERE id = ${original.id}
  `
  for (const p of rest) {
    await sql`
      INSERT INTO transactions
        (date, card_id, category, amount, memo, source, owner_user_id, import_log_id, split_group_id)
      VALUES (${original.date}, ${original.card_id}, ${p.category}, ${p.amount},
              ${p.memo ?? original.memo ?? ""}, ${original.source ?? "manual"},
              ${original.owner_user_id}, ${original.import_log_id}, ${groupId})
    `
  }

  return NextResponse.json({ success: true, parts: cleaned.length, splitGroupId: groupId })
}
