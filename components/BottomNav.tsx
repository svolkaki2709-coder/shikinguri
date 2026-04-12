"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useViewMode } from "@/components/ViewModeContext"

const navItems = [
  { href: "/dashboard", label: "ホーム", icon: "📊" },
  { href: "/input", label: "入力", icon: "✏️" },
  { href: "/history", label: "履歴", icon: "📋" },
  { href: "/import", label: "CSV", icon: "📂" },
  { href: "/budget", label: "予算", icon: "📅" },
  { href: "/assets", label: "資産", icon: "💹" },
  { href: "/settings", label: "設定", icon: "⚙️" },
]

export function BottomNav() {
  const pathname = usePathname()
  const { mode } = useViewMode()

  if (mode === "pc") return null

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 pb-safe">
      <div className="flex max-w-md mx-auto">
        {navItems.map((item) => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center py-2 px-0.5 text-xs transition-colors ${
                active ? "text-blue-600 font-semibold" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <span className="text-lg mb-0.5">{item.icon}</span>
              <span className="text-[10px]">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
