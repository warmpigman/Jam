"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
// import { Toaster } from "sonner"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      enableColorScheme
    >
      {children}
      {/* <Toaster 
        position="top-right"
        richColors={false}
        expand={false}
        visibleToasts={5}
        closeButton={false}
        dismissible={true}
        swipeDirection="right"
        toastOptions={{
          duration: 5000,
          className: "",
          style: { margin: "0" },
          dismissible: true, // Make ALL toasts dismissable
        }}
        theme="dark"
        gap={4} // Smaller gap between toasts
      /> */}
    </NextThemesProvider>
  )
}


