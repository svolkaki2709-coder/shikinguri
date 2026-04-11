export { auth as middleware } from "./auth"

export const config = {
  // APIルートはミドルウェアから除外（各ルート内でauth()を呼ぶ）
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
}
