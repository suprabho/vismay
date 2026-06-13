'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  StoryBentoGrid,
  StoryGridStyles,
  StoryGridFonts,
  StoryCard,
  type StoryCardData,
  type StoryGridItem,
  type RenderCardContext,
} from '@vismay/ui'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import MoveStoryControl from '@/components/vizmaya/MoveStoryControl'
import { useStoryUpload, UploadResultBanner } from '@/components/section/storyUpload'

type Story = StoryCardData & {
  status: string
  listed: boolean
  displayOrder: number | null
  appSlug: string | null
}

type Tab = 'home' | 'drafts' | 'archive'

interface Props {
  /** App scope — list filters to this app and uploads are tagged to it. */
  appSlug: string
  /** Base path for row links + editor, e.g. `/vizmaya`. */
  basePath: string
}

function buildUrl(appSlug: string): string {
  return `/api/stories?app=${encodeURIComponent(appSlug)}`
}

const byOrderThenTitle = (a: Story, b: Story) => {
  const ao = a.displayOrder ?? Number.POSITIVE_INFINITY
  const bo = b.displayOrder ?? Number.POSITIVE_INFINITY
  if (ao !== bo) return ao - bo
  return a.title.localeCompare(b.title)
}

export default function StoriesManager({ appSlug, basePath }: Props) {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('home')
  const [query, setQuery] = useState('')
  const [updating, setUpdating] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const latestRequestId = useRef(0)

  async function refreshStories() {
    const requestId = ++latestRequestId.current
    const r = await fetch(buildUrl(appSlug))
    const data = await r.json().catch(() => null)
    if (requestId !== latestRequestId.current) return
    setStories(Array.isArray(data) ? (data as Story[]) : [])
    setLoading(false)
  }

  useEffect(() => {
    refreshStories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSlug])

  const { uploadBusy, uploadResult, setUploadResult, openPicker, fileInput } = useStoryUpload(
    appSlug,
    () => refreshStories()
  )

  // Per-card typefaces — same resolution the marketing home uses.
  const fontUrls = useMemo(() => {
    const urls = new Set<string>()
    for (const s of stories) {
      const fonts = s.theme?.fonts
      if (!fonts) continue
      const u = getFontImportUrl(fonts)
      if (u) urls.add(u)
    }
    return Array.from(urls)
  }, [stories])

  const q = query.trim().toLowerCase()
  const matchesQuery = (s: Story) =>
    q === '' ||
    s.title.toLowerCase().includes(q) ||
    s.slug.toLowerCase().includes(q) ||
    (s.subtitle ?? '').toLowerCase().includes(q)

  const published = stories.filter((s) => s.status === 'published')
  const homeListed = useMemo(
    () => published.filter((s) => s.listed).sort(byOrderThenTitle),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stories]
  )
  const notOnHome = published.filter((s) => !s.listed).sort((a, b) => a.title.localeCompare(b.title))
  const drafts = stories.filter((s) => s.status === 'draft').sort((a, b) => a.title.localeCompare(b.title))
  const archived = stories.filter((s) => s.status === 'archived').sort((a, b) => a.title.localeCompare(b.title))

  async function updateMeta(
    slug: string,
    meta: Partial<{ status: string; listed: boolean; displayOrder: number | null }>
  ) {
    setUpdating(slug)
    const res = await fetch(`/api/stories/${slug}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(meta),
    })
    if (res.ok) setStories((prev) => prev.map((s) => (s.slug === slug ? { ...s, ...meta } : s)))
    setUpdating(null)
  }

  async function deleteStory(slug: string) {
    if (!confirm(`Delete "${slug}" permanently? This removes the markdown, config, and charts.`)) return
    setUpdating(slug)
    const res = await fetch(`/api/stories/${slug}`, { method: 'DELETE' })
    if (res.ok) setStories((prev) => prev.filter((s) => s.slug !== slug))
    setUpdating(null)
  }

  // Drag-to-reorder the home grid: splice the dragged card to the drop target,
  // renumber displayOrder across the listed set, and persist each card.
  async function reorderHome(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return
    const order = homeListed.map((s) => s.slug)
    const [moved] = order.splice(dragIndex, 1)
    order.splice(targetIndex, 0, moved)
    setDragIndex(null)
    const orderMap = new Map(order.map((slug, i) => [slug, i]))
    setStories((prev) =>
      prev.map((s) => (orderMap.has(s.slug) ? { ...s, displayOrder: orderMap.get(s.slug)! } : s))
    )
    await Promise.all(
      order.map((slug, i) =>
        fetch(`/api/stories/${slug}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ displayOrder: i }),
        })
      )
    )
  }

  const homeItems: StoryGridItem[] = homeListed.map((s, i) => ({ data: s, n: i }))

  const renderHomeCard = (item: StoryGridItem, ctx: RenderCardContext) => {
    const s = item.data as Story
    const busy = updating === s.slug
    return (
      <StoryCard
        data={s}
        n={item.n}
        big={ctx.big}
        className={`group cursor-grab${dragIndex === ctx.index ? ' opacity-40' : ''}`}
        draggable
        onDragStart={() => setDragIndex(ctx.index)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          reorderHome(ctx.index)
        }}
        onDragEnd={() => setDragIndex(null)}
      >
        <div className="absolute inset-0 z-[2] flex flex-col justify-between p-3 opacity-0 group-hover:opacity-100 transition-opacity bg-black/45">
          <div className="flex justify-end">
            <span className="text-[10px] uppercase tracking-wider text-white/60">⠿ drag</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <OverlayBtn href={`${basePath}/${s.slug}`}>Edit</OverlayBtn>
            <OverlayBtn disabled={busy} onClick={() => updateMeta(s.slug, { listed: false })}>
              Unlist
            </OverlayBtn>
            <OverlayBtn disabled={busy} onClick={() => updateMeta(s.slug, { status: 'draft' })}>
              → Draft
            </OverlayBtn>
            <OverlayBtn disabled={busy} onClick={() => updateMeta(s.slug, { status: 'archived' })}>
              → Archive
            </OverlayBtn>
          </div>
        </div>
      </StoryCard>
    )
  }

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'home', label: 'Home', count: homeListed.length },
    { id: 'drafts', label: 'Drafts', count: drafts.length },
    { id: 'archive', label: 'Archive', count: archived.length },
  ]

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-400">Loading stories…</div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <StoryGridStyles />
      <StoryGridFonts fontUrls={fontUrls} />

      <div className="shrink-0 px-4 py-5 border-b border-white/5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Stories</h1>
          <p className="text-sm text-neutral-400 mt-0.5 tabular-nums">{stories.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or slug…"
            className="w-56 text-sm bg-neutral-900 border border-white/10 rounded-lg px-3 py-1.5 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-white/30"
          />
          <button
            type="button"
            disabled={uploadBusy}
            onClick={openPicker}
            className="text-sm text-neutral-300 hover:text-white shrink-0 disabled:opacity-40 px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/5"
            title="Upload .md + optional .config.yaml / .share.yaml / chart .json files for one story"
          >
            {uploadBusy ? 'uploading…' : '↑ upload story'}
          </button>
        </div>
        {fileInput}
      </div>

      {uploadResult && (
        <UploadResultBanner result={uploadResult} basePath={basePath} onDismiss={() => setUploadResult(null)} />
      )}

      <div className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-white/5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-2.5 py-1 rounded-md text-sm transition-colors ${
              tab === t.id ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            {t.label} <span className="text-neutral-500 tabular-nums">· {t.count}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'home' && (
          <div className="p-4 space-y-6">
            <p className="text-xs text-neutral-500">
              These stories appear on the vizmaya.fyi home grid, in this order. Drag a card to reorder; hover for
              quick actions.
            </p>
            {homeItems.length === 0 ? (
              <div className="text-sm text-neutral-500 py-8 text-center">
                No stories on the home grid yet. Publish a story and add it to home from a section below.
              </div>
            ) : (
              <StoryBentoGrid mode="stacked" items={homeItems} renderCard={renderHomeCard} />
            )}

            <div className="border-t border-white/5 pt-5">
              <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3">
                Published · not on home ({notOnHome.length})
              </h2>
              {notOnHome.length === 0 ? (
                <p className="text-sm text-neutral-600">Every published story is on the home grid.</p>
              ) : (
                <ul className="divide-y divide-white/5 border border-white/5 rounded-lg overflow-hidden">
                  {notOnHome.map((s) => (
                    <StoryRow
                      key={s.slug}
                      story={s}
                      basePath={basePath}
                      busy={updating === s.slug}
                      onRefresh={refreshStories}
                      actions={[
                        {
                          label: '＋ Add to home',
                          onClick: () =>
                            updateMeta(s.slug, { listed: true, displayOrder: homeListed.length }),
                        },
                        { label: '→ Draft', onClick: () => updateMeta(s.slug, { status: 'draft' }) },
                        { label: '→ Archive', onClick: () => updateMeta(s.slug, { status: 'archived' }) },
                      ]}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {tab === 'drafts' && (
          <RowList
            stories={drafts.filter(matchesQuery)}
            empty="No drafts."
            basePath={basePath}
            updating={updating}
            onRefresh={refreshStories}
            actionsFor={(s) => [
              { label: 'Publish', onClick: () => updateMeta(s.slug, { status: 'published' }) },
              { label: 'Archive', onClick: () => updateMeta(s.slug, { status: 'archived' }) },
              { label: 'Delete', onClick: () => deleteStory(s.slug), danger: true },
            ]}
          />
        )}

        {tab === 'archive' && (
          <RowList
            stories={archived.filter(matchesQuery)}
            empty="Nothing archived."
            basePath={basePath}
            updating={updating}
            onRefresh={refreshStories}
            actionsFor={(s) => [
              { label: 'Restore to draft', onClick: () => updateMeta(s.slug, { status: 'draft' }) },
              { label: 'Publish', onClick: () => updateMeta(s.slug, { status: 'published' }) },
              { label: 'Delete', onClick: () => deleteStory(s.slug), danger: true },
            ]}
          />
        )}
      </div>
    </div>
  )
}

function OverlayBtn({
  children,
  href,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  href?: string
  onClick?: () => void
  disabled?: boolean
}) {
  const cls =
    'text-[11px] px-2 py-1 rounded bg-white/15 text-white hover:bg-white/30 disabled:opacity-40 transition-colors'
  if (href) {
    return (
      <Link href={href} className={cls} draggable={false}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled} draggable={false}>
      {children}
    </button>
  )
}

interface RowAction {
  label: string
  onClick: () => void
  danger?: boolean
}

function StoryRow({
  story,
  basePath,
  busy,
  actions,
  onRefresh,
}: {
  story: Story
  basePath: string
  busy: boolean
  actions: RowAction[]
  onRefresh: () => void
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3 bg-neutral-950/30 hover:bg-white/2.5 transition-colors">
      <Link href={`${basePath}/${story.slug}`} className="flex-1 min-w-0">
        <div className="font-medium truncate text-sm">{story.title}</div>
        <div className="text-xs text-neutral-500 truncate mt-0.5">
          {story.slug}
          {story.date ? ` · ${story.date}` : ''}
        </div>
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        <MoveStoryControl slug={story.slug} currentAppSlug={story.appSlug} onMoved={() => onRefresh()} />
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            disabled={busy}
            onClick={a.onClick}
            className={`text-xs px-2 py-1 rounded border transition-colors disabled:opacity-40 ${
              a.danger
                ? 'border-red-500/30 text-red-300 hover:bg-red-500/10'
                : 'border-white/10 text-neutral-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </li>
  )
}

function RowList({
  stories,
  empty,
  basePath,
  updating,
  actionsFor,
  onRefresh,
}: {
  stories: Story[]
  empty: string
  basePath: string
  updating: string | null
  actionsFor: (s: Story) => RowAction[]
  onRefresh: () => void
}) {
  if (stories.length === 0) {
    return <div className="text-sm text-neutral-500 py-10 text-center">{empty}</div>
  }
  return (
    <ul className="divide-y divide-white/5">
      {stories.map((s) => (
        <StoryRow
          key={s.slug}
          story={s}
          basePath={basePath}
          busy={updating === s.slug}
          actions={actionsFor(s)}
          onRefresh={onRefresh}
        />
      ))}
    </ul>
  )
}
