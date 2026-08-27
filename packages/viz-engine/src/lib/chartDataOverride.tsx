'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Per-render override for data-driven chart JSON, keyed by chart id (the id
 * `GenericChart` receives — i.e. with any `data:` prefix already stripped by
 * `ChartPanel`). When provided, `GenericChart` uses the override instead of
 * fetching `/api/chart-data/<slug>/<id>`.
 *
 * Used by the admin share-card composer to render a per-card edited chart
 * WITHOUT mutating the story's stored chart-data. The live story deck never
 * mounts a provider, so `useChartDataOverride` returns `undefined` there and
 * the normal fetch path is byte-for-byte unchanged.
 */
export type ChartDataOverrides = Record<string, unknown>

const ChartDataOverrideContext = createContext<ChartDataOverrides | null>(null)

export function ChartDataOverrideProvider({
  value,
  children,
}: {
  value: ChartDataOverrides
  children: ReactNode
}) {
  return (
    <ChartDataOverrideContext.Provider value={value}>
      {children}
    </ChartDataOverrideContext.Provider>
  )
}

/** Returns the override data for `id`, or `undefined` if none (or no provider). */
export function useChartDataOverride(id: string): unknown | undefined {
  const map = useContext(ChartDataOverrideContext)
  if (!map) return undefined
  return map[id]
}
