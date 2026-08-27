'use client'

import { useEffect, useState } from 'react'
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
  ChartLineUp,
} from '@phosphor-icons/react'
import type { SourceListItem as LibrarySource } from '@vismay/content-source/storySources'
import { Chip, btnGhostCls, btnPrimaryCls } from './ui'

/** A document asset offered by the library picker. Mirrors the
 *  `library/page` route's `LibraryAsset` (kept here so client code needn't
 *  import a server route module). */
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

/** One pickable item within a provider tab (mirrors `libraryProviders`). */
export interface LibraryItem {
  id: string
  title: string
  subtitle?: string
}

/** A picker tab — one per applicable provider, plus the two synthetic
 *  Research sources / Document assets tabs. Mirrors `libraryProviders`. */
export interface LibraryTab {
  key: string
  label: string
  /** `list` tabs surface content up front; `search` tabs need a query first. */
  mode: 'list' | 'search'
  kind: 'provider' | 'sources' | 'assets'
}

/** A row in any tab — provider item, research source, or document asset. The
 *  active tab's `kind` determines which one `items` actually holds. */
export type LibraryPageItem = LibraryItem | LibrarySource | LibraryAsset

/** One page of a tab's rows plus the full (query-filtered) match count. */
export interface LibraryPage {
  items: LibraryPageItem[]
  total: number
}

/** Per-provider tab/group icon; falls back to a generic stack. */
const GROUP_ICON: Record<string, typeof FileText> = {
  story: BookOpen,
  epic: Stack,
  'footshorts-news': Newspaper,
  'footshorts-recap': Trophy,
  'vizf1-news': Newspaper,
  'iea-news': Lightning,
  epstein: Scales,
  'coke-studio': MusicNotes,
  'dc-news': Newspaper,
  'dc-news-recap': FileText,
  'dc-stock-market': ChartLineUp,
  'dc-stocks': ChartLineUp,
}

const KIND_ICON = { file: FileText, link: LinkSimple, text: TextAa } as const

/** Icon for a tab button — provider icon by key, or a kind default. */
function tabIcon(tab: LibraryTab): typeof FileText {
  if (tab.kind === 'assets') return FileText
  if (tab.kind === 'sources') return Stack
  return GROUP_ICON[tab.key] ?? Stack
}

/** Provider key for footshorts match-day recaps — the only tab surfaced in
 *  recap mode, and the one the "Create recap" flow attaches from. */
const RECAP_PROVIDER_KEY = 'footshorts-recap'

/** Rows fetched per page / appended per "Load more". */
const PAGE_LIMIT = 20

/**
 * "From library" picker — a tabbed, paginated modal. Each applicable provider
 * (published stories, epics, news, datasets, …) gets its own tab, alongside a
 * Research sources tab (already-extracted `story_sources` rows from other
 * drafts) and a Document assets tab (`story-assets` bucket files). The active
 * tab lazy-loads its first page and appends more on demand; the search box
 * scopes to the active tab and runs server-side. Attaching snapshots the item's
 * text into a new row for this draft; the modal stays open so several can be
 * pulled in one visit.
 */
