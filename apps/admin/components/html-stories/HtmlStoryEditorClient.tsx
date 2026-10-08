'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowSquareOut, Desktop, DeviceMobile, UploadSimple } from '@phosphor-icons/react'
import { auraCaptureUrl } from '@vismay/viz-engine'
import type { HtmlStoryApp } from '@vismay/html-stories/apps'
import { brandHtmlStory } from '@vismay/html-stories/branding'
import {
  extractHtmlMeta,
  isSafeSlug,
  lintHtml,
  parseAuraSlug,
  slugify,
  type HtmlStoryStatus,
} from '@vismay/html-stories/meta'

interface Version {
  id: number
  title: string
  source: string | null
  createdAt: string
}

type Viewport = 'phone' | 'desktop'

/** Same sandbox the public /s/<slug> route serves under, so the preview breaks where the live page would. */
const PREVIEW_SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals'

/**
 * The HTML story editor for one hosting app: paste/upload, sandboxed preview
 * in that site's chrome, publish/unpublish, history with restore. `basePath`
 * is the admin section it lives under (/vizmaya/html-stories,
 * /footshorts/html-stories, /vizf1/html-stories); every API call carries `app`.
 */
export default function HtmlStoryEditorClient({
  slug: initialSlug,
  create,
  siteUrl,
  app,
  basePath,
}: {
  slug: string
  create: boolean
  siteUrl: string
  app: HtmlStoryApp
  basePath: string
}) {
  const router = useRouter()
  const appQs = `app=${encodeURIComponent(app)}`
  const [slug, setSlug] = useState(initialSlug)
  const [slugTouched, setSlugTouched] = useState(false)
  const [title, setTitle] = useState('')
  const [titleTouched, setTitleTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [descriptionTouched, setDescriptionTouched] = useState(false)
  const [status, setStatus] = useState<HtmlStoryStatus>('draft')
  const [html, setHtml] = useState('')
  const [savedHtml, setSavedHtml] = useState('')
  // Aura scene behind the served page and on its home-page card; picked after the HTML is in.
  const [aura, setAura] = useState('')
  const [savedAura, setSavedAura] = useState('')
  const [versions, setVersions] = useState<Version[]>([])
  const [versionPreview, setVersionPreview] = useState<{ id: number; html: string } | null>(null)
  const [viewport, setViewport] = useState<Viewport>('phone')
  const [loading, setLoading] = useState(!create)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  async function fetchStory(s: string) {
    const res = await fetch(`/api/html-stories/${s}?${appQs}`)
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? 'load failed')
    return body
  }

  function applyStory(body: {
    story: { title: string | null; description: string | null; status: HtmlStoryStatus; html: string; aura: string | null }
    versions?: Version[]
  }) {
    setTitle(body.story.title ?? '')
    setAura(body.story.aura ?? '')
    setSavedAura(body.story.aura ?? '')
    setDescription(body.story.description ?? '')
    setStatus(body.story.status)
    setHtml(body.story.html)
    setSavedHtml(body.story.html)
    setVersions(body.versions ?? [])
    setTitleTouched(false)
    setDescriptionTouched(false)
  }

  useEffect(() => {
    if (create) return
    let cancelled = false
    ;(async () => {
      try {
        const body = await fetchStory(initialSlug)
        if (!cancelled) applyStory(body)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'load failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [create, initialSlug])

  // In create mode, title / description / slug follow the pasted document until edited by hand.
  const meta = useMemo(() => extractHtmlMeta(html), [html])
  const shownTitle = create && !titleTouched ? (meta.title ?? '') : title
  const shownDescription = create && !descriptionTouched ? (meta.description ?? '') : description
  const shownSlug = create && !slugTouched ? (meta.title ? slugify(meta.title) : '') : slug

  const lint = useMemo(() => lintHtml(html), [html])

  // Debounce the preview so typing in the textarea doesn't reload the iframe per keystroke.
  const [previewHtml, setPreviewHtml] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setPreviewHtml(html), 400)
    return () => clearTimeout(t)
  }, [html])

  // A paged format's runtime (book, deck) measures its pages and slides in the
  // preview and posts any that overflow their frame: a check the lint can't
  // make without rendering. Only messages from this preview's frame count, and
  // each report is kept with the document it came from, so a reload never
  // shows the last document's.
  const previewRef = useRef<HTMLIFrameElement>(null)
  const previewKey = `${versionPreview?.id ?? 'draft'}|${aura}|${previewHtml}`
  const previewKeyRef = useRef(previewKey)
  useEffect(() => {
    previewKeyRef.current = previewKey
  }, [previewKey])
  const [frameReport, setFrameReport] = useState<{ key: string; warnings: string[] } | null>(null)
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!previewRef.current || e.source !== previewRef.current.contentWindow) return
      const d = e.data as { type?: unknown; warnings?: unknown } | null
      if (!d || d.type !== 'vizmaya:format-check' || !Array.isArray(d.warnings)) return
      const warnings = d.warnings.filter((w): w is string => typeof w === 'string').slice(0, 20)
      setFrameReport({ key: previewKeyRef.current, warnings })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])
  // Shown with the lint while the preview is of the draft being edited.
  const frameWarnings =
    frameReport && frameReport.key === previewKey && !versionPreview && html === previewHtml ? frameReport.warnings : []

  const auraSlug = aura.trim() ? parseAuraSlug(aura) : null
  const auraInvalid = aura.trim() !== '' && !auraSlug
  const auraChanged = (auraSlug ?? '') !== savedAura
  const dirty = create || html !== savedHtml || titleTouched || descriptionTouched || auraChanged

  async function readFile(file: File) {
    setHtml(await file.text())
    setVersionPreview(null)
  }

  async function save(nextStatus?: HtmlStoryStatus) {
    const slug = shownSlug
    if (!isSafeSlug(slug) || slug === 'new') {
      setError('Slug must be lowercase letters, digits and single hyphens.')
      return
    }
    if (auraInvalid) {
      setError('Aura must be a scene slug or an aura.promad.design scene URL.')
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/html-stories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          app,
          slug,
          html,
          status: nextStatus,
          title: titleTouched ? title : undefined,
          description: descriptionTouched ? description : undefined,
          aura: create || auraChanged ? (auraSlug ?? '') : undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'save failed')
      if (create) {
        if (body.created === false) {
          // Replaced an existing slug; say so rather than silently overwrite.
          setNotice('A story with this slug already existed; its HTML was replaced (the old version is in history).')
        }
        router.replace(`${basePath}/${slug}`)
        return
      }
      applyStory(await fetchStory(slug))
      setNotice(nextStatus === 'published' ? 'Published.' : 'Saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed')
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(next: HtmlStoryStatus) {
    if (dirty) return save(next)
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/html-stories/${slug}?${appQs}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ app, status: next }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'update failed')
      setStatus(body.story.status)
      setNotice(next === 'published' ? 'Published.' : `Moved to ${next}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'update failed')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!confirm(`Delete "${title || slug}" and all its versions? This can't be undone.`)) return
    setSaving(true)
    try {
      const res = await fetch(`/api/html-stories/${slug}?${appQs}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'delete failed')
      router.push(basePath)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'delete failed')
      setSaving(false)
    }
  }

  async function previewVersion(id: number) {
    if (versionPreview?.id === id) return setVersionPreview(null)
    const res = await fetch(`/api/html-stories/${slug}/versions/${id}?${appQs}`)
    const body = await res.json()
    if (!res.ok) return setError(body.error ?? 'load failed')
    setVersionPreview({ id, html: body.html })
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">Loading…</div>
  }

  const field = 'w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30'
  const label = 'block text-xs uppercase tracking-wider text-neutral-500 mb-1.5'
  const liveUrl = `${siteUrl}/s/${shownSlug || '<slug>'}`
  const shownHtml = versionPreview?.html ?? previewHtml
  // Wrapped in the same header/footer the public route adds for this site.
  const brandedPreview = brandHtmlStory(shownHtml, { siteUrl, aura: auraSlug, app })

  return (
    // The admin root is h-svh + overflow-hidden, so each page scrolls itself.
    // Wide: two panes side by side, each its own scroller. Narrow: one column,
    // the whole page scrolls (a scroller inside a clipped column would not).
    <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-y-auto lg:overflow-hidden">
      {/* Left: source + controls */}
      <div className="lg:w-[440px] shrink-0 border-b lg:border-b-0 lg:border-r border-white/5 lg:min-h-0 lg:overflow-y-auto">
        <div className="px-4 py-5">
          <Link href={basePath} className="text-sm text-neutral-400 hover:text-white">
            ← HTML stories
          </Link>
          <div className="flex items-center gap-2 mt-3 mb-5">
            <h1 className="text-lg font-semibold truncate">{create ? 'New HTML story' : title || slug}</h1>
            {!create && (
              <span
                className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                  status === 'published' ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-400/80 bg-amber-500/10'
                }`}
              >
                {status}
              </span>
            )}
          </div>

          {error && (
            <div className="mb-4 text-sm text-red-400 border border-red-500/30 bg-red-500/5 rounded-lg px-3 py-2">{error}</div>
          )}
          {notice && (
            <div className="mb-4 text-sm text-emerald-300 border border-emerald-500/30 bg-emerald-500/5 rounded-lg px-3 py-2">
              {notice}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={label.replace(' mb-1.5', '')}>HTML</label>
                <button
                  onClick={() => fileInput.current?.click()}
                  className="text-xs text-neutral-400 hover:text-white inline-flex items-center gap-1"
                >
                  <UploadSimple size={12} /> Upload .html
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".html,.htm,text/html"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) readFile(f)
                    e.target.value = ''
                  }}
                />
              </div>
              <textarea
                className={`${field} min-h-[220px] font-mono text-xs leading-relaxed`}
                value={html}
                spellCheck={false}
                placeholder="Paste the agent's complete HTML here, or drop a .html file."
                onChange={(e) => {
                  setHtml(e.target.value)
                  setVersionPreview(null)
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const f = e.dataTransfer.files?.[0]
                  if (f) {
                    e.preventDefault()
                    readFile(f)
                  }
                }}
              />
              <p className="text-xs text-neutral-600 mt-1">
                {(new TextEncoder().encode(html).length / 1024).toFixed(0)} KB
              </p>
            </div>

            {html.trim() !== '' && (lint.errors.length > 0 || lint.warnings.length > 0 || frameWarnings.length > 0) && (
              <ul className="text-xs space-y-1.5 border border-white/10 rounded-lg p-3">
                {lint.errors.map((m) => (
                  <li key={m} className="text-red-400">✕ {m}</li>
                ))}
                {lint.warnings.map((m) => (
                  <li key={m} className="text-amber-300/90">! {m}</li>
                ))}
                {frameWarnings.map((m) => (
                  <li key={`frame:${m}`} className="text-amber-300/90">! In the preview, {m}.</li>
                ))}
              </ul>
            )}

            <div>
              <label className={label}>Slug</label>
              <input
                className={field}
                value={shownSlug}
                disabled={!create}
                placeholder={
                  app === 'footshorts'
                    ? 'arsenal-chelsea-xg-gap-2026'
                    : app === 'vizf1'
                      ? 'norris-piastri-pit-wall-2026'
                      : app === 'viznba'
                        ? 'knicks-bench-minutes-2026'
                        : 'india-solar-boom-2026'
                }
                onChange={(e) => {
                  setSlug(e.target.value)
                  setSlugTouched(true)
                }}
              />
              <p className="text-xs text-neutral-600 mt-1 truncate">{create ? 'Live at' : 'Slug is fixed. Live at'} {liveUrl}</p>
            </div>
            <div>
              <label className={label}>Title</label>
              <input
                className={field}
                value={shownTitle}
                placeholder="Taken from the page's <title>"
                onChange={(e) => {
                  setTitle(e.target.value)
                  setTitleTouched(true)
                }}
              />
            </div>
            <div>
              <label className={label}>Description</label>
              <textarea
                className={`${field} min-h-[64px]`}
                value={shownDescription}
                placeholder='Taken from <meta name="description">'
                onChange={(e) => {
                  setDescription(e.target.value)
                  setDescriptionTouched(true)
                }}
              />
            </div>
            <div>
              <label className={label}>Aura background</label>
              <div className="flex gap-3 items-start">
                <div className="w-16 h-16 shrink-0 rounded-lg border border-white/10 bg-neutral-900 overflow-hidden">
                  {auraSlug && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={auraSlug}
                      src={auraCaptureUrl(auraSlug, { w: 128, h: 128 })}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    className={`${field}${auraInvalid ? ' border-red-500/50' : ''}`}
                    value={aura}
                    placeholder="Scene slug or aura.promad.design URL"
                    spellCheck={false}
                    onChange={(e) => setAura(e.target.value)}
                  />
                  <p className={`text-xs mt-1 ${auraInvalid ? 'text-red-400' : 'text-neutral-600'}`}>
                    {auraInvalid
                      ? 'Not a scene slug or scene URL.'
                      : 'Laid behind the page and played on its home-page card. Empty keeps the og:image thumbnail.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-6">
            {(create || status !== 'published') && (
              <button
                onClick={() => (create ? save('published') : changeStatus('published'))}
                disabled={saving || lint.errors.length > 0}
                className="text-sm bg-white text-black px-4 py-2 rounded-lg font-medium disabled:opacity-50"
              >
                {saving ? 'Saving…' : dirty ? 'Save & publish' : 'Publish'}
              </button>
            )}
            {(dirty || create) && (
              <button
                onClick={() => save()}
                disabled={saving || lint.errors.length > 0}
                className={`text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-50 ${
                  !create && status === 'published' ? 'bg-white text-black' : 'border border-white/15 text-neutral-200 hover:bg-white/5'
                }`}
              >
                {!create && status === 'published' ? 'Save (live)' : 'Save draft'}
              </button>
            )}
            {!create && status === 'published' && (
              <>
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-neutral-300 hover:text-white px-3 py-2 inline-flex items-center gap-1.5"
                >
                  Open <ArrowSquareOut size={14} />
                </a>
                <button
                  onClick={() => changeStatus('draft')}
                  disabled={saving}
                  className="text-sm text-neutral-400 hover:text-white px-3 py-2 disabled:opacity-50"
                >
                  Unpublish
                </button>
              </>
            )}
            {!create && (
              <button
                onClick={remove}
                disabled={saving}
                className="text-sm text-red-400 hover:text-red-300 px-3 py-2 disabled:opacity-50 ml-auto"
              >
                Delete
              </button>
            )}
          </div>

          {!create && versions.length > 0 && (
            <div className="mt-8">
              <h2 className={label}>History</h2>
              <ul className="divide-y divide-white/5 border border-white/5 rounded-lg">
                {versions.map((v, i) => (
                  <li key={v.id} className={`px-3 py-2 text-xs ${versionPreview?.id === v.id ? 'bg-white/[0.04]' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-neutral-300 truncate">
                          {new Date(v.createdAt).toLocaleString()}
                          {i === 0 && <span className="ml-1.5 text-neutral-500">(current)</span>}
                        </div>
                        <div className="text-neutral-600 truncate">{v.source ?? 'unknown'} · {v.title}</div>
                      </div>
                      {i > 0 && (
                        <div className="shrink-0 flex gap-2">
                          <button onClick={() => previewVersion(v.id)} className="text-neutral-400 hover:text-white">
                            {versionPreview?.id === v.id ? 'Hide' : 'Preview'}
                          </button>
                          {versionPreview?.id === v.id && (
                            <button
                              onClick={() => {
                                setHtml(versionPreview.html)
                                setVersionPreview(null)
                                setNotice('Restored into the editor. Save to make it current.')
                              }}
                              className="text-amber-300 hover:text-amber-200"
                            >
                              Restore
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Right: preview */}
      <div className="shrink-0 lg:shrink lg:flex-1 flex flex-col min-h-[70vh] lg:min-h-0 bg-neutral-950">
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2 border-b border-white/5 text-xs text-neutral-500">
          <span>{versionPreview ? `Previewing an earlier version` : 'Preview (same sandbox as the live page)'}</span>
          <div className="flex gap-1">
            {(['phone', 'desktop'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setViewport(v)}
                aria-label={v}
                className={`p-1.5 rounded ${viewport === v ? 'bg-white/10 text-white' : 'hover:text-white'}`}
              >
                {v === 'phone' ? <DeviceMobile size={16} /> : <Desktop size={16} />}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-h-0 flex justify-center overflow-auto p-4">
          {shownHtml.trim() ? (
            <iframe
              ref={previewRef}
              title="Story preview"
              srcDoc={brandedPreview}
              sandbox={PREVIEW_SANDBOX}
              className={`bg-white border border-white/10 h-full ${
                viewport === 'phone' ? 'w-[390px] rounded-[20px]' : 'w-full rounded-lg'
              }`}
              style={{ minHeight: 600 }}
            />
          ) : (
            <div className="self-center text-sm text-neutral-600">Paste HTML to see it here.</div>
          )}
        </div>
      </div>
    </div>
  )
}
