"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { useQuickInput } from "@/components/QuickInput"

const sections: { title: string; items: { href: string; label: string; icon: string }[] }[] = [
  {
    title: "見る",
    items: [
      { href: "/dashboard", label: "ダッシュボード", icon: "🏠" },
      { href: "/budget", label: "予実管理", icon: "📅" },
      { href: "/history", label: "明細履歴", icon: "📋" },
      { href: "/assets", label: "資産管理", icon: "💹" },
    ],
  },
  {
    title: "記録する",
    items: [
      { href: "/input", label: "手動入力", icon: "✏️" },
      { href: "/import", label: "CSV取込", icon: "📂" },
      { href: "/import-payslip", label: "給与明細取込", icon: "💴" },
      { href: "/payslip-details", label: "給与源泉管理", icon: "🧾" },
    ],
  },
  {
    title: "管理",
    items: [
      { href: "/settings", label: "設定", icon: "⚙️" },
    ],
  },
]

export function SideNav() {
  const pathname = usePathname()
  const { open } = useQuickInput()

  return (
    <nav className="fixed left-0 top-0 h-full w-44 bg-slate-900 border-r border-slate-800 z-40 flex flex-col shadow-sm">
      <div className="px-4 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xl">📒</span>
          <div>
            <h1 className="text-sm font-bold text-slate-100 leading-tight">shikinguri</h1>
            <p className="text-xs text-slate-500">柿岡家計管理</p>
          </div>
        </div>
      </div>

      {/* クイック入力ボタン */}
      <div className="px-3 pt-3">
        <button
          onClick={() => open("expense")}
          className="w-full flex items-center justify-center gap-1.5 bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          <span className="text-base leading-none">＋</span>
          <span>記録する</span>
        </button>
      </div>

      <div className="flex-1 py-2 px-2 overflow-y-auto">
        {sections.map(section => (
          <div key={section.title} className="mb-2">
            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-slate-500 tracking-wider">{section.title}</p>
            <div className="space-y-0.5">
              {section.items.map(item => {
                const active = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                      active
                        ? "bg-blue-500/10 text-blue-400 font-semibold"
                        : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                    }`}
                  >
                    <span className="text-sm w-4 text-center">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 py-3 border-t border-slate-800">
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
        >
          ログアウト
        </button>
      </div>
    </nav>
  )
}
