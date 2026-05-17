'use client'

import type { ReactNode } from 'react'
import { ThemeProvider as BrandThemeProvider } from '@vizf1/brand/web'

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <BrandThemeProvider>{children}</BrandThemeProvider>
}
