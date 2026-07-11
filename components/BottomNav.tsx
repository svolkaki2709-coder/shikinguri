"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { useViewMode } from "@/components/ViewModeContext"
import { useQuickInput } from "@/components/QuickInput"

// メイン4項目＋中央の「＋」ボタン
const mainItems = [
  { href: "/dashboard", label: "ホーム", icon: "🏠" },
  { href: "/budget", label: "予実", icon: "📅" },
  // ここに中央の＋ボタンが入る
  { href: "/history", label: "履歴", icon: "📋" },
]

// 「その他」シート内の項目
const moreItems = [
  { href: "/assets", label: "資産管理", icon: "💹" },
  { href: "/input", label: "入力ページ（定期支出の確定）", icon: "✏️" },
  { href: "/import", label: "CSV取込", icon: "📂" },
  { href: "/import-payslip", label: "給与明細取込", icon: "💴" },
  { href: "/payslip-details", label: "給与源泉管理", icon: "🧾" },
  { href: "/settings", label: "設定", icon: "⚙️" },
]

export function BottomNav() {
  const pathname = usePathname()
  const { mode } = useViewMode()
  const { open } = useQuickInput()
  const [moreOpen, setMoreOpen] = useState(false)

  if (mode === "pc") return null

  const isMoreActive = moreItems.some(i => pathname === i.href)

  return (
    <>
      {/* その他シート */}
      {moreOpen && (
        <div className="fixed inset-0 z-[90]" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute bottom-16 left-0 right-0 bg-white rounded-t-2xl shadow-xl max-w-md mx-auto overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-2.5 mb-1" />
            {moreItems.map(item => (
              <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)}
                className={`flex items-center gap-3 px-5 py-3 text-sm border-b border-gray-50 transition-colors ${
                  pathname === item.href ? "text-blue-600 font-semibold bg-blue-50" : "text-gray-700 hover:bg-gray-50"
                }`}>
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="flex items-center gap-3 px-5 py-3 text-sm text-gray-400 w-full hover:bg-gray-50 transition-colors"
            >
              <span className="text-base">🚪</span>
              <span>ログアウト</span>
            </button>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 pb-safe">
        <div className="flex items-center max-w-md mx-auto">
          {/* ホーム・予実 */}
          {mainItems.slice(0, 2).map(item => {
            const active = pathname === item.href
            return (
              <Link key={item.href} href={item.href}
                className={`flex-1 flex flex-col items-center py-2 text-xs transition-colors ${
                  active ? "text-blue-600 font-semibold" : "text-gray-500 hover:text-gray-700"
                }`}>
                <span className="text-lg mb-0.5">{item.icon}</span>
                <span className="text-[10px]">{item.label}</span>
              </Link>
            )
          })}

          {/* 中央の＋ボタン */}
          <div className="flex-1 flex justify-center">
            <button
              onClick={() => { setMoreOpen(false); open("expense") }}
              aria-label="支出・入金を記録"
              className="w-12 h-12 -mt-4 rounded-full bg-blue-600 text-white text-2xl font-bold shadow-lg shadow-blue-600/30 hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center"
            >
              ＋
            </button>
          </div>

          {/* 履歴 */}
          {mainItems.slice(2).map(item => {
            const active = pathname === item.href
            return (
              <Link key={item.href} href={item.href}
                className={`flex-1 flex flex-col items-center py-2 text-xs transition-colors ${
                  active ? "text-blue-600 font-semibold" : "text-gray-500 hover:text-gray-700"
                }`}>
                <span className="text-lg mb-0.5">{item.icon}</span>
                <span className="text-[10px]">{item.label}</span>
              </Link>
            )
          })}

          {/* その他 */}
          <button
            onClick={() => setMoreOpen(v => !v)}
            className={`flex-1 flex flex-col items-center py-2 text-xs transition-colors ${
              isMoreActive || moreOpen ? "text-blue-600 font-semibold" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <span className="text-lg mb-0.5">☰</span>
            <span className="text-[10px]">その他</span>
          </button>
        </div>
      </nav>
    </>
  )
}
