"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { usePathname } from "next/navigation"
import { SideNav } from "./SideNav"

type ViewMode = "pc" | "mobile"

interface ViewModeContextType {
  mode: ViewMode
  toggle: () => void
}

const ViewModeContext = createContext<ViewModeContextType>({
  mode: "pc",
  toggle: () => {},
})

export function useViewMode() {
  return useContext(ViewModeContext)
}

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ViewMode>("pc")
  const pathname = usePathname()
  const isLoginPage = pathname === "/"

  useEffect(() => {
    const saved = localStorage.getItem("viewMode") as ViewMode | null
    if (saved === "pc" || saved === "mobile") setMode(saved)
  }, [])

  const toggle = () => {
    setMode(m => {
      const next = m === "pc" ? "mobile" : "pc"
      localStorage.setItem("viewMode", next)
      return next
    })
  }

  return (
    <ViewModeContext.Provider value={{ mode, toggle }}>
      {mode === "pc" && !isLoginPage ? (
        <div className="pc-layout flex min-h-screen bg-gray-50">
          <SideNav />
          <div className="flex-1 ml-52 min-h-screen overflow-auto">
            {children}
          </div>
        </div>
      ) : (
        <>{children}</>
      )}
    </ViewModeContext.Provider>
  )
}
