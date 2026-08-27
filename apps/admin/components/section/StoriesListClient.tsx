'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import MoveStoryControl from '@/components/vizmaya/MoveStoryControl'
import { useStoryUpload, UploadResultBanner } from '@/components/section/storyUpload'

type Story = {
  slug: string
  title: string
  status: string
  listed: boolean
  displayOrder: number | null
  appSlug: string | null
}

interface Props {
  /**
   * When set, the list is scoped to this app (`?app=<slug>` filter) and newly
   * uploaded stories are tagged to it. Omit (or null) for the Vizmaya "all
   * stories" view, which lists every app's stories and leaves uploads untagged.
   */
  appSlug?: string | null
  /** Base path for row + banner links, e.g. `/vizmaya` or `/footshorts`. */
  basePath: string
}

function buildStoriesUrl(query: string, appSlug: string | null): string {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (appSlug) params.set('app', appSlug)
  const qs = params.toString()
  return qs ? `/api/stories?${qs}` : '/api/stories'
}

export default function StoriesListClient({ appSlug = null, basePath }: Props) {
  const [stories, setStories] = useState<Story[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [updating, setUpdating] = useState<string | null>(null)
  const latestRequestId = useRef(0)
  const { uploadBusy, uploadResult, setUploadResult, openPicker, fileInput } = useStoryUpload(
    appSlug,
    () => refreshStories()
  )

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 200)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    const requestId = ++latestRequestId.current
    setSearching(true)
    async function load() {
      const r = await fetch(buildStoriesUrl(debouncedQuery, appSlug))
      const data = (await r.json()) as Story[]
      if (requestId !== latestRequestId.current) return
      const sorted = data.sort((a, b) => a.title.localeCompare(b.title))
      setStories(sorted)
      if (debouncedQuery === '') setTotalCount(sorted.length)
      setLoading(false)
      setSearching(false)
    }
    load()
  }, [debouncedQuery, appSlug])

  async function refreshStories() {
    const requestId = ++latestRequestId.current
    const r = await fetch(buildStoriesUrl(debouncedQuery, appSlug))
    const data = (await r.json()) as Story[]
    if (requestId !== latestRequestId.current) return
    const sorted = data.sort((a, b) => a.title.localeCompare(b.title))
    setStories(sorted)
    if (debouncedQuery === '') setTotalCount(sorted.length)
  }

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
    if (res.ok) {
      setStories((prev) =>
        prev.map((s) => (s.slug === slug ? { ...s, ...meta } : s))
      )
    }
    setUpdating(null)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-400">
        Loading stories…
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 px-4 py-5 border-b border-white/5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Stories</h1>
          <p className="text-sm text-neutral-400 mt-0.5 tabular-nums">
            {searching
              ? 'searching…'
              : debouncedQuery
                ? `${stories.length} of ${totalCount ?? stories.length} matching`
                : `${totalCount ?? stories.length} total`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, slug, or body…"
            className="w-64 text-sm bg-neutral-900 border border-white/10 rounded-lg px-3 py-1.5 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-white/30"
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
        <UploadResultBanner
          result={uploadResult}
          basePath={basePath}
          onDismiss={() => setUploadResult(null)}
        />
      )}
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 border-b border-white/5 text-xs uppercase tracking-wider text-neutral-500">
        <div className="flex-1">Title</div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-[104px] text-right">Status</div>
          <div className="w-4 text-center" title="Listed on home">L</div>
          <div className="w-16 text-right">Order</div>
        </div>
      </div>
      {stories.length === 0 && debouncedQuery !== '' ? (
        <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-neutral-500">
          No stories match “{debouncedQuery}”.
        </div>
      ) : (
      <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-white/5">
        {stories.map((s) => (
          <li key={s.slug}>
            <div className="flex items-center justify-between gap-3 px-4 py-4 hover:bg-white/2.5 transition-colors overflow-x-auto">
              <Link
                href={`${basePath}/${s.slug}`}
                className="shrink-0 min-w-[8rem] max-w-[14rem] flex flex-col active:bg-white/5"
              >
                <div className="font-medium truncate">{s.title}</div>
                <div className="text-xs text-neutral-500 truncate mt-0.5">{s.slug}</div>
              </Link>
              <div className="flex items-center gap-3 shrink-0">
                <MoveStoryControl
                  slug={s.slug}
                  currentAppSlug={s.appSlug}
                  onMoved={() => refreshStories()}
                />
                <div className="flex items-center gap-1">
                  <select
                    value={s.status}
                    onChange={(e) => updateMeta(s.slug, { status: e.target.value })}
                    disabled={updating === s.slug}
                    className="text-xs bg-neutral-900 border border-white/10 rounded px-2 py-1 text-neutral-300 cursor-pointer disabled:opacity-50"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <input
                  type="checkbox"
                  checked={s.listed}
                  onChange={(e) => updateMeta(s.slug, { listed: e.target.checked })}
                  disabled={updating === s.slug}
                  className="w-4 h-4 cursor-pointer disabled:opacity-50"
                  title="Show on home page"
                />
                <input
                  type="number"
                  value={s.displayOrder != null ? String(s.displayOrder) : ''}
                  placeholder="#"
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : parseInt(e.target.value, 10)
                    updateMeta(s.slug, { displayOrder: val })
                  }}
                  disabled={updating === s.slug}
                  className="w-16 text-sm bg-neutral-900 border border-white/20 rounded px-2 py-1 text-white cursor-pointer disabled:opacity-50 placeholder:text-neutral-600"
                  title="Display order (0-indexed, lower first)"
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
      )}
    </div>
  )
}
