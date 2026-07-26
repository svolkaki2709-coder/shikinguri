import { NextResponse } from "next/server"
import { requireUser, unauthorized } from "@/lib/session"
import { seedPersonalSpace } from "@/lib/seed"

/** 自分の「個人」スペースに初期カテゴリと支払方法を用意する（冪等） */
export async function POST() {
  const me = await requireUser()
  if (!me) return unauthorized()

  const result = await seedPersonalSpace(me.id)
  return NextResponse.json(result)
}
