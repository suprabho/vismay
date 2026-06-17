'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ThemeName } from '@footshorts/brand'
import { AssetStudioPreview } from './AssetStudioPreview'
import { buildPreviewData } from './previewData'
import { THEME_LABELS, THEME_NAMES } from './themeVars'

/** Structurally matches `AssetEntity` from content-source/footshortsData (kept
 *  local so this client module doesn't import the server-only data file). */
export interface AssetEntity {
  id: string
  type: 'team' | 'league'
  slug: string
  name: string
  country: string | null
  crest_url: string | null
  primary_color: string | null
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/
/** Seed color for an entity that has no saved primary color yet. */
const FALLBACK_COLOR = '#1F6FEB'

function normalizeHex(value: string): string | null {
  const v = value.trim()
  return HEX_RE.test(v) ? v.toUpperCase() : null
}

export function AssetStudio({ initialEntities }: { initialEntities: AssetEntity[] }) {
  const [type, setType] = useState<'team' | 'league'>('team')
  const [query, setQuery] = useState('')
  const [entities, setEntities] = useState<AssetEntity[]>(initialEntities)
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [selected, setSelected] = useState<AssetEntity | null>(initialEntities[0] ?? null)
  const [color, setColor] = useState<string>(initialEntities[0]?.primary_color ?? FALLBACK_COLOR)
  const [hexText, setHexText] = useState<string>(color)

  const [activeTheme, setActiveTheme] = useState<ThemeName>('classic')

  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // ── search (debounced) ──────────────────────────────────────────────────────
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    const handle = setTimeout(async () => {
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      setLoading(true)
      setSearchError(null)
      try {
        const params = new URLSearchParams({ type })
        if (query.trim()) params.set('q', query.trim())
        const res = await fetch(`/api/footshorts/assets/entities?${params}`, { signal: ac.signal })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error ?? 'search failed')
        setEntities(json.items as AssetEntity[])
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setSearchError(e instanceof Error ? e.message : 'search failed')
        }
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(handle)
  }, [query, type])

  // ── selection ───────────────────────────────────────────────────────────────
  const selectEntity = useCallback((e: AssetEntity) => {
    setSelected(e)
    const c = e.primary_color && HEX_RE.test(e.primary_color) ? e.primary_color.toUpperCase() : FALLBACK_COLOR
    setColor(c)
    setHexText(c)
    setSaveMsg(null)
    setSaveError(null)
  }, [])

  const applyColor = useCallback((value: string) => {
    setColor(value.toUpperCase())
    setHexText(value.toUpperCase())
    setSaveMsg(null)
  }, [])

  const onHexInput = useCallback((value: string) => {
    setHexText(value)
    const hex = normalizeHex(value)
    if (hex) {
      setColor(hex)
      setSaveMsg(null)
    }
  }, [])

  // ── persist ─────────────────────────────────────────────────────────────────
  const dirty = selected != null && (selected.primary_color?.toUpperCase() ?? null) !== color
  const savedHexInvalid = hexText !== '' && !normalizeHex(hexText)

