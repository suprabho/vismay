'use client'

import { useEffect, useMemo, useState } from 'react'
import type { OverlayKind } from '../types'

interface EntityResult {
  id: string
  type: 'team' | 'league'
  slug: string
  name: string
  crest_url: string | null
}

interface FlagOption {
  code: string
  name: string
}

/**
 * Crest / competition-logo / country-flag picker. Searches the footshorts data
 * routes (`/api/footshorts/data/entities` + `/flags`) and calls `onPick` with a
 * usable image URL, label, and overlay kind. Lifted out of ShareCardCreator so
 * both the inline controls and the foreground "+ Crest / + Flag" add-buttons
 * share one implementation.
 */
export function BadgeFlagPicker({ onPick }: { onPick: (url: string, label: string, kind: OverlayKind) => void }) {
  const [tab, setTab] = useState<'badges' | 'flags'>('badges')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<EntityResult[]>([])
  const [loading, setLoading] = useState(false)
  const [flagList, setFlagList] = useState<FlagOption[] | null>(null)
  const [flagQuery, setFlagQuery] = useState('')

  const searchBadges = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/footshorts/data/entities?q=${encodeURIComponent(query.trim())}&limit=40`)
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: EntityResult[] }
      setResults(body.items ?? [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  // Load the flag list lazily the first time the Flags tab is opened.
  useEffect(() => {
    if (tab !== 'flags' || flagList !== null) return
    let alive = true
    void (async () => {
      try {
        const res = await fetch('/api/footshorts/data/flags')
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: FlagOption[] }
        if (alive) setFlagList(body.items ?? [])
      } catch {
        if (alive) setFlagList([])
      }
    })()
    return () => {
      alive = false
    }
  }, [tab, flagList])

  const filteredFlags = useMemo(() => {
    const q = flagQuery.trim().toLowerCase()
    const list = flagList ?? []
    return (q ? list.filter((f) => f.name.toLowerCase().includes(q)) : list).slice(0, 60)
  }, [flagList, flagQuery])

  return (
    <div className="space-y-2">
      <div className="flex overflow-hidden rounded-md border border-white/10">
        {(['badges', 'flags'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-2 py-1.5 text-[11px] ${
              tab === t ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {t === 'badges' ? 'Crests / Logos' : 'Flags'}
          </button>
        ))}
      </div>

      {tab === 'badges' ? (
        <>
          <div className="flex gap-1.5">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void searchBadges()}
              placeholder="Search team or competition…"
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-white/30"
            />
            <button
              onClick={() => void searchBadges()}
              className="rounded-md bg-white/10 px-2.5 py-1.5 text-xs text-neutral-100 hover:bg-white/20"
            >
              {loading ? '…' : 'Find'}
            </button>
          </div>
          {results.length > 0 && (
            <div className="grid max-h-44 grid-cols-4 gap-1.5 overflow-y-auto">
              {results.map((r) =>
                r.crest_url ? (
                  <button
                    key={r.id}
                    onClick={() => onPick(r.crest_url!, r.name, r.type === 'league' ? 'logo' : 'crest')}
                    title={r.name}
                    className="flex aspect-square items-center justify-center rounded-md border border-white/10 bg-neutral-900 p-1.5 hover:border-white/30"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.crest_url} alt={r.name} className="max-h-full max-w-full object-contain" />
                  </button>
                ) : null,
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <input
            value={flagQuery}
            onChange={(e) => setFlagQuery(e.target.value)}
            placeholder={flagList === null ? 'Loading countries…' : 'Search country…'}
            className="w-full rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-white/30"
          />
          <div className="grid max-h-44 grid-cols-4 gap-1.5 overflow-y-auto">
            {filteredFlags.map((f) => {
              const url = `https://flagcdn.com/w320/${f.code}.png`
              return (
                <button
                  key={f.code}
                  onClick={() => onPick(url, f.name, 'flag')}
                  title={f.name}
                  className="flex aspect-square items-center justify-center rounded-md border border-white/10 bg-neutral-900 p-1 hover:border-white/30"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={f.name} className="max-h-full max-w-full rounded-sm object-contain" />
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
