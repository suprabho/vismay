'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { SpreadPack } from '@/lib/seasonBooks/spreadPack'

const SpreadPacksContext = createContext<Record<string, SpreadPack>>({})

/** The book's data packs, read once: every canvas under it draws from them. A failed read leaves the match-data render. */
export function SpreadPacksProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  const [packs, setPacks] = useState<Record<string, SpreadPack>>({})
  useEffect(() => {
    let live = true
    fetch(`/api/footshorts/books/${slug}/packs`).then(r => (r.ok ? r.json() : null)).then(body => { if (live && body?.packs) setPacks(body.packs) }).catch(() => {})
    return () => { live = false }
  }, [slug])
  return <SpreadPacksContext.Provider value={packs}>{children}</SpreadPacksContext.Provider>
}

export function useSpreadPack(key: string): SpreadPack | null {
  return useContext(SpreadPacksContext)[key] ?? null
}
