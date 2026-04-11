import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

const ALLOWED_EMAIL = "s.vol.kaki2709@gmail.com"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
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
  },
})
