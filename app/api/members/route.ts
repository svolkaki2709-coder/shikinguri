import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUser, unauthorized, forbidden } from "@/lib/session"
import { seedPersonalSpace } from "@/lib/seed"

interface MemberRow {
  id: number
  email: string
  display_name: string | null
  role: string
  is_active: boolean
  created_at: string
}

async function isOwner(userId: number) {
  const [row] = await sql<{ role: string }>`SELECT role FROM users WHERE id = ${userId} LIMIT 1`
  return row?.role === "owner"
}

export async function GET() {
  const me = await requireUser()
  if (!me) return unauthorized()

  const members = await sql<MemberRow>`
    SELECT id, email, display_name, role, is_active, created_at::text
    FROM users ORDER BY id
  `
  // 自分の個人スペースが使える状態か（カテゴリと支払方法があるか）
  const [{ cat, acc }] = await sql<{ cat: number; acc: number }>`
    SELECT
      (SELECT COUNT(*) FROM categories WHERE owner_user_id = ${me.id})::int AS cat,
      (SELECT COUNT(*) FROM cards      WHERE owner_user_id = ${me.id})::int AS acc
  `
  return NextResponse.json({
    members,
    me: {
      id: me.id,
      isOwner: await isOwner(me.id),
      personal: { categories: cat, accounts: acc, ready: cat > 0 && acc > 0 },
    },
  })
}

// メンバーを招待（Googleアカウントのメールアドレスを登録する）
export async function POST(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()
  if (!(await isOwner(me.id))) return forbidden()

  const { email, display_name } = await req.json()
  const addr = String(email ?? "").trim().toLowerCase()
  if (!addr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
    return NextResponse.json({ error: "メールアドレスの形式が正しくありません" }, { status: 400 })
  }

  const existing = await sql<{ id: number }>`SELECT id FROM users WHERE lower(email) = ${addr} LIMIT 1`
  if (existing.length > 0) {
    return NextResponse.json({ error: "このアドレスは既に登録されています" }, { status: 400 })
  }

  const [created] = await sql<MemberRow>`
    INSERT INTO users (email, display_name, role)
    VALUES (${addr}, ${display_name?.trim() || addr}, 'member')
    RETURNING id, email, display_name, role, is_active, created_at::text
  `
  // 招待した相手がログインしてすぐ個人タブを使えるよう、
  // その人専用のカテゴリと支払方法を用意しておく（中身は空・こちらからは見えない）
  const seed = await seedPersonalSpace(created.id)
  return NextResponse.json({ member: created, seed })
}

// 有効／停止の切り替え、表示名の変更
export async function PATCH(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()

  const { id, is_active, display_name } = await req.json()
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

  const targetId = Number(id)
  // 表示名は本人も変更できる。有効／停止の切り替えは owner のみ。
  const changingActive = typeof is_active === "boolean"
  if (changingActive && !(await isOwner(me.id))) return forbidden()
  if (!changingActive && targetId !== me.id && !(await isOwner(me.id))) return forbidden()

  const [target] = await sql<{ role: string }>`SELECT role FROM users WHERE id = ${targetId} LIMIT 1`
  if (!target) return NextResponse.json({ error: "メンバーが見つかりません" }, { status: 404 })
  if (changingActive && target.role === "owner") {
    return NextResponse.json({ error: "世帯の管理者は停止できません" }, { status: 400 })
  }

  const [updated] = await sql<MemberRow>`
    UPDATE users SET
      is_active    = COALESCE(${changingActive ? is_active : null}, is_active),
      display_name = COALESCE(${display_name?.trim() || null}, display_name)
    WHERE id = ${targetId}
    RETURNING id, email, display_name, role, is_active, created_at::text
  `
  return NextResponse.json({ member: updated })
}

export async function DELETE(req: NextRequest) {
  const me = await requireUser()
  if (!me) return unauthorized()
  if (!(await isOwner(me.id))) return forbidden()

  const { searchParams } = new URL(req.url)
  const id = Number(searchParams.get("id"))
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 })

  const [target] = await sql<{ role: string }>`SELECT role FROM users WHERE id = ${id} LIMIT 1`
  if (!target) return NextResponse.json({ error: "メンバーが見つかりません" }, { status: 404 })
  if (target.role === "owner") {
    return NextResponse.json({ error: "世帯の管理者は削除できません" }, { status: 400 })
  }

  // 個人データは owner_user_id の ON DELETE CASCADE で一緒に消える。
  // 共同データ（owner_user_id IS NULL）は世帯に残る。
  const [personal] = await sql<{ n: number }>`
    SELECT (
      (SELECT COUNT(*) FROM transactions WHERE owner_user_id = ${id}) +
      (SELECT COUNT(*) FROM incomes      WHERE owner_user_id = ${id})
    )::int AS n
  `
  await sql`DELETE FROM users WHERE id = ${id}`
  return NextResponse.json({ success: true, deletedPersonalRows: personal.n })
}
