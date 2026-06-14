'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  FileText,
  LinkSimple,
  TextAa,
  MagnifyingGlass,
  BookOpen,
  Stack,
  Newspaper,
  Trophy,
  Lightning,
  Scales,
  MusicNotes,
} from '@phosphor-icons/react'
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

/** One pickable item within a provider group (mirrors `libraryProviders`). */
export interface LibraryItem {
  id: string
  title: string
  subtitle?: string
}

/** A provider-driven group (published stories, epic explainers, …). */
export interface LibraryGroup {
  key: string
  label: string
  items: LibraryItem[]
}

/** Per-provider group icon; falls back to a generic stack. */
const GROUP_ICON: Record<string, typeof FileText> = {
  story: BookOpen,
  epic: Stack,
  'footshorts-news': Newspaper,
  'footshorts-recap': Trophy,
  'vizf1-news': Newspaper,
  'iea-news': Lightning,
  epstein: Scales,
  'coke-studio': MusicNotes,
}

const KIND_ICON = { file: FileText, link: LinkSimple, text: TextAa } as const

/**
 * "From library" picker — a modal that lists already-extracted research sources
 * from other drafts plus document assets, and attaches the chosen ones to the
 * current draft (the server snapshots their text into new rows). Each item shows
 * a per-row Add → Added state; the modal stays open so several can be pulled in
 * one visit.
 */
/** Provider key for footshorts match-day recaps — the only group surfaced in
 *  recap mode, and the one the "Create recap" flow attaches from. */
const RECAP_PROVIDER_KEY = 'footshorts-recap'

