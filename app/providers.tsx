"use client"

import { SessionProvider } from "next-auth/react"
import { ViewModeProvider } from "@/components/ViewModeContext"
import { QuickInputProvider } from "@/components/QuickInput"
import { CaretKeeper } from "@/components/CaretKeeper"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <CaretKeeper />
      <QuickInputProvider>
        <ViewModeProvider>{children}</ViewModeProvider>
      </QuickInputProvider>
    </SessionProvider>
  )
}
