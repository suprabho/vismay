'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { MatchRow } from '@/lib/seasonBooks/matches'

type Entry = { status: 'loading' } | { status: 'ready'; matches: MatchRow[] } | { status: 'error'; error: string }

interface MatchDataValue {
  get: (competition: string) => Entry | undefined
  load: (competition: string) => void
}

const Ctx = createContext<MatchDataValue | null>(null)

/** One fetch per competition-season, shared by the beat finder, cards and thumbnails. */
export function MatchDataProvider({ seasonStart, children }: { seasonStart: number; children: React.ReactNode }) {
  const [entries, setEntries] = useState<Record<string, Entry>>({})
  const started = useRef(new Set<string>())

  const load = useCallback((competition: string) => {
    if (!competition || started.current.has(competition)) return
    started.current.add(competition)
    setEntries(e => ({ ...e, [competition]: { status: 'loading' } }))
    const params = new URLSearchParams({ season: String(seasonStart), competition })
    fetch(`/api/footshorts/books/matches?${params}`, { cache: 'no-store' })
      .then(async r => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error ?? 'Could not load matches')
        setEntries(e => ({ ...e, [competition]: { status: 'ready', matches: data.matches } }))
      })
      .catch(err => {
        // Let a later view retry after a transient failure.
        started.current.delete(competition)
        setEntries(e => ({ ...e, [competition]: { status: 'error', error: err.message } }))
      })
  }, [seasonStart])

  const get = useCallback((competition: string) => entries[competition], [entries])
  return <Ctx.Provider value={{ get, load }}>{children}</Ctx.Provider>
}

/** The competition's matches, loading them on first use. */
export function useMatches(competition: string | null | undefined): Entry | undefined {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useMatches needs a MatchDataProvider')
  const { load, get } = ctx
  useEffect(() => { if (competition) load(competition) }, [competition, load])
  return competition ? get(competition) : undefined
}
