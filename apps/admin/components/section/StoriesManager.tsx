'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import MoveStoryControl from '@/components/vizmaya/MoveStoryControl'
import { useStoryUpload, UploadResultBanner } from '@/components/section/storyUpload'
import { AdminTable } from '@/components/admin'
import type { StoryCardData } from '@vismay/ui'

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

  // The search box lives in the shared header, so every tab — including Home —
  // has to honour it.
  const homeShown = homeListed.filter(matchesQuery)
  const notOnHomeShown = notOnHome.filter(matchesQuery)

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
              These stories appear on the vizmaya.fyi home grid, in this order. Update the order directly in the
              table; quick actions remain available in the final column.
            </p>
            <StoryTable
              stories={homeShown}
              basePath={basePath}
              updating={updating}
              onRefresh={refreshStories}
              empty={q ? `No home stories match “${query.trim()}”.` : 'No stories on the home grid yet.'}
              actionsFor={(s) => [
                { label: 'Unlist', onClick: () => updateMeta(s.slug, { listed: false }) },
                { label: '→ Draft', onClick: () => updateMeta(s.slug, { status: 'draft' }) },
                { label: '→ Archive', onClick: () => updateMeta(s.slug, { status: 'archived' }) },
              ]}
              showOrder
              onOrderChange={(slug, value) => updateMeta(slug, { displayOrder: value })}
            />

            <div className="border-t border-white/5 pt-5">
              <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3">
                Published · not on home ({notOnHome.length})
              </h2>
              <StoryTable
                stories={notOnHomeShown}
                basePath={basePath}
                updating={updating}
                onRefresh={refreshStories}
                empty={q ? `No matches in “${query.trim()}”.` : 'Every published story is on the home grid.'}
                actionsFor={(s) => [
                  {
                    label: '＋ Add to home',
                    onClick: () => updateMeta(s.slug, { listed: true, displayOrder: homeListed.length }),
                  },
                  { label: '→ Draft', onClick: () => updateMeta(s.slug, { status: 'draft' }) },
                  { label: '→ Archive', onClick: () => updateMeta(s.slug, { status: 'archived' }) },
                ]}
              />
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

interface RowAction {
  label: string
  onClick: () => void
  danger?: boolean
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
    <StoryTable
      stories={stories}
      basePath={basePath}
      updating={updating}
      onRefresh={onRefresh}
      empty={empty}
      actionsFor={actionsFor}
    />
  )
}

function StoryTable({
  stories,
  basePath,
  updating,
  onRefresh,
  empty,
  actionsFor,
  showOrder = false,
  onOrderChange,
}: {
  stories: Story[]
  basePath: string
  updating: string | null
  onRefresh: () => void
  empty: string
  actionsFor: (story: Story) => RowAction[]
  showOrder?: boolean
  onOrderChange?: (slug: string, value: number | null) => void
}) {
  return (
    <AdminTable
      rows={stories}
      rowKey={(story) => story.slug}
      caption="Stories"
      empty={empty}
      columns={[
        {
          key: 'story',
          label: 'Story',
          render: (story) => (
            <Link href={`${basePath}/${story.slug}`} className="block hover:text-white">
              <div className="truncate font-medium">{story.title}</div>
              <div className="mt-0.5 truncate font-mono text-xs text-neutral-500">
                {story.slug}{story.date ? ` · ${story.date}` : ''}
              </div>
            </Link>
          ),
        },
        {
          key: 'status',
          label: 'Status',
          className: 'w-32 text-neutral-400',
          render: (story) => story.status,
        },
        {
          key: 'listed',
          label: 'Listed',
          responsive: 'secondary',
          className: 'w-20 text-center',
          render: (story) => story.listed ? 'Yes' : 'No',
        },
        ...(showOrder ? [{
          key: 'order',
          label: 'Order',
          responsive: 'secondary' as const,
          className: 'w-20 tabular-nums text-neutral-400',
          render: (story: Story) => onOrderChange ? (
            <input
              type="number"
              value={story.displayOrder == null ? '' : String(story.displayOrder)}
              placeholder="#"
              onChange={(event) => onOrderChange(story.slug, event.target.value === '' ? null : Number.parseInt(event.target.value, 10))}
              disabled={updating === story.slug}
              className="w-16 rounded border border-white/20 bg-neutral-900 px-2 py-1 text-sm text-white placeholder:text-neutral-600 disabled:opacity-50"
              aria-label={`Display order for ${story.title}`}
            />
          ) : story.displayOrder ?? '—',
        }] : []),
        {
          key: 'actions',
          label: 'Actions',
          sticky: true,
          className: 'w-[18rem] text-right',
          render: (story) => (
            <div className="flex items-center justify-end gap-2">
              <MoveStoryControl slug={story.slug} currentAppSlug={story.appSlug} onMoved={onRefresh} />
              <Link href={`${basePath}/${story.slug}`} className="text-xs text-neutral-300 hover:text-white">
                Edit
              </Link>
              {actionsFor(story).map((action) => (
                <button
                  key={action.label}
                  type="button"
                  disabled={updating === story.slug}
                  onClick={action.onClick}
                  className={`rounded border px-2 py-1 text-xs transition-colors disabled:opacity-40 ${
                    action.danger
                      ? 'border-red-500/30 text-red-300 hover:bg-red-500/10'
                      : 'border-white/10 text-neutral-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ),
        },
      ]}
    />
  )
}
