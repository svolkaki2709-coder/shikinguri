"use client"

import { SessionProvider } from "next-auth/react"
import { ViewModeProvider } from "@/components/ViewModeContext"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ViewModeProvider>{children}</ViewModeProvider>
    </SessionProvider>
  )
}
