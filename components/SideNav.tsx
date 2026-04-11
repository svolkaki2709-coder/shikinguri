"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const navItems = [
  { href: "/dashboard", label: "ホーム", icon: "📊" },
  { href: "/input", label: "入力", icon: "✏️" },
  { href: "/history", label: "履歴", icon: "📋" },
  { href: "/import", label: "CSV", icon: "📂" },
  { href: "/assets", label: "資産", icon: "💹" },
  { href: "/settings", label: "設定", icon: "⚙️" },
]

export function SideNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed left-0 top-0 h-full w-52 bg-white border-r border-gray-200 z-40 flex flex-col py-4">
      <div className="px-4 mb-3">
        <div className="text-2xl">📒</div>
        <h1 className="text-sm font-bold text-gray-800 mt-1">家計簿</h1>
        <p className="text-xs text-gray-700">柿岡家計管理</p>
      </div>
      <div className="flex-1 space-y-0.5 px-2">
        {navItems.map(item => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-blue-50 text-blue-600 font-semibold"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
