'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppStory } from '@vismay/content-source/apps'
import type {
  HeygenTemplateSummary,
  HeygenTemplateDetail,
  HeygenVariable,
} from '@vismay/content-source/heygenTemplate'
import type { HeygenRenderRow } from '@vismay/content-source/heygenRenders'

interface Props {
  appSlug: string
  stories: AppStory[]
}

type StatusResponse = {
  videoId: string
  status: HeygenRenderRow['status']
  publicUrl: string | null
  thumbnailUrl: string | null
  durationMs: number | null
  error: string | null
}

/** Aspect presets → pixel dimension. `default` keeps the template's own size. */
const ASPECTS: { key: string; label: string; dim?: { width: number; height: number } }[] = [
  { key: 'default', label: 'Template default' },
  { key: '9:16', label: '9:16 (vertical)', dim: { width: 720, height: 1280 } },
  { key: '16:9', label: '16:9 (landscape)', dim: { width: 1280, height: 720 } },
  { key: '1:1', label: '1:1 (square)', dim: { width: 1080, height: 1080 } },
]

const POLL_INTERVAL_MS = 5000

export function HeygenStudio({ appSlug, stories }: Props) {
  const [templates, setTemplates] = useState<HeygenTemplateSummary[] | null>(null)
  const [templatesError, setTemplatesError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<HeygenTemplateDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [formValues, setFormValues] = useState<Record<string, string>>({})

  const [storySlug, setStorySlug] = useState<string | null>(null)
  const [storyQuery, setStoryQuery] = useState('')

  const [title, setTitle] = useState('')
  const [aspect, setAspect] = useState('default')
  const [test, setTest] = useState(true)

  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusResponse | null>(null)

  const [renders, setRenders] = useState<HeygenRenderRow[]>([])
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load templates once. ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/heygen/templates')
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
        if (!cancelled) setTemplates(json.templates ?? [])
      } catch (e) {
        if (!cancelled) setTemplatesError(e instanceof Error ? e.message : 'failed to load')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ── Stop polling on unmount. ────────────────────────────────────────────
  useEffect(() => () => {
    if (pollRef.current) clearTimeout(pollRef.current)
  }, [])

  const filteredStories = useMemo(() => {
    const q = storyQuery.trim().toLowerCase()
    if (!q) return stories
    return stories.filter(
      (s) => s.title.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q),
    )
  }, [stories, storyQuery])

  const selectedStory = useMemo(
    () => stories.find((s) => s.slug === storySlug) ?? null,
    [stories, storySlug],
  )

  const refreshRenders = useCallback(async (slug: string) => {
    try {
      const res = await fetch(`/api/heygen/renders?slug=${encodeURIComponent(slug)}`)
      const json = await res.json()
      if (res.ok) setRenders(json.renders ?? [])
    } catch {
      /* non-fatal */
    }
  }, [])

  async function selectTemplate(id: string) {
    setSelectedId(id)
    setDetail(null)
    setDetailError(null)
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/heygen/templates/${encodeURIComponent(id)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      const d = json.template as HeygenTemplateDetail
      setDetail(d)
      const init: Record<string, string> = {}
      for (const [name, def] of Object.entries(d.variables ?? {})) {
        init[name] =
          def.type === 'text'
            ? String(def.properties?.content ?? '')
            : String(def.properties?.url ?? '')
      }
      setFormValues(init)
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'failed to load template')
    } finally {
      setLoadingDetail(false)
    }
  }

  function selectStory(slug: string) {
    setStorySlug(slug)
    void refreshRenders(slug)
  }

  function buildVariables(): Record<string, HeygenVariable> {
    const vars: Record<string, HeygenVariable> = {}
    for (const [name, def] of Object.entries(detail?.variables ?? {})) {
      const val = formValues[name] ?? ''
      if (def.type === 'text') {
        vars[name] = { name, type: 'text', properties: { content: val } }
      } else if (def.type === 'image' || def.type === 'video' || def.type === 'audio') {
        vars[name] = { name, type: def.type, properties: val ? { url: val } : { ...def.properties } }
      } else {
        // Unknown slot type — pass the template's own properties through untouched.
        vars[name] = { name, type: def.type, properties: { ...def.properties } }
      }
    }
    return vars
  }

  function pollStatus(videoId: string) {
    if (pollRef.current) clearTimeout(pollRef.current)
    const tick = async () => {
      try {
        const res = await fetch(`/api/heygen/status/${encodeURIComponent(videoId)}`)
        const json = (await res.json()) as StatusResponse & { error?: string }
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
        setStatus(json)
        if (json.status === 'completed' || json.status === 'failed') {
          if (storySlug) void refreshRenders(storySlug)
          return
        }
      } catch (e) {
        setGenError(e instanceof Error ? e.message : 'status poll failed')
        // Keep polling through transient errors.
      }
      pollRef.current = setTimeout(tick, POLL_INTERVAL_MS)
    }
    void tick()
  }

  async function generate() {
    if (!selectedId || !storySlug) return
    setGenerating(true)
    setGenError(null)
    setStatus(null)
    try {
      const dim = ASPECTS.find((a) => a.key === aspect)?.dim
      const res = await fetch('/api/heygen/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedId,
          variables: buildVariables(),
          slug: storySlug,
          appSlug,
          title: title.trim() || undefined,
          dimension: dim,
          test,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setStatus({
        videoId: json.videoId,
        status: 'pending',
        publicUrl: null,
        thumbnailUrl: null,
        durationMs: null,
        error: null,
      })
      pollStatus(json.videoId)
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const inFlight = status?.status === 'pending' || status?.status === 'processing'
  const canGenerate = Boolean(selectedId && storySlug && detail && !generating && !inFlight)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
      {/* ── Template gallery ──────────────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-200">Templates</h2>
        {templatesError && <p className="text-xs text-red-400">{templatesError}</p>}
        {!templates && !templatesError && (
          <p className="text-xs text-neutral-500">Loading templates…</p>
        )}
        {templates && templates.length === 0 && (
          <p className="text-xs text-neutral-500">No templates in this HeyGen account.</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {(templates ?? []).map((t) => (
            <button
              key={t.template_id}
              onClick={() => selectTemplate(t.template_id)}
              className={`overflow-hidden rounded border text-left transition ${
                selectedId === t.template_id
                  ? 'border-blue-500 ring-1 ring-blue-500'
                  : 'border-white/10 hover:border-white/30'
              }`}
            >
              {t.thumbnail_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={t.thumbnail_image_url}
                  alt={t.name ?? t.template_id}
                  className="aspect-video w-full object-cover"
                />
              ) : (
                <div className="aspect-video w-full bg-white/5" />
              )}
              <div className="truncate px-2 py-1 text-xs text-neutral-300">
                {t.name ?? t.template_id}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── Form + generate + result ──────────────────────────────────── */}
      <section className="space-y-5">
        {!selectedId && (
          <p className="text-sm text-neutral-500">Select a template to begin.</p>
        )}

        {selectedId && (
          <>
            {/* Variables */}
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-neutral-200">Variables</h2>
              {loadingDetail && <p className="text-xs text-neutral-500">Loading…</p>}
              {detailError && <p className="text-xs text-red-400">{detailError}</p>}
              {detail && Object.keys(detail.variables ?? {}).length === 0 && (
                <p className="text-xs text-neutral-500">This template has no variables.</p>
              )}
              {detail &&
                Object.entries(detail.variables ?? {}).map(([name, def]) => (
                  <label key={name} className="block">
                    <span className="text-xs text-neutral-400">
                      {name} <span className="text-neutral-600">· {def.type}</span>
                    </span>
                    {def.type === 'text' ? (
                      <textarea
                        value={formValues[name] ?? ''}
                        onChange={(e) =>
                          setFormValues((v) => ({ ...v, [name]: e.target.value }))
                        }
                        rows={2}
                        className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-neutral-100"
                      />
                    ) : def.type === 'image' || def.type === 'video' || def.type === 'audio' ? (
                      <input
                        type="url"
                        value={formValues[name] ?? ''}
                        onChange={(e) =>
                          setFormValues((v) => ({ ...v, [name]: e.target.value }))
                        }
                        placeholder={`https://… (${def.type} URL)`}
                        className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-neutral-100"
                      />
                    ) : (
                      <p className="mt-1 text-xs text-neutral-500">
                        Unsupported slot type — the template default is used.
                      </p>
                    )}
                  </label>
                ))}
            </div>

            {/* Attach to story */}
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-neutral-200">Attach to story</h2>
              <input
                type="text"
                value={storyQuery}
                onChange={(e) => setStoryQuery(e.target.value)}
                placeholder="Search stories…"
                className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-neutral-100"
              />
              <div className="max-h-44 overflow-y-auto rounded border border-white/10">
                {filteredStories.length === 0 && (
                  <p className="px-2 py-2 text-xs text-neutral-500">No stories.</p>
                )}
                {filteredStories.map((s) => (
                  <button
                    key={s.slug}
                    onClick={() => selectStory(s.slug)}
                    className={`block w-full truncate px-2 py-1 text-left text-sm ${
                      storySlug === s.slug
                        ? 'bg-blue-600/30 text-neutral-100'
                        : 'text-neutral-300 hover:bg-white/5'
                    }`}
                  >
                    {s.title}
                  </button>
                ))}
              </div>
              {selectedStory && (
                <p className="text-xs text-neutral-500">
                  Attaching to <span className="text-neutral-300">{selectedStory.title}</span>
                </p>
              )}
            </div>

            {/* Options */}
            <div className="flex flex-wrap items-end gap-4">
              <label className="block">
                <span className="text-xs text-neutral-400">Title (optional)</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-56 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-neutral-100"
                />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-400">Aspect</span>
                <select
                  value={aspect}
                  onChange={(e) => setAspect(e.target.value)}
                  className="mt-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-neutral-100"
                >
                  {ASPECTS.map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={test}
                  onChange={(e) => setTest(e.target.checked)}
                />
                Test render (free, watermarked)
              </label>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={generate}
                disabled={!canGenerate}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {generating ? 'Starting…' : inFlight ? 'Rendering…' : 'Generate video'}
              </button>
              {!storySlug && (
                <span className="text-xs text-neutral-500">Pick a story to attach.</span>
              )}
            </div>

            {genError && <p className="text-sm text-red-400">{genError}</p>}

            {/* Current render status */}
            {status && (
              <div className="rounded border border-white/10 p-3">
                <p className="text-xs text-neutral-400">
                  Status: <span className="text-neutral-200">{status.status}</span>
                  {status.error ? ` — ${status.error}` : ''}
                </p>
                {inFlight && (
                  <p className="mt-1 text-xs text-neutral-500">
                    Rendering on HeyGen… this can take a few minutes.
                  </p>
                )}
                {status.status === 'completed' && status.publicUrl && (
                  <div className="mt-2 space-y-2">
                    <video src={status.publicUrl} controls className="max-h-80 rounded" />
                    <a
                      href={status.publicUrl}
                      download
                      className="inline-block text-xs text-blue-400 hover:underline"
                    >
                      Download MP4
                    </a>
                    {selectedStory && (
                      <p className="text-xs text-green-400">
                        Saved &amp; attached to {selectedStory.title}.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Existing renders for this story */}
            {storySlug && renders.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-medium text-neutral-200">
                  Renders for this story
                </h2>
                <ul className="space-y-1">
                  {renders.map((r) => (
                    <li
                      key={r.video_id}
                      className="flex items-center gap-2 rounded border border-white/10 px-2 py-1 text-xs"
                    >
                      <span
                        className={`rounded px-1.5 py-0.5 ${
                          r.status === 'completed'
                            ? 'bg-green-600/30 text-green-300'
                            : r.status === 'failed'
                              ? 'bg-red-600/30 text-red-300'
                              : 'bg-white/10 text-neutral-300'
                        }`}
                      >
                        {r.status}
                      </span>
                      <span className="truncate text-neutral-300">
                        {r.title || r.template_id}
                      </span>
                      {r.test && <span className="text-neutral-500">test</span>}
                      {r.public_url && (
                        <a
                          href={r.public_url}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-auto text-blue-400 hover:underline"
                        >
                          open
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
