import "next-auth"
import "next-auth/jwt"
import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    // 組込の user.id は string 型なので、DBの数値IDは uid として別に持つ
    user: {
      uid: number
      displayName?: string | null
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: number
    displayName?: string | null
  }
}
