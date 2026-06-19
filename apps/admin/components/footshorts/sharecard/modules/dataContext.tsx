'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { FixtureRow, StandingRow, FixtureEvent } from '@vismay/footshorts-viz/types'
import type { AspectRatio, NewsItem } from '../types'

/** Competition metadata used for card headers (name + season), keyed by compKey. */
export interface CompMeta {
  compKey: string
  name: string
  season: string
}

/**
 * The live football/news data the `fscard:*` layers resolve against. The host
 * (ShareCardCreator) fetches it and INJECTS it here — modules never fetch
 * directly. This mirrors viz-engine's `chartDataOverride` host-injection: the
 * live preview and the capture node both mount under one provider, so there is a
 * single data path (and capture can gate on it). Keyed by compKey so layers that
 * share a competition share one cache, and layers on different competitions
 * (m2+) each resolve independently.
 */
export interface FootshortsCardData {
  compMeta: Record<string, CompMeta>
  fixturesByComp: Record<string, FixtureRow[]>
  standingsByComp: Record<string, StandingRow[]>
  eventsByFixture: Record<string, FixtureEvent[]>
  news: NewsItem[]
  /** Card aspect ratio — frame-level, but modules read it for row caps. */
  ratio: AspectRatio
}

const DataCtx = createContext<FootshortsCardData | null>(null)

export function FootshortsDataProvider({
  value,
  children,
}: {
  value: FootshortsCardData
  children: ReactNode
}) {
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>
}

function useFootshortsData(): FootshortsCardData {
  const v = useContext(DataCtx)
  if (!v) {
    throw new Error('fscard:* module rendered outside <FootshortsDataProvider>')
  }
  return v
}

export function useCardRatio(): AspectRatio {
  return useFootshortsData().ratio
}

export function useFootshortsStandings(compKey: string): {
  rows: StandingRow[]
  meta: CompMeta | null
} {
  const d = useFootshortsData()
  return { rows: d.standingsByComp[compKey] ?? [], meta: d.compMeta[compKey] ?? null }
}

export function useFootshortsFixtures(compKey: string): {
  fixtures: FixtureRow[]
  meta: CompMeta | null
} {
  const d = useFootshortsData()
  return { fixtures: d.fixturesByComp[compKey] ?? [], meta: d.compMeta[compKey] ?? null }
}

export function useFootshortsEvents(fixtureId: string): FixtureEvent[] {
  return useFootshortsData().eventsByFixture[fixtureId] ?? []
}

export function useFootshortsNews(): NewsItem[] {
  return useFootshortsData().news
}
