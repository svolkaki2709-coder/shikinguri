"use client"
import { useViewMode } from "./ViewModeContext"
import { ReactNode } from "react"

interface Props {
  children: ReactNode
  className?: string
}

export function PageContainer({ children, className = "" }: Props) {
  const { mode } = useViewMode()
  if (mode === "pc") {
    return <div className={`px-6 py-4 ${className}`}>{children}</div>
  }
  return <div className={`max-w-md mx-auto px-4 py-2 ${className}`}>{children}</div>
}
