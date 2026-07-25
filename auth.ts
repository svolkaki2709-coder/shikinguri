import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { sql } from "@/lib/db"

/**
 * アクセス可否は users テーブルで管理する（設定 → メンバー から追加）。
 * users が空のときだけ、初回セットアップ用にこのアドレスを受け入れる。
 */
const BOOTSTRAP_EMAIL = "s.vol.kaki2709@gmail.com"

/** ユーザーの有効性を再確認する間隔。停止・削除はこの時間内に反映される。 */
const REVALIDATE_MS = 5 * 60 * 1000

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
  // 退会・停止から最大でもこの期間でアクセスが切れるよう、セッション自体も短めにする
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 },
  callbacks: {
    // 未登録・停止中のアカウントにはセッションを発行しない
    async signIn({ user }) {
      if (!user.email) return false
      return (await findActiveUser(user.email)) !== null
    },

    /**
     * トークンにユーザーIDを載せる。
     *
     * 一度焼き込んで終わりにすると、メンバーを停止・削除しても相手のブラウザに
     * 残ったトークンが生き続けてしまう（共同データを読み書きできてしまう）。
     * かといって毎リクエストDBを引くと遅いので、REVALIDATE_MS ごとに再確認する。
     */
    async jwt({ token, user }) {
      const email = user?.email ?? token.email
      if (!email) return token

      const last = typeof token.checkedAt === "number" ? token.checkedAt : 0
      const fresh = token.uid != null && Date.now() - last < REVALIDATE_MS
      if (fresh) return token

      const dbUser = await findActiveUser(email)
      if (!dbUser) {
        // 停止・削除済み、またはDB不通。uid を落としてアクセスを打ち切る
        delete token.uid
        delete token.displayName
        return token
      }
      token.uid = dbUser.id
      token.displayName = dbUser.display_name
      token.checkedAt = Date.now()
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
