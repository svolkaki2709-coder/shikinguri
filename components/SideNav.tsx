"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"

const navItems = [
  { href: "/dashboard", label: "ダッシュボード", icon: "📊" },
  { href: "/input", label: "手動入力", icon: "✏️" },
  { href: "/history", label: "明細履歴", icon: "📋" },
  { href: "/import", label: "CSV取込", icon: "📂" },
  { href: "/import-payslip", label: "給与明細取込", icon: "💴" },
  { href: "/budget", label: "予算管理", icon: "📅" },
  { href: "/assets", label: "資産管理", icon: "💹" },
  { href: "/settings", label: "設定", icon: "⚙️" },
]

export function SideNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed left-0 top-0 h-full w-44 bg-white border-r border-gray-100 z-40 flex flex-col shadow-sm">
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-xl">📒</span>
          <div>
            <h1 className="text-sm font-bold text-gray-800 leading-tight">shikinguri</h1>
            <p className="text-xs text-gray-400">柿岡家計管理</p>
          </div>
        </div>
      </div>
      <div className="flex-1 py-2 space-y-0.5 px-2 overflow-y-auto">
        {navItems.map(item => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-blue-50 text-blue-600 font-semibold"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <span className="text-sm w-4 text-center">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </div>
      <div className="px-4 py-3 border-t border-gray-100">
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          ログアウト
        </button>
      </div>
    </nav>
  )
}
