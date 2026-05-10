'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

type Story = {
  slug: string
  title: string
  status: string
  listed: boolean
  displayOrder: number | null
}

interface UploadResult {
  ok: boolean
  slug?: string
  details: string[]
  charts: string[]
  skipped: string[]
  errors: string[]
}

export default function AdminHome() {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const r = await fetch('/api/admin/stories')
      const data = (await r.json()) as Story[]
      const sorted = data.sort((a, b) => a.title.localeCompare(b.title))
      setStories(sorted)
      setLoading(false)
    }
    load()
  }, [])

  async function refreshStories() {
    const r = await fetch('/api/admin/stories')
    const data = (await r.json()) as Story[]
    const sorted = data.sort((a, b) => a.title.localeCompare(b.title))
    setStories(sorted)
  }

  async function updateMeta(
    slug: string,
    meta: Partial<{ status: string; listed: boolean; displayOrder: number | null }>
  ) {
    setUpdating(slug)
    const res = await fetch(`/api/admin/stories/${slug}`, {
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

  // Bulk upload at the index level: take a multi-file selection that makes up
  // a single story (one .md + optional .config.yaml/.share.yaml + chart .json
  // files) and write them via the existing PUT routes. Slug is derived from
  // the .md filename so the same payload works for create and replace.
  async function uploadStory(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return

    setUploadBusy(true)
    setUploadResult(null)

    const mdFiles = files.filter((f) => /\.(md|markdown)$/i.test(f.name))
    if (mdFiles.length === 0) {
      finish({
        ok: false,
        details: [],
        charts: [],
        skipped: [],
        errors: ['No .md file in selection — needed to determine the story slug.'],
      })
      return
    }
    if (mdFiles.length > 1) {
      finish({
        ok: false,
        details: [],
        charts: [],
        skipped: [],
        errors: [
          `Multiple .md files (${mdFiles.map((f) => f.name).join(', ')}) — upload one story at a time.`,
        ],
      })
      return
    }

    const mdFile = mdFiles[0]
    const slug = mdFile.name.replace(/\.(md|markdown)$/i, '')
    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
      finish({
        ok: false,
        details: [],
        charts: [],
        skipped: [],
        errors: [`Bad slug "${slug}" from "${mdFile.name}". Slug must match [a-zA-Z0-9_-].`],
      })
      return
    }

    const configFiles = files.filter((f) => /\.config\.ya?ml$/i.test(f.name))
    const shareFiles = files.filter((f) => /\.share\.ya?ml$/i.test(f.name))
    const jsonFiles = files.filter((f) => /\.json$/i.test(f.name))
    const claimed = new Set([mdFile, ...configFiles, ...shareFiles, ...jsonFiles])
    const skipped = files.filter((f) => !claimed.has(f)).map((f) => f.name)

    if (configFiles.length > 1) {
      finish({
        ok: false,
        details: [],
        charts: [],
        skipped,
        errors: [`Multiple config files: ${configFiles.map((f) => f.name).join(', ')}`],
      })
      return
    }
    if (shareFiles.length > 1) {
      finish({
        ok: false,
        details: [],
        charts: [],
        skipped,
        errors: [`Multiple share files: ${shareFiles.map((f) => f.name).join(', ')}`],
      })
      return
    }

    const markdown = await mdFile.text()
    const configText = configFiles[0] ? await configFiles[0].text() : null
    const shareText = shareFiles[0] ? await shareFiles[0].text() : null

    const payload: Record<string, unknown> = { markdown }
    if (configText !== null) payload.config_yaml = configText
    if (shareText !== null) payload.share_yaml = shareText

    const res = await fetch(`/api/admin/stories/${slug}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      finish({
        ok: false,
        slug,
        details: [],
        charts: [],
        skipped,
        errors: [body?.error ?? `HTTP ${res.status}`],
      })
      return
    }

    const details: string[] = [`markdown ← ${mdFile.name}`]
    if (configText !== null) details.push(`config ← ${configFiles[0].name}`)
    if (shareText !== null) details.push(`share ← ${shareFiles[0].name}`)
    if (body?.warning) details.push(`server warning: ${body.warning}`)
    if (body?.error && body?.warning) details.push(`(${body.error})`)

    // Charts — each one is a separate request via the existing chart route.
    const chartIds: string[] = []
    const errors: string[] = []
    for (const f of jsonFiles) {
      const id = f.name.replace(/\.json$/i, '')
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        errors.push(`${f.name}: chart id must match [a-zA-Z0-9_-]`)
        continue
      }
      const text = await f.text()
      try {
        JSON.parse(text)
      } catch (err) {
        errors.push(`${f.name}: JSON parse — ${err instanceof Error ? err.message : 'invalid'}`)
        continue
      }
      const cr = await fetch(`/api/admin/stories/${slug}/charts/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ raw: text }),
      })
      if (!cr.ok) {
        const cb = await cr.json().catch(() => null)
        errors.push(`${f.name}: ${cb?.error ?? `HTTP ${cr.status}`}`)
        continue
      }
      chartIds.push(id)
    }

    await refreshStories()
    finish({
      ok: errors.length === 0,
      slug,
      details,
      charts: chartIds,
      skipped,
      errors,
    })

    function finish(result: UploadResult) {
      setUploadResult(result)
      setUploadBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-400">
        Loading stories…
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-4 py-5 border-b border-white/5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Stories</h1>
          <p className="text-sm text-neutral-400 mt-0.5">{stories.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/demos"
            className="text-sm text-neutral-300 hover:text-white shrink-0 px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/5"
          >
            Demos →
          </Link>
          <button
            type="button"
            disabled={uploadBusy}
            onClick={() => uploadInputRef.current?.click()}
            className="text-sm text-neutral-300 hover:text-white shrink-0 disabled:opacity-40 px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/5"
            title="Upload .md + optional .config.yaml / .share.yaml / chart .json files for one story"
          >
            {uploadBusy ? 'uploading…' : '↑ upload story'}
          </button>
        </div>
        <input
          ref={uploadInputRef}
          type="file"
          multiple
          accept=".md,.markdown,.yaml,.yml,.json,text/markdown,text/yaml,application/yaml,application/json"
          onChange={uploadStory}
          className="hidden"
        />
      </div>
      {uploadResult && (
        <UploadResultBanner result={uploadResult} onDismiss={() => setUploadResult(null)} />
      )}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-white/5 text-xs uppercase tracking-wider text-neutral-500">
        <div className="flex-1">Title</div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-[104px] text-right">Status</div>
          <div className="w-4 text-center" title="Listed on home">L</div>
          <div className="w-16 text-right">Order</div>
        </div>
      </div>
      <ul className="divide-y divide-white/5">
        {stories.map((s) => (
          <li key={s.slug}>
            <div className="flex items-center justify-between gap-3 px-4 py-4 hover:bg-white/2.5 transition-colors">
              <Link
                href={`/admin/${s.slug}`}
                className="flex-1 min-w-0 flex flex-col active:bg-white/5"
              >
                <div className="font-medium truncate">{s.title}</div>
                <div className="text-xs text-neutral-500 truncate mt-0.5">{s.slug}</div>
              </Link>
              <div className="flex items-center gap-3 shrink-0">
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
    </div>
  )
}

function UploadResultBanner({
  result,
  onDismiss,
}: {
  result: UploadResult
  onDismiss: () => void
}) {
  const hasError = !result.ok || result.errors.length > 0
  return (
    <div
      className={`px-4 py-2 text-xs border-b border-white/5 ${
        hasError ? 'bg-red-950/20 text-red-300' : 'bg-emerald-950/20 text-emerald-300'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-1">
          {result.slug && (
            <div>
              <span className="text-neutral-400">Story:</span>{' '}
              <Link href={`/admin/${result.slug}`} className="underline">
                {result.slug}
              </Link>
            </div>
          )}
          {result.details.length > 0 && (
            <div>
              <span className="text-neutral-400">Saved:</span> {result.details.join(', ')}
            </div>
          )}
          {result.charts.length > 0 && (
            <div>
              <span className="text-neutral-400">Charts uploaded:</span>{' '}
              {result.charts.map((id) => `${id}.json`).join(', ')}
            </div>
          )}
          {result.skipped.length > 0 && (
            <div className="text-neutral-500">
              Skipped (unrecognized): {result.skipped.join(', ')}
            </div>
          )}
          {result.errors.length > 0 && (
            <ul className="list-disc list-inside">
              {result.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-neutral-400 hover:text-white shrink-0"
          title="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
