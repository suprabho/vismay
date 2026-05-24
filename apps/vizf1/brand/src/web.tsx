'use client'

import type { ReactNode } from 'react'
import { F1_BRAND } from './index'

export type ThemeProviderProps = {
  children: ReactNode
}

/**
 * Single-theme passthrough. Tailwind v4's `@theme` directive in globals.css
 * already exposes the F1 palette as CSS variables, so there's no var injection
 * to do here. The component exists as a slot that mirrors the footshorts
 * ThemeProvider's API, so flipping to multi-theme later (classic/legend/
 * race-week) is a contained change.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  return <div data-vizf1-theme="default">{children}</div>
}

export const useTheme = () => ({ theme: F1_BRAND })
