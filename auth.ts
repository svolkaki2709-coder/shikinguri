import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

const ALLOWED_EMAIL = "s.vol.kaki2709@gmail.com"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/spreadsheets",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user
      const isAllowed = auth?.user?.email === ALLOWED_EMAIL
      const isOnLoginPage = request.nextUrl.pathname === "/"
      if (!isLoggedIn) return isOnLoginPage
      if (!isAllowed) return false
      if (isOnLoginPage) {
        return Response.redirect(new URL("/dashboard", request.nextUrl))
      }
      return true
    },
    jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.expiresAt = account.expires_at
      }
      return token
    },
    session({ session, token }) {
      session.accessToken = token.accessToken as string
      return session
    },
  },
})
