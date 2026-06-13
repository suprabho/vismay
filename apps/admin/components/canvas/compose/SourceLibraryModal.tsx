'use client'

import { useEffect, useMemo, useState } from 'react'
import { FileText, LinkSimple, TextAa, MagnifyingGlass } from '@phosphor-icons/react'
import type { SourceListItem as LibrarySource } from '@vismay/content-source/storySources'
import { Chip, btnGhostCls, btnPrimaryCls } from './ui'

/** A document asset offered by the library picker. Mirrors the
 *  `library` route's `LibraryAsset` (kept here so client code needn't import a
 *  server route module). */
export interface LibraryAsset {
  key: string
  storySlug: string
  filename: string
  assetRef: string
  url: string
  size: number | null
  contentType: string | null
  updatedAt: string | null
}

const KIND_ICON = { file: FileText, link: LinkSimple, text: TextAa } as const

/**
 * "From library" picker — a modal that lists already-extracted research sources
 * from other drafts plus document assets, and attaches the chosen ones to the
 * current draft (the server snapshots their text into new rows). Each item shows
 * a per-row Add → Added state; the modal stays open so several can be pulled in
 * one visit.
 */
export function SourceLibraryModal({
  onClose,
  loadLibrary,
  onAddFromSource,
  onAddAsset,
}: {
  onClose: () => void
  loadLibrary: () => Promise<{ sources: LibrarySource[]; assets: LibraryAsset[] }>
  onAddFromSource: (id: string) => Promise<boolean>
  onAddAsset: (key: string) => Promise<boolean>
}) {
  const [loading, setLoading] = useState(true)
  const [sources, setSources] = useState<LibrarySource[]>([])
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [query, setQuery] = useState('')
  // Per-item attach state, keyed by source id / asset key.
  const [adding, setAdding] = useState<Set<string>>(new Set())
  const [added, setAdded] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const data = await loadLibrary()
      if (cancelled) return
      setSources(data.sources)
      setAssets(data.assets)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [loadLibrary])

  // Close on Escape — matches the canvas drawer's lightweight modal feel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const q = query.trim().toLowerCase()
  const matchedSources = useMemo(
    () =>
      !q
        ? sources
        : sources.filter((s) =>
            [s.title, s.byline, s.filename, s.sourceUrl, s.storySlug]
              .filter(Boolean)
              .some((v) => v!.toLowerCase().includes(q)),
          ),
    [sources, q],
  )
  const matchedAssets = useMemo(
    () => (!q ? assets : assets.filter((a) => `${a.filename} ${a.storySlug}`.toLowerCase().includes(q))),
    [assets, q],
  )

  async function attach(key: string, run: () => Promise<boolean>) {
    if (adding.has(key) || added.has(key)) return
    setAdding((s) => new Set(s).add(key))
    const ok = await run()
    setAdding((s) => {
      const next = new Set(s)
      next.delete(key)
      return next
    })
    if (ok) setAdded((s) => new Set(s).add(key))
  }

  function AddButton({ k, run }: { k: string; run: () => Promise<boolean> }) {
    const isAdding = adding.has(k)
    const isAdded = added.has(k)
    return (
      <button
        onClick={() => attach(k, run)}
        disabled={isAdding || isAdded}
        className={`shrink-0 ${isAdded ? `${btnGhostCls} text-emerald-300` : btnPrimaryCls}`}
      >
        {isAdded ? '✓ Added' : isAdding ? 'Adding…' : 'Add'}
      </button>
    )
  }

  const empty = !loading && matchedSources.length === 0 && matchedAssets.length === 0

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-950 text-neutral-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">Add from library</h2>
            <p className="truncate text-[11px] text-neutral-500">
              Reuse research from other drafts and document assets already in the DB
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 leading-none text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="border-b border-white/10 px-4 py-2.5">
          <div className="flex items-center gap-2 rounded-md border border-white/10 bg-neutral-950 px-2.5">
            <MagnifyingGlass size={14} className="shrink-0 text-neutral-500" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, file, story…"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-xs text-neutral-100 placeholder:text-neutral-600 outline-none"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {loading && <p className="py-8 text-center text-xs text-neutral-500">Loading library…</p>}

          {empty && (
            <p className="rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-xs text-neutral-600">
              {query
                ? 'No library items match your search.'
                : 'Nothing in the library yet — extracted sources from other drafts and document assets show up here.'}
            </p>
          )}

          {matchedSources.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-300">
                Research sources{' '}
                <span className="font-normal normal-case tracking-normal text-neutral-500">
                  {matchedSources.length}
                </span>
              </h3>
              <ul className="space-y-1.5">
                {matchedSources.map((s) => {
                  const Icon = KIND_ICON[s.kind] ?? TextAa
                  const name = s.title ?? s.sourceUrl ?? s.filename ?? 'Untitled source'
                  const sub = s.byline ?? s.sourceUrl ?? s.filename
                  return (
                    <li
                      key={s.id}
                      className="flex items-center gap-2 rounded-lg border border-white/10 bg-neutral-900/60 px-2.5 py-2"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/5 text-neutral-400">
                        <Icon size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-neutral-100" title={name}>
                          {name}
                        </span>
                        <span className="block truncate text-[11px] text-neutral-500" title={sub ?? undefined}>
                          {sub ? `${sub} · ` : ''}
                          {s.storySlug}
                        </span>
                      </span>
                      <Chip tone="neutral">{s.storySlug}</Chip>
                      <AddButton k={s.id} run={() => onAddFromSource(s.id)} />
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {matchedAssets.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-300">
                Document assets{' '}
                <span className="font-normal normal-case tracking-normal text-neutral-500">
                  {matchedAssets.length}
                </span>
              </h3>
              <ul className="space-y-1.5">
                {matchedAssets.map((a) => (
                  <li
                    key={a.key}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-neutral-900/60 px-2.5 py-2"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/5 text-neutral-400">
                      <FileText size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-neutral-100" title={a.filename}>
                        {a.filename}
                      </span>
                      <span className="block truncate text-[11px] text-neutral-500">{a.storySlug}</span>
                    </span>
                    <Chip tone="neutral">{a.storySlug}</Chip>
                    <AddButton k={a.key} run={() => onAddAsset(a.key)} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
