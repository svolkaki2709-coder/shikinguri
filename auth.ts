import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { sql } from "@/lib/db"

/**
 * アクセス可否は users テーブルで管理する（設定 → メンバー から追加）。
 * users が空のときだけ、初回セットアップ用にこのアドレスを受け入れる。
 */
const BOOTSTRAP_EMAIL = "s.vol.kaki2709@gmail.com"

type DbUser = { id: number; display_name: string | null; is_active: boolean }

async function findActiveUser(email: string): Promise<DbUser | null> {
  try {
    const rows = await sql<DbUser>`
      SELECT id, display_name, is_active FROM users WHERE lower(email) = lower(${email}) LIMIT 1
    `
    if (rows.length > 0) return rows[0].is_active ? rows[0] : null

    // users テーブルが空＝初回セットアップ時のみブートストラップを許可
    const [{ n }] = await sql<{ n: number }>`SELECT COUNT(*)::int AS n FROM users`
    if (n === 0 && email.toLowerCase() === BOOTSTRAP_EMAIL.toLowerCase()) {
      const [created] = await sql<DbUser>`
        INSERT INTO users (email, display_name) VALUES (${email}, ${email})
        RETURNING id, display_name, is_active
      `
      return created
    }
    return null
  } catch {
    // DB不通時はアクセスを許可しない（フェイルクローズ）
    return null
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    // 未登録・停止中のアカウントにはセッションを発行しない
    async signIn({ user }) {
      if (!user.email) return false
      return (await findActiveUser(user.email)) !== null
    },

    // ログイン時にユーザーIDをトークンへ焼き込む（以降のリクエストではDBを引かない）
    async jwt({ token, user }) {
      const email = user?.email ?? token.email
      // uid 未設定のトークンだけ補完する。
      // （マルチユーザー化以前に発行された既存セッションを、再ログインさせずに引き継ぐため）
      if (token.uid == null && email) {
        const dbUser = await findActiveUser(email)
        if (dbUser) {
          token.uid = dbUser.id
          token.displayName = dbUser.display_name
        }
      }
      return token
    },

    async session({ session, token }) {
      if (token.uid != null) {
        session.user.uid = Number(token.uid)
        session.user.displayName = (token.displayName as string | null) ?? null
      }
      return session
    },

    authorized({ auth, request }) {
      // uid を持たないトークンは未登録ユーザーとみなす
      const isLoggedIn = auth?.user?.uid != null
      const isOnLoginPage = request.nextUrl.pathname === "/"
      if (!isLoggedIn) return isOnLoginPage
      if (isOnLoginPage) {
        return Response.redirect(new URL("/dashboard", request.nextUrl))
      }
      return true
    },
  },
})
