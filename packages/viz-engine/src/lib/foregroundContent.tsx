'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { ResolvedUnit } from './storyConfig.types'

/**
 * Per-unit content available to foreground modules that need access to
 * resolved section data (heading, subheading, paragraphs, hero parts, etc.)
 * without redoing markdown anchor resolution on the client.
 *
 * Provided by `<ForegroundLayoutSlot>` once per active unit. The text
 * module reads from this context to render the section's paragraphs while
 * staying decoupled from the page-level resolver.
 *
 * Modules outside the foreground region pipeline (chart, image, map) do not
 * read this — they consume `VizRenderProps.config` directly.
 */
export interface ForegroundContent {
  unit: ResolvedUnit
}

const ForegroundContentContext = createContext<ForegroundContent | null>(null)

export function ForegroundContentProvider({
  value,
  children,
}: {
  value: ForegroundContent
  children: ReactNode
}) {
  return (
    <ForegroundContentContext.Provider value={value}>
      {children}
    </ForegroundContentContext.Provider>
  )
}

/**
 * Returns the active unit's resolved content. Returns `null` when called
 * outside a `<ForegroundContentProvider>` — modules should fall back to
 * config-supplied content in that case (e.g. the chart panel renders fine
 * without any foreground content).
 */
export function useForegroundContent(): ForegroundContent | null {
  return useContext(ForegroundContentContext)
}
