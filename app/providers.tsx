"use client"

import { SessionProvider } from "next-auth/react"
import { ViewModeProvider } from "@/components/ViewModeContext"
import { QuickInputProvider } from "@/components/QuickInput"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <QuickInputProvider>
        <ViewModeProvider>{children}</ViewModeProvider>
      </QuickInputProvider>
    </SessionProvider>
  )
}
