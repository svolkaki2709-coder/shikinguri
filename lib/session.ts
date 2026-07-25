import { NextResponse } from "next/server"
import { auth } from "@/auth"

export interface CurrentUser {
  id: number
  email: string
}

/**
 * ログイン中のユーザーを返す。未ログイン／未登録なら null。
 *
 * 【スコープ規約】データの可視範囲は owner_user_id 一本で決まる。
 *   owner_user_id IS NULL … 共同（世帯メンバー全員が閲覧可）
 *   owner_user_id = <id>  … そのユーザーの個人データ（本人のみ閲覧可）
 *
 * 参照系クエリには必ず次の条件を入れること:
 *   AND (owner_user_id IS NULL OR owner_user_id = ${me.id})
 *
 * 更新・削除系では「共同 or 自分のもの」であることを WHERE で確認すること。
 * 他人の個人データに触れられる経路を作らないこと。
 */
export async function requireUser(): Promise<CurrentUser | null> {
  const session = await auth()
  const uid = session?.user?.uid
  if (uid == null) return null
  return { id: Number(uid), email: session!.user.email ?? "" }
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}

export function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}

/**
 * card_type（'self' | 'joint'）から、書き込み時の owner_user_id を決める。
 * 'joint' は共同なので NULL、それ以外は本人の個人データ。
 */
export function ownerFor(cardType: string | null | undefined, userId: number): number | null {
  return cardType === "joint" ? null : userId
}

/** owner_user_id からUI上の card_type を復元する。 */
export function cardTypeOf(ownerUserId: number | null): "self" | "joint" {
  return ownerUserId == null ? "joint" : "self"
}