export function SourceLibraryModal({
  onClose,
  loadTabs,
  loadPage,
  onAddFromSource,
  onAddAsset,
  onAddFromProvider,
  onEnrich,
  recapMode = false,
  onCreateRecap,
}: {
  onClose: () => void
  loadTabs: () => Promise<LibraryTab[]>
  loadPage: (tab: string, offset: number, limit: number, q: string) => Promise<LibraryPage>
  onAddFromSource: (id: string) => Promise<boolean>
  onAddAsset: (key: string) => Promise<boolean>
  onAddFromProvider: (providerKey: string, itemId: string) => Promise<boolean>
  onEnrich: (focus: string) => Promise<{ ok: boolean; message?: string }>
  /** "Create recap" mode: show ONLY the match-day recaps tab and swap the
   *  AI-research footer for a "Generate recap angles" advance. */
  recapMode?: boolean
  /** Runs recap-focused angle generation; the modal closes on success. */
  onCreateRecap?: () => Promise<boolean>
}) {
  const [tabs, setTabs] = useState<LibraryTab[]>([])
  const [tabsLoading, setTabsLoading] = useState(true)
  const [activeKey, setActiveKey] = useState('')

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  // Active-tab page state.
  const [items, setItems] = useState<LibraryPageItem[]>([])
  const [total, setTotal] = useState(0)
  const [pageLoading, setPageLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // Per-item attach state, keyed by `${providerKey}:${id}` / source id / asset key.
  const [adding, setAdding] = useState<Set<string>>(new Set())
  const [added, setAdded] = useState<Set<string>>(new Set())

  // AI dataset research (tool-using agent → a synthesised source).
  const [enrichFocus, setEnrichFocus] = useState('')
  const [enriching, setEnriching] = useState(false)
  const [enrichNote, setEnrichNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)

  // Recap mode: whether a recap-angle generation is in flight.
  const [creating, setCreating] = useState(false)

  // Load the tab strip once. In recap mode, collapse to the recaps tab only.
  // `loadTabs` is memoised on the draft slug, so this doesn't re-run per render.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const all = await loadTabs()
      if (cancelled) return
      const shown = recapMode ? all.filter((t) => t.key === RECAP_PROVIDER_KEY) : all
      setTabs(shown)
      setActiveKey(shown[0]?.key ?? '')
      setTabsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [loadTabs, recapMode])

  // Close on Escape — matches the canvas drawer's lightweight modal feel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Debounce the search box (settles into the per-tab fetch below).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  // Fetch the active tab's first page whenever the tab or query changes.
  // `loadPage` is memoised on the draft slug, so this only re-runs on a real
  // tab/query change — not on every "Add". A stale-guard drops out-of-order
  // responses; state updates live inside the async body (never synchronously in
  // the effect) to avoid cascading renders.
  useEffect(() => {
    if (!activeKey) return
    let cancelled = false
    ;(async () => {
      setPageLoading(true)
      setItems([])
      setTotal(0)
      const page = await loadPage(activeKey, 0, PAGE_LIMIT, debouncedQuery)
      if (cancelled) return
      setItems(page.items)
      setTotal(page.total)
      setPageLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [activeKey, debouncedQuery, loadPage])

  async function loadMore() {
    if (loadingMore || pageLoading || items.length >= total) return
    setLoadingMore(true)
    const page = await loadPage(activeKey, items.length, PAGE_LIMIT, debouncedQuery)
    // Append; keep the freshest total (it can shift as rows change).
    setItems((prev) => [...prev, ...page.items])
    setTotal(page.total)
    setLoadingMore(false)
  }

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

  // Recap items attached so far (added keys are `${RECAP_PROVIDER_KEY}:${id}`).
  const recapAddedCount = [...added].filter((k) => k.startsWith(`${RECAP_PROVIDER_KEY}:`)).length

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

  const activeTab = tabs.find((t) => t.key === activeKey) ?? null
  const needsQuery = activeTab?.mode === 'search' && debouncedQuery.length < 2
  const hasMore = items.length < total

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
              placeholder={
                activeTab
                  ? `Search ${activeTab.label.toLowerCase()}…`
                  : recapMode
                    ? 'Search recaps by date or competition…'
                    : 'Search the library…'
              }
              className="min-w-0 flex-1 bg-transparent py-1.5 text-xs text-neutral-100 placeholder:text-neutral-600 outline-none"
            />
            {pageLoading && query.trim() && (
              <span className="shrink-0 text-[10px] text-neutral-500">searching…</span>
            )}
          </div>
        </div>

        {/* Tab strip — one per applicable provider + Sources + Assets. Scrolls
            horizontally in the narrow modal. */}
        {tabs.length > 0 && (
          <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-2 py-1.5 [scrollbar-width:thin]">
            {tabs.map((t) => {
              const Icon = tabIcon(t)
              const active = t.key === activeKey
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveKey(t.key)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
                    active
                      ? 'bg-white/10 font-medium text-neutral-100'
                      : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
                  }`}
                >
                  <Icon size={13} className="shrink-0" />
                  <span className="whitespace-nowrap">{t.label}</span>
                </button>
              )
            })}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {tabsLoading && <p className="py-8 text-center text-xs text-neutral-500">Loading library…</p>}

          {!tabsLoading && !activeTab && (
            <p className="rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-xs text-neutral-600">
              Nothing in the library yet — extracted sources from other drafts and document assets show up here.
            </p>
          )}

          {activeTab && (
            <section className="space-y-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-300">
                {activeTab.label}{' '}
                {total > 0 && (
                  <span className="font-normal normal-case tracking-normal text-neutral-500">{total}</span>
                )}
              </h3>

              {pageLoading && <p className="py-8 text-center text-xs text-neutral-500">Loading…</p>}

              {!pageLoading && items.length === 0 && (
                <p className="rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-xs text-neutral-600">
                  {needsQuery
                    ? `Type to search ${activeTab.label.toLowerCase()}.`
                    : debouncedQuery
                      ? 'Nothing matches your search.'
                      : `No ${activeTab.label.toLowerCase()} yet.`}
                </p>
              )}

              {!pageLoading && items.length > 0 && (
                <ul className="space-y-1.5">
                  {activeTab.kind === 'provider' &&
                    (items as LibraryItem[]).map((it) => {
                      const GroupIcon = GROUP_ICON[activeTab.key] ?? Stack
                      return (
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
                          <AddButton
                            k={`${activeTab.key}:${it.id}`}
                            run={() => onAddFromProvider(activeTab.key, it.id)}
                          />
                        </li>
                      )
                    })}

                  {activeTab.kind === 'sources' &&
                    (items as LibrarySource[]).map((s) => {
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

                  {activeTab.kind === 'assets' &&
                    (items as LibraryAsset[]).map((a) => (
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
              )}

              {!pageLoading && hasMore && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className={`mt-1 w-full py-1.5 ${btnGhostCls}`}
                >
                  {loadingMore ? 'Loading…' : `Load more (${items.length} of ${total})`}
                </button>
              )}
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
