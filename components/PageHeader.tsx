"use client"

import { signOut } from "next-auth/react"
import { useViewMode } from "@/components/ViewModeContext"

interface PageHeaderProps {
  title: string
}

export function PageHeader({ title }: PageHeaderProps) {
  const { mode, toggle } = useViewMode()

  return (
    <header className="sticky top-0 bg-white border-b border-gray-100 z-40">
      <div className={`flex items-center justify-between px-4 py-2.5 ${mode === "mobile" ? "max-w-md mx-auto" : ""}`}>
        <h1 className="text-base font-bold text-gray-800">{title}</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={toggle}
            title={mode === "pc" ? "スマホ表示に切り替え" : "PC表示に切り替え"}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 border border-gray-200 rounded-md px-2 py-1 transition-colors"
          >
            {mode === "pc" ? (
              <>📱 <span>スマホ</span></>
            ) : (
              <>🖥️ <span>PC</span></>
            )}
          </button>
          {mode === "mobile" && (
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              ログアウト
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
