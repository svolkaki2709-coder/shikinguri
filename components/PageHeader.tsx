"use client"

import { signOut } from "next-auth/react"

interface PageHeaderProps {
  title: string
}

export function PageHeader({ title }: PageHeaderProps) {
  return (
    <header className="sticky top-0 bg-white border-b border-gray-200 z-40">
      <div className="max-w-md mx-auto flex items-center justify-between px-4 py-3">
        <h1 className="text-lg font-bold text-gray-800">{title}</h1>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          ログアウト
        </button>
      </div>
    </header>
  )
}