export function SourceLibraryModal({
  onClose,
  loadLibrary,
  onAddFromSource,
  onAddAsset,
  onAddFromProvider,
  onSearchDatasets,
  onEnrich,
  recapMode = false,
  onCreateRecap,
}: {
  onClose: () => void
  loadLibrary: () => Promise<{ sources: LibrarySource[]; assets: LibraryAsset[]; groups: LibraryGroup[] }>
  onAddFromSource: (id: string) => Promise<boolean>
  onAddAsset: (key: string) => Promise<boolean>
  onAddFromProvider: (providerKey: string, itemId: string) => Promise<boolean>
  onSearchDatasets: (query: string) => Promise<LibraryGroup[]>
  onEnrich: (focus: string) => Promise<{ ok: boolean; message?: string }>
  /** "Create recap" mode: show ONLY match-day recaps and swap the AI-research
   *  footer for a "Generate recap angles" advance. */
  recapMode?: boolean
  /** Runs recap-focused angle generation; the modal closes on success. */
  onCreateRecap?: () => Promise<boolean>
}) {
  const [loading, setLoading] = useState(true)
  const [sources, setSources] = useState<LibrarySource[]>([])
  const [assets, setAssets] = useState<LibraryAsset[]>([])
  const [groups, setGroups] = useState<LibraryGroup[]>([])
  const [query, setQuery] = useState('')
  // Dataset search runs server-side, debounced on the query.
  const [datasetGroups, setDatasetGroups] = useState<LibraryGroup[]>([])
  const [searching, setSearching] = useState(false)
  // AI dataset research (tool-using agent → a synthesised source).
  const [enrichFocus, setEnrichFocus] = useState('')
  const [enriching, setEnriching] = useState(false)
  const [enrichNote, setEnrichNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  // Per-item attach state, keyed by source id / asset key.
  const [adding, setAdding] = useState<Set<string>>(new Set())
  const [added, setAdded] = useState<Set<string>>(new Set())
  // Recap mode: whether a recap-angle generation is in flight.
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const data = await loadLibrary()
      if (cancelled) return
      setSources(data.sources)
      setAssets(data.assets)
      setGroups(data.groups)
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

  // Debounced dataset search — fires once the query settles (>=2 chars), clears
  // when emptied. All state lands in the timeout callback (never synchronously
  // in the effect body); a stale-guard drops out-of-order responses.
  useEffect(() => {
    // Recap mode only offers the (list-based) recaps group — no dataset search.
    if (recapMode) return
    const q = query.trim()
    let cancelled = false
    const t = setTimeout(async () => {
      if (q.length < 2) {
        if (!cancelled) {
          setDatasetGroups([])
          setSearching(false)
        }
        return
      }
      setSearching(true)
      const found = await onSearchDatasets(q)
      if (cancelled) return
      setDatasetGroups(found)
      setSearching(false)
    }, q.length < 2 ? 0 : 350)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, onSearchDatasets, recapMode])

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
  // Filter each provider group's items, dropping groups left empty by the query.
  const matchedGroups = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          items: !q
            ? g.items
            : g.items.filter((it) => `${it.title} ${it.subtitle ?? ''}`.toLowerCase().includes(q)),
        }))
        .filter((g) => g.items.length > 0),
    [groups, q],
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

  // Recap items attached so far (added keys are `${group.key}:${item.id}`).
  const recapAddedCount = useMemo(
    () => [...added].filter((k) => k.startsWith(`${RECAP_PROVIDER_KEY}:`)).length,
    [added],
  )

  async function runCreateRecap() {
    if (!onCreateRecap || creating || recapAddedCount === 0) return
    setCreating(true)
    const ok = await onCreateRecap()
    setCreating(false)
    if (ok) onClose()
  }

  async function runEnrich() {
    if (enriching) return
    setEnriching(true)
    setEnrichNote(null)
    const r = await onEnrich(enrichFocus.trim())
    setEnriching(false)
    setEnrichNote(
      r.ok
        ? { tone: 'ok', text: 'Added a dataset-research source — see the Sources list.' }
        : { tone: 'warn', text: r.message ?? 'No dataset material found.' },
    )
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

  // Static (client-filtered) groups first, then on-demand dataset hits. In
  // recap mode only the recaps group is offered — sources/assets/datasets are
  // hidden so the picker stays a clean "choose a recap" surface.
  const renderGroups = recapMode
    ? matchedGroups.filter((g) => g.key === RECAP_PROVIDER_KEY)
    : [...matchedGroups, ...datasetGroups]

  const empty =
    !loading &&
    !searching &&
    (recapMode || (matchedSources.length === 0 && matchedAssets.length === 0)) &&
    renderGroups.length === 0

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
            <h2 className="text-sm font-semibold tracking-tight">
              {recapMode ? 'Create recap' : 'Add from library'}
            </h2>
            <p className="truncate text-[11px] text-neutral-500">
              {recapMode
                ? 'Pick a match-day recap, then generate recap-focused angles'
                : 'Reuse research from other drafts and document assets already in the DB'}
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
              placeholder={recapMode ? 'Search recaps by date or competition…' : 'Search library, or type to query datasets…'}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-xs text-neutral-100 placeholder:text-neutral-600 outline-none"
            />
            {searching && <span className="shrink-0 text-[10px] text-neutral-500">searching…</span>}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {loading && <p className="py-8 text-center text-xs text-neutral-500">Loading library…</p>}

          {empty && (
            <p className="rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-xs text-neutral-600">
              {recapMode
                ? query
                  ? 'No recaps match your search.'
                  : 'No match-day recaps available yet — they appear once the recap worker has generated them.'
                : query
                  ? 'No library items match your search.'
                  : 'Nothing in the library yet — extracted sources from other drafts and document assets show up here.'}
            </p>
          )}

          {renderGroups.map((g) => {
            const GroupIcon = GROUP_ICON[g.key] ?? Stack
            return (
              <section key={g.key} className="space-y-1.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-300">
                  {g.label}{' '}
                  <span className="font-normal normal-case tracking-normal text-neutral-500">
                    {g.items.length}
                  </span>
                </h3>
                <ul className="space-y-1.5">
                  {g.items.map((it) => (
                    <li
                      key={it.id}
                      className="flex items-center gap-2 rounded-lg border border-white/10 bg-neutral-900/60 px-2.5 py-2"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/5 text-neutral-400">
                        <GroupIcon size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-neutral-100" title={it.title}>
                          {it.title}
                        </span>
                        {it.subtitle && (
                          <span className="block truncate text-[11px] text-neutral-500" title={it.subtitle}>
                            {it.subtitle}
                          </span>
                        )}
                      </span>
                      <AddButton k={`${g.key}:${it.id}`} run={() => onAddFromProvider(g.key, it.id)} />
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}

          {!recapMode && matchedSources.length > 0 && (
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

          {!recapMode && matchedAssets.length > 0 && (
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

        {recapMode ? (
          /* Recap mode — advance straight to recap-focused angle generation. */
          <div className="space-y-1.5 border-t border-white/10 px-4 py-3">
            <button
              onClick={runCreateRecap}
              disabled={creating || recapAddedCount === 0}
              className={`w-full py-2 ${btnPrimaryCls}`}
              title="Generate angles framed as a match-day recap from the added recaps"
            >
              {creating
                ? 'Generating recap angles…'
                : recapAddedCount === 0
                  ? 'Add a recap to continue'
                  : `Generate recap angles → (${recapAddedCount})`}
            </button>
          </div>
        ) : (
          /* AI dataset research — the second consumer of the query layer. */
          <div className="space-y-1.5 border-t border-white/10 px-4 py-3">
            <div className="flex items-center gap-1.5">
              <input
                value={enrichFocus}
                onChange={(e) => setEnrichFocus(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !enriching && runEnrich()}
                placeholder="Focus for AI dataset research (optional)…"
                className="min-w-0 flex-1 rounded-md border border-white/10 bg-neutral-950 px-2.5 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-600 outline-none transition-colors focus:border-violet-400/50"
              />
              <button
                onClick={runEnrich}
                disabled={enriching}
                className="shrink-0 rounded-md bg-violet-500 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-400 disabled:opacity-40"
                title="Let an AI agent search the datasets and attach a synthesised research brief"
              >
                {enriching ? 'Researching…' : '✨ AI research'}
              </button>
            </div>
            {enrichNote && (
              <p className={`text-[11px] ${enrichNote.tone === 'ok' ? 'text-emerald-300' : 'text-amber-300'}`}>
                {enrichNote.text}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