  const persist = useCallback(
    async (primaryColor: string | null) => {
      if (!selected) return
      setSaving(true)
      setSaveMsg(null)
      setSaveError(null)
      try {
        const res = await fetch(`/api/footshorts/assets/entities/${selected.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ primary_color: primaryColor }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error ?? 'save failed')
        const updated = json.entity as AssetEntity
        setSelected(updated)
        setEntities((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
        setSaveMsg(primaryColor ? `Saved ${primaryColor}` : 'Color cleared')
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'save failed')
      } finally {
        setSaving(false)
      }
    },
    [selected],
  )

  const previewData = useMemo(() => {
    if (!selected) return null
    return buildPreviewData(
      {
        kind: selected.type,
        slug: selected.slug,
        name: selected.name,
        country: selected.country,
        crestUrl: selected.crest_url,
      },
      color,
    )
  }, [selected, color])

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
      {/* ── picker ─────────────────────────────────────────────────────────── */}
      <aside className="flex min-h-0 flex-col gap-3">
        <div className="inline-flex rounded-lg border border-white/10 p-0.5 text-xs">
          {(['team', 'league'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 rounded-md px-3 py-1.5 font-medium capitalize transition-colors ${
                type === t ? 'bg-white/10 text-neutral-100' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {t === 'team' ? 'Teams' : 'Leagues'}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${type === 'team' ? 'teams' : 'competitions'}…`}
          className="w-full rounded-md border border-white/15 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-white/30 focus:outline-none"
        />

        {searchError ? <p className="text-xs text-red-400">{searchError}</p> : null}

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/10">
          {loading && entities.length === 0 ? (
            <p className="p-3 text-xs text-neutral-500">Searching…</p>
          ) : entities.length === 0 ? (
            <p className="p-3 text-xs text-neutral-500">No entities found.</p>
          ) : (
            <ul>
              {entities.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => selectEntity(e)}
                    className={`flex w-full items-center gap-2.5 border-b border-white/5 px-3 py-2 text-left transition-colors last:border-b-0 ${
                      selected?.id === e.id ? 'bg-emerald-500/15' : 'hover:bg-white/5'
                    }`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10">
                      {e.crest_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={e.crest_url} alt="" className="h-5 w-5 object-contain" />
                      ) : (
                        <span className="text-[10px] text-neutral-400">{e.name.charAt(0)}</span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-neutral-100">{e.name}</span>
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/20"
                      style={{ background: e.primary_color ?? 'transparent' }}
                      title={e.primary_color ?? 'no color'}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* ── editor + preview ───────────────────────────────────────────────── */}
      <div className="min-w-0">
        {!selected ? (
          <div className="rounded-xl border border-white/10 p-8 text-center text-sm text-neutral-400">
            Pick a {type} to preview and set its primary color.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-neutral-900/40 p-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10">
                {selected.crest_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.crest_url} alt="" className="h-9 w-9 object-contain" />
                ) : (
                  <span className="text-sm text-neutral-400">{selected.name.charAt(0)}</span>
                )}
              </span>
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-neutral-100">{selected.name}</div>
                <div className="text-xs text-neutral-400">
                  {selected.type === 'team' ? 'Team' : 'Competition'} ·{' '}
                  {selected.primary_color ? (
                    <>
                      saved{' '}
                      <span className="font-mono uppercase text-neutral-300">
                        {selected.primary_color}
                      </span>
                    </>
                  ) : (
                    'no saved color'
                  )}
                </div>
              </div>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => applyColor(e.target.value)}
                  aria-label="Pick primary color"
                  className="h-9 w-12 cursor-pointer rounded border border-white/15 bg-transparent p-0.5"
                />
                <input
                  type="text"
                  value={hexText}
                  onChange={(e) => onHexInput(e.target.value)}
                  spellCheck={false}
                  className={`w-28 rounded-md border bg-neutral-900 px-2 py-1.5 font-mono text-sm uppercase text-neutral-100 focus:outline-none ${
                    savedHexInvalid ? 'border-red-500/60' : 'border-white/15 focus:border-white/30'
                  }`}
                />
                <button
                  type="button"
                  disabled={!dirty || saving}
                  onClick={() => persist(color)}
                  className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  disabled={saving || (!selected.primary_color && !dirty)}
                  onClick={() => {
                    const c = selected.primary_color?.toUpperCase() ?? FALLBACK_COLOR
                    setColor(c)
                    setHexText(c)
                    setSaveMsg(null)
                  }}
                  className="rounded-md border border-white/15 px-3 py-1.5 text-sm font-medium text-neutral-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Reset to the saved color"
                >
                  Reset
                </button>
                <button
                  type="button"
                  disabled={saving || !selected.primary_color}
                  onClick={() => persist(null)}
                  className="rounded-md border border-white/15 px-3 py-1.5 text-sm font-medium text-neutral-400 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Clear the saved color"
                >
                  Clear
                </button>
              </div>
            </div>

            {(saveMsg || saveError) && (
              <p className={`mt-2 text-xs ${saveError ? 'text-red-400' : 'text-emerald-400'}`}>
                {saveError ?? saveMsg}
              </p>
            )}

            {/* theme switcher */}
            <div className="mt-4 flex items-center gap-2">
              <span className="text-xs text-neutral-500">Theme:</span>
              <div className="inline-flex rounded-lg border border-white/10 p-0.5 text-xs">
                {THEME_NAMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setActiveTheme(t)}
                    aria-pressed={activeTheme === t}
                    className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                      activeTheme === t
                        ? 'bg-white/10 text-neutral-100'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {THEME_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* preview */}
            {previewData ? (
              <div className="mt-4">
                <AssetStudioPreview
                  data={previewData}
                  themeName={activeTheme}
                  accent={color}
                  label={THEME_LABELS[activeTheme]}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
