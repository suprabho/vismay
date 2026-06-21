'use client'

import { useState } from 'react'
import type { LogoSearchResult } from '@/app/api/vizmaya/share-cards/logo-search/route'
import { labelCls } from './controls'

/** Background a logo is destined for — picks the Brandfetch `theme` variant.
 *  `null` = brand's primary logo; `light`/`dark` request the on-light / on-dark
 *  version (a dark logo for light backgrounds, a light logo for dark ones). */
type ForBg = null | 'light' | 'dark'

const BG_OPTIONS: Array<{ key: ForBg; label: string }> = [
  { key: null, label: 'Auto' },
  { key: 'light', label: 'Light bg' },
  { key: 'dark', label: 'Dark bg' },
]

/**
 * Brand-logo search backed by Brandfetch. Type a company name → pick a brand →
 * the chosen logo is fetched server-side and handed back as a base64 data URL
 * (capture-safe) via `onPick`. Surfaced inside {@link ImagePicker}, so it feeds
 * every image slot (foreground element + background).
 */
export function LogoPicker({ onPick }: { onPick: (dataUrl: string) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LogoSearchResult[]>([])
  const [forBg, setForBg] = useState<ForBg>(null)
  const [searching, setSearching] = useState(false)
  const [picking, setPicking] = useState<string | null>(null) // domain in flight
  const [error, setError] = useState<string | null>(null)

  const search = async () => {
    const q = query.trim()
    if (q.length < 2) return
    setSearching(true)
    setError(null)
    try {
      const res = await fetch(`/api/vizmaya/share-cards/logo-search?q=${encodeURIComponent(q)}`)
      const body = (await res.json().catch(() => ({}))) as { results?: LogoSearchResult[]; error?: string }
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setResults(body.results ?? [])
      if ((body.results ?? []).length === 0) setError('No brands found.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  const pick = async (r: LogoSearchResult) => {
    setPicking(r.domain)
    setError(null)
    try {
      const params = new URLSearchParams({ domain: r.domain })
      if (r.icon) params.set('icon', r.icon)
      if (forBg) params.set('theme', forBg)
      const res = await fetch(`/api/vizmaya/share-cards/logo-image?${params}`)
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; dataUrl?: string; error?: string }
      if (!res.ok || !body.ok || !body.dataUrl) throw new Error(body.error ?? `HTTP ${res.status}`)
      onPick(body.dataUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load logo')
    } finally {
      setPicking(null)
    }
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-white/10 bg-neutral-950/60 p-2.5">
      <span className={labelCls}>Brand logo</span>
      <div className="flex gap-1.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void search()
            }
          }}
          placeholder="Search a brand…"
          className="min-w-0 flex-1 rounded border border-white/10 bg-neutral-950 px-2 py-1.5 text-[12px] text-neutral-100 outline-none focus:border-white/30"
        />
        <button
          onClick={() => void search()}
          disabled={searching || query.trim().length < 2}
          className="shrink-0 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-neutral-100 hover:bg-white/20 disabled:opacity-40"
        >
          {searching ? '…' : 'Search'}
        </button>
      </div>

      <div className="flex items-center gap-1">
        {BG_OPTIONS.map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => setForBg(o.key)}
            className={`rounded border px-1.5 py-0.5 text-[10px] ${
              forBg === o.key ? 'border-sky-400/70 bg-white/5 text-white' : 'border-white/10 text-neutral-400'
            } hover:bg-white/10`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {results.length > 0 && (
        <div className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.domain}
              type="button"
              disabled={picking != null}
              onClick={() => void pick(r)}
              className="flex items-center gap-2 rounded-md border border-white/10 bg-neutral-900 px-2 py-1.5 text-left hover:border-white/30 disabled:opacity-50"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded bg-white/90">
                {r.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.icon} alt="" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-[10px] text-neutral-500">{r.name.slice(0, 1)}</span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] text-neutral-100">{r.name}</span>
                <span className="block truncate text-[10px] text-neutral-500">{r.domain}</span>
              </span>
              {picking === r.domain && <span className="shrink-0 text-[10px] text-neutral-400">adding…</span>}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  )
}
