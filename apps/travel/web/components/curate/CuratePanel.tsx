'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import MediaDetail from './MediaDetail'
import CurateUpload from './CurateUpload'

/** Mirrors the API's CurationItem/vocabulary shapes (app/api/media/[slug]). */
export interface Item {
  file: string
  url: string
  kind: 'image' | 'video'
  day: number | null
  stop: string | null
  caption: string | null
  selected: boolean
  sortOrder: number | null
  takenAt: string | null
  match: 'auto' | 'manual'
  orphan?: boolean
  missing?: boolean
}

export interface DayVocab {
  n: number | null
  label: string
  stops: Array<{ slug: string; name: string }>
}

type Show = 'all' | 'unassigned' | 'deselected' | 'orphans'

/** Supabase render/image transform; grid falls back to the raw URL onError. */
export function thumbUrl(url: string): string {
  return url.replace('/object/public/', '/render/image/public/') + '?width=320&quality=60'
}

export default function CuratePanel({ slugs }: { slugs: string[] }) {
  const [slug, setSlug] = useState(() => {
    if (typeof window !== 'undefined') {
      const t = new URLSearchParams(window.location.search).get('trip')
      if (t && slugs.includes(t)) return t
    }
    return slugs[0] ?? ''
  })
  const [items, setItems] = useState<Item[]>([])
  const [days, setDays] = useState<DayVocab[]>([])
  const [dbError, setDbError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [day, setDay] = useState<number | 'all'>('all')
  const [stop, setStop] = useState<string>('all')
  const [show, setShow] = useState<Show>('all')

  const [selectMode, setSelectMode] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [detailFile, setDetailFile] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/media/${slug}`)
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`)
      const data = await res.json()
      setItems(data.items ?? [])
      setDays(data.days ?? [])
      setDbError(data.dbError ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    void refresh()
    setPicked(new Set())
    setDetailFile(null)
  }, [refresh])

  const stopsForDay = useMemo(() => {
    if (day === 'all') return days.flatMap((d) => d.stops)
    return days.find((d) => d.n === day)?.stops ?? []
  }, [days, day])

  const filtered = useMemo(
    () =>
      items.filter((it) => {
        if (show === 'unassigned' && it.stop != null) return false
        if (show === 'deselected' && it.selected) return false
        if (show === 'orphans' && !it.orphan) return false
        if (day !== 'all' && it.day !== day) return false
        if (stop !== 'all' && it.stop !== stop) return false
        return true
      }),
    [items, show, day, stop]
  )

  const patchItem = useCallback(
    async (file: string, patch: Record<string, unknown>) => {
      setItems((prev) =>
        prev.map((it) => (it.file === file ? ({ ...it, ...normalizePatch(patch) } as Item) : it))
      )
      const res = await fetch(`/api/media/${slug}/${encodeURIComponent(file)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? 'save failed')
        void refresh()
      } else {
        const { row } = await res.json()
        if (row) {
          setItems((prev) =>
            prev.map((it) =>
              it.file === file
                ? {
                    ...it,
                    day: row.day,
                    stop: row.stop,
                    caption: row.caption,
                    selected: row.selected,
                    sortOrder: row.sort_order,
                    orphan: false,
                  }
                : it
            )
          )
        }
      }
    },
    [slug, refresh]
  )

  const deleteItem = useCallback(
    async (file: string) => {
      const res = await fetch(`/api/media/${slug}/${encodeURIComponent(file)}`, { method: 'DELETE' })
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? 'delete failed')
        return false
      }
      setItems((prev) => prev.filter((it) => it.file !== file))
      return true
    },
    [slug]
  )

  const batch = useCallback(
    async (set: Record<string, unknown>) => {
      const files = Array.from(picked)
      if (files.length === 0) return
      setBusy(true)
      try {
        for (let i = 0; i < files.length; i += 100) {
          const chunk = files.slice(i, i + 100)
          const res = await fetch(`/api/media/${slug}/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: chunk, set }),
          })
          if (!res.ok) {
            setError((await res.json().catch(() => null))?.error ?? 'batch failed')
            break
          }
        }
        await refresh()
        setPicked(new Set())
      } finally {
        setBusy(false)
      }
    },
    [picked, slug, refresh]
  )

  const batchDelete = useCallback(async () => {
    const files = Array.from(picked)
    if (files.length === 0) return
    if (!window.confirm(`Delete ${files.length} file(s) from the bucket and manifest?`)) return
    setBusy(true)
    try {
      for (const f of files) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await deleteItem(f)
        if (!ok) break
      }
      setPicked(new Set())
    } finally {
      setBusy(false)
    }
  }, [picked, deleteItem])

  const detail = detailFile ? filtered.find((i) => i.file === detailFile) ?? null : null
  const detailIndex = detail ? filtered.indexOf(detail) : -1

  return (
    <div className="space-y-4 pb-28">
      {/* Trip + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm"
        >
          {slugs.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1">
          <FilterChip active={day === 'all'} onClick={() => { setDay('all'); setStop('all') }}>
            All days
          </FilterChip>
          {days
            .filter((d) => d.n != null)
            .map((d) => (
              <FilterChip
                key={d.n}
                active={day === d.n}
                onClick={() => { setDay(d.n as number); setStop('all') }}
              >
                D{d.n}
              </FilterChip>
            ))}
        </div>
        <select
          value={stop}
          onChange={(e) => setStop(e.target.value)}
          className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm"
        >
          <option value="all">All stops</option>
          {stopsForDay.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1">
          {(['all', 'unassigned', 'deselected', 'orphans'] as Show[]).map((s) => (
            <FilterChip key={s} active={show === s} onClick={() => setShow(s)}>
              {s}
            </FilterChip>
          ))}
        </div>
        <span className="ml-auto text-xs opacity-60">
          {filtered.length}/{items.length}
        </span>
        <button
          onClick={() => { setSelectMode((v) => !v); setPicked(new Set()) }}
          className={`rounded-full px-3 py-1.5 text-sm ${selectMode ? 'bg-[#2b2419] text-[#fffdf8]' : 'border border-black/15 bg-white'}`}
        >
          {selectMode ? 'Done' : 'Select'}
        </button>
      </div>

      {dbError && (
        <p className="rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900">
          DB unavailable ({dbError}) — showing bucket contents only. Apply migration 074 and seed
          with <code>pnpm travel:sync-media-db</code>.
        </p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {loading && <p className="animate-pulse text-sm opacity-60">Loading…</p>}

      {/* Grid */}
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6">
        {filtered.map((it) => {
          const isPicked = picked.has(it.file)
          return (
            <button
              key={it.file}
              onClick={() => {
                if (selectMode) {
                  setPicked((prev) => {
                    const next = new Set(prev)
                    if (next.has(it.file)) next.delete(it.file)
                    else next.add(it.file)
                    return next
                  })
                } else {
                  setDetailFile(it.file)
                }
              }}
              className={`relative aspect-square overflow-hidden rounded-md border bg-black/5
                ${isPicked ? 'border-[#2ca068] ring-2 ring-[#2ca068]' : 'border-black/10'}
                ${it.selected ? '' : 'opacity-40'}`}
            >
              {it.kind === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbUrl(it.url)}
                  alt={it.caption ?? it.file}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    const img = e.currentTarget
                    if (img.src !== it.url) img.src = it.url
                  }}
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-2xl">🎬</span>
              )}
              {it.stop == null && (
                <span className="absolute left-1 top-1 rounded bg-amber-400 px-1 text-[10px] font-bold">
                  ?
                </span>
              )}
              {it.day != null && (
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">
                  D{it.day}
                </span>
              )}
              {it.orphan && (
                <span className="absolute right-1 top-1 rounded bg-blue-500 px-1 text-[10px] text-white">
                  new
                </span>
              )}
              {it.missing && (
                <span className="absolute right-1 top-1 rounded bg-red-600 px-1 text-[10px] text-white">
                  gone
                </span>
              )}
              {selectMode && isPicked && (
                <span className="absolute inset-0 flex items-center justify-center bg-[#2ca068]/30 text-2xl">
                  ✓
                </span>
              )}
            </button>
          )
        })}
      </div>

      <CurateUpload
        slug={slug}
        defaultDay={day === 'all' ? null : day}
        defaultStop={stop === 'all' ? null : stop}
        onUploaded={refresh}
      />

      {/* Batch bar */}
      {selectMode && picked.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-[#fffdf8] p-3 shadow-2xl">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{picked.size} selected</span>
            <select
              disabled={busy}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) void batch({ stop: e.target.value })
                e.target.value = ''
              }}
              className="rounded-lg border border-black/15 bg-white px-2 py-1.5 text-sm"
            >
              <option value="" disabled>
                Assign to stop…
              </option>
              {days
                .filter((d) => d.n != null)
                .flatMap((d) =>
                  d.stops.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      D{d.n} · {s.name}
                    </option>
                  ))
                )}
            </select>
            <button disabled={busy} onClick={() => void batch({ selected: true })} className="rounded-full border border-black/15 bg-white px-3 py-1.5 text-sm">
              Select for views
            </button>
            <button disabled={busy} onClick={() => void batch({ selected: false })} className="rounded-full border border-black/15 bg-white px-3 py-1.5 text-sm">
              Hide from views
            </button>
            <button disabled={busy} onClick={() => void batchDelete()} className="ml-auto rounded-full bg-red-700 px-3 py-1.5 text-sm text-white">
              Delete…
            </button>
          </div>
        </div>
      )}

      {detail && (
        <MediaDetail
          item={detail}
          days={days}
          onClose={() => setDetailFile(null)}
          onPatch={(patch) => void patchItem(detail.file, patch)}
          onDelete={async () => {
            if (!window.confirm(`Delete ${detail.file}?`)) return
            const ok = await deleteItem(detail.file)
            if (ok) setDetailFile(null)
          }}
          onPrev={detailIndex > 0 ? () => setDetailFile(filtered[detailIndex - 1].file) : undefined}
          onNext={
            detailIndex >= 0 && detailIndex < filtered.length - 1
              ? () => setDetailFile(filtered[detailIndex + 1].file)
              : undefined
          }
        />
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs capitalize ${
        active ? 'bg-[#2b2419] text-[#fffdf8]' : 'border border-black/15 bg-white'
      }`}
    >
      {children}
    </button>
  )
}

/** Optimistic-update mapping from PATCH body keys to Item fields. */
function normalizePatch(patch: Record<string, unknown>): Partial<Item> {
  const out: Partial<Item> = {}
  if (patch.caption !== undefined) out.caption = patch.caption as string | null
  if (patch.selected !== undefined) out.selected = !!patch.selected
  if (patch.sort_order !== undefined) out.sortOrder = patch.sort_order as number | null
  if (patch.stop !== undefined) out.stop = patch.stop as string | null
  if (patch.day !== undefined) out.day = patch.day as number | null
  return out
}
