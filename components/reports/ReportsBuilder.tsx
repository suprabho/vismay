'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { stringify as stringifyYaml } from 'yaml'
import {
  parseReportConfig,
  type ReportPageOverride,
} from '@/lib/storyReportConfig'

export interface BuilderUnit {
  parentIndex: number
  subIndex: number
  heading: string | undefined
  subheading: string | undefined
  paragraphs: string[]
  eyebrow: string | undefined
  chartId: string | undefined
}

interface Props {
  slug: string
  title: string
  units: BuilderUnit[]
  chartIds: string[]
  initialYaml: string | null
  initialPdfs: Record<Format, string | null>
}

type Format = 'report' | 'slides'

interface PageState {
  parentIndex: number
  subIndex: number
  include: boolean
  heading: string
  subheading: string
  paragraphs: string
  chartOverrideId: string
}

function unitKey(u: { parentIndex: number; subIndex: number }): string {
  return `${u.parentIndex}.${u.subIndex}`
}

function buildInitialState(
  units: BuilderUnit[],
  initialYaml: string | null
): PageState[] {
  const config = parseReportConfig(initialYaml)
  const overrides = new Map<string, ReportPageOverride>()
  if (config) {
    for (const p of config.pages) {
      overrides.set(`${p.parentIndex}.${p.subIndex}`, p)
    }
  }
  return units.map((u) => {
    const ov = overrides.get(unitKey(u))
    return {
      parentIndex: u.parentIndex,
      subIndex: u.subIndex,
      include: ov?.include !== false,
      heading: ov?.heading ?? '',
      subheading: ov?.subheading ?? '',
      paragraphs: (ov?.paragraphs ?? []).join('\n\n'),
      chartOverrideId: ov?.chartOverride?.id ?? '',
    }
  })
}

function serializeToYaml(states: PageState[]): string {
  // Only emit entries that diverge from defaults to keep the YAML tidy.
  const pages: ReportPageOverride[] = []
  for (const s of states) {
    const entry: ReportPageOverride = {
      parentIndex: s.parentIndex,
      subIndex: s.subIndex,
    }
    let dirty = false
    if (!s.include) {
      entry.include = false
      dirty = true
    }
    if (s.heading.trim()) {
      entry.heading = s.heading.trim()
      dirty = true
    }
    if (s.subheading.trim()) {
      entry.subheading = s.subheading.trim()
      dirty = true
    }
    if (s.paragraphs.trim()) {
      entry.paragraphs = s.paragraphs
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
      dirty = true
    }
    if (s.chartOverrideId.trim()) {
      entry.chartOverride = { id: s.chartOverrideId.trim() }
      dirty = true
    }
    if (dirty) pages.push(entry)
  }
  if (pages.length === 0) return ''
  // Use yaml's default emit; explicit unit object so the schema reads nicely.
  return stringifyYaml({
    pages: pages.map((p) => ({
      unit: { parentIndex: p.parentIndex, subIndex: p.subIndex },
      ...(p.include === false && { include: false }),
      ...(p.heading && { heading: p.heading }),
      ...(p.subheading && { subheading: p.subheading }),
      ...(p.paragraphs && { paragraphs: p.paragraphs }),
      ...(p.chartOverride && { chartOverride: p.chartOverride }),
    })),
  })
}

export default function ReportsBuilder({
  slug,
  title,
  units,
  chartIds,
  initialYaml,
  initialPdfs,
}: Props) {
  const [format, setFormat] = useState<Format>('report')
  const [pages, setPages] = useState<PageState[]>(() =>
    buildInitialState(units, initialYaml)
  )
  const [savedYaml, setSavedYaml] = useState<string>(initialYaml ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<Format | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  // URLs of the most recently rendered PDFs (one per format). Seeded from the
  // server-side cache lookup; nulls clear when the saved overrides change
  // since that invalidates the content_revision_hash and any old PDF.
  const [pdfUrls, setPdfUrls] = useState<Record<Format, string | null>>(initialPdfs)
  const [iframeKey, setIframeKey] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const draftYaml = useMemo(() => serializeToYaml(pages), [pages])
  const dirty = draftYaml !== savedYaml

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const update = useCallback((idx: number, patch: Partial<PageState>) => {
    setPages((prev) => {
      const next = prev.slice()
      next[idx] = { ...next[idx], ...patch }
      return next
    })
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/story-report-config/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: draftYaml }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setSavedYaml(draftYaml)
      // Don't clear pdfUrls here. The Supabase storage path is stable
      // (`<slug>/<format>.pdf`) and a re-render upserts in place, so the
      // "View latest" link still points at the most recently rendered file
      // even after the saved overrides change.
      // Reload the iframe so the freshly saved overrides are reflected.
      setIframeKey((k) => k + 1)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [draftYaml, slug])

  const handleDownload = useCallback(
    async (fmt: Format) => {
      setDownloading(fmt)
      setDownloadError(null)
      try {
        // Polling loop: hit the API until ready or rendering completes.
        // Up to ~3 minutes of waiting (60 attempts × 3s).
        for (let attempt = 0; attempt < 60; attempt++) {
          const res = await fetch(
            `/api/story-pdf/${slug}?format=${fmt}${attempt === 0 ? '&force=1' : ''}`,
            { cache: 'no-store' }
          )
          if (res.status === 202) {
            await new Promise((r) => setTimeout(r, 3000))
            continue
          }
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.error ?? `HTTP ${res.status}`)
          }
          const data = await res.json()
          if (data.status === 'ready' && data.public_url) {
            // Append a short cache-buster so the freshly uploaded bytes
            // win over any CDN copy of the previous render at the same URL.
            const hash: string | undefined = data.content_revision_hash
            const sep = data.public_url.includes('?') ? '&' : '?'
            const viewUrl = hash
              ? `${data.public_url}${sep}v=${hash.slice(0, 12)}`
              : data.public_url
            setPdfUrls((prev) => ({ ...prev, [fmt]: viewUrl }))
            const link = document.createElement('a')
            link.href = viewUrl
            link.download = `${slug}-${fmt}.pdf`
            link.click()
            return
          }
          await new Promise((r) => setTimeout(r, 3000))
        }
        throw new Error('Render timed out')
      } catch (err) {
        setDownloadError(err instanceof Error ? err.message : 'Download failed')
      } finally {
        setDownloading(null)
      }
    },
    [slug]
  )

  const previewSrc = `/story/${slug}/${format}`
  const overrideCount = useMemo(
    () =>
      pages.filter(
        (p) =>
          !p.include ||
          p.heading.trim() ||
          p.subheading.trim() ||
          p.paragraphs.trim() ||
          p.chartOverrideId.trim()
      ).length,
    [pages]
  )

  const [sheetOpen, setSheetOpen] = useState(false)
  // Close sheet on Escape (mobile + desktop both, harmless on desktop where
  // the sheet isn't visible — `md:hidden` hides the backdrop+sheet anyway).
  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen])

  const editControls = (
    <>
      {pages.map((p, i) => (
        <PageControls
          key={unitKey(p)}
          page={p}
          unit={units[i]}
          chartIds={chartIds}
          onChange={(patch) => update(i, patch)}
        />
      ))}
    </>
  )

  return (
    <div
      className="h-screen flex flex-col"
      style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between gap-2 px-3 sm:px-6 py-3 border-b flex-shrink-0"
        style={{ borderColor: 'var(--color-surface)' }}
      >
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <a
            href={`/story/${slug}`}
            className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-wider opacity-60 hover:opacity-100 flex-shrink-0"
          >
            ←
          </a>
          <h1 className="font-[family-name:var(--font-serif)] text-base sm:text-lg font-bold truncate">
            <span className="hidden sm:inline">Reports — </span>
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <FormatToggle value={format} onChange={setFormat} />
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-3 sm:px-4 py-1.5 rounded-md font-[family-name:var(--font-mono)] text-[0.7rem] sm:text-[0.75rem] uppercase tracking-wider disabled:opacity-40"
            style={{
              background: 'var(--color-accent)',
              color: 'var(--color-bg)',
            }}
          >
            {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
          {pdfUrls[format] && (
            <a
              href={pdfUrls[format] as string}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-wider border"
              style={{
                borderColor: 'var(--color-surface)',
                color: 'var(--color-text)',
                opacity: 0.85,
              }}
              title="Open the most recently rendered PDF in a new tab"
            >
              View latest ↗
            </a>
          )}
          <button
            onClick={() => handleDownload(format)}
            disabled={downloading !== null}
            className="hidden sm:inline-flex px-4 py-1.5 rounded-md font-[family-name:var(--font-mono)] text-[0.75rem] uppercase tracking-wider border disabled:opacity-40"
            style={{
              borderColor: 'var(--color-surface)',
              color: 'var(--color-text)',
            }}
          >
            {downloading === format
              ? 'Rendering…'
              : `Download ${format === 'report' ? 'Report' : 'Slides'}`}
          </button>
          {/* Mobile-only "view latest PDF" link, shown when available */}
          {pdfUrls[format] && (
            <a
              href={pdfUrls[format] as string}
              target="_blank"
              rel="noreferrer"
              aria-label={`View latest ${format} PDF`}
              className="sm:hidden inline-flex items-center justify-center w-9 h-9 rounded-md border"
              style={{
                borderColor: 'var(--color-surface)',
                color: 'var(--color-text)',
                opacity: 0.85,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 3h7v7M21 3l-9 9M19 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6" />
              </svg>
            </a>
          )}
          {/* Mobile-only download icon button */}
          <button
            onClick={() => handleDownload(format)}
            disabled={downloading !== null}
            aria-label={`Download ${format}`}
            className="sm:hidden inline-flex items-center justify-center w-9 h-9 rounded-md border disabled:opacity-40"
            style={{
              borderColor: 'var(--color-surface)',
              color: 'var(--color-text)',
            }}
          >
            {downloading === format ? (
              <span className="text-[0.6rem] font-[family-name:var(--font-mono)]">…</span>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
              </svg>
            )}
          </button>
        </div>
      </div>
      {(saveError || downloadError) && (
        <div
          className="px-3 sm:px-6 py-2 text-[0.75rem]"
          style={{ background: 'var(--color-surface)', color: 'var(--color-warn, #ff6b6b)' }}
        >
          {saveError ?? downloadError}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* Desktop sidebar */}
        <div
          className="hidden md:block md:w-[420px] flex-shrink-0 overflow-y-auto border-r p-4 space-y-3"
          style={{ borderColor: 'var(--color-surface)' }}
        >
          {editControls}
        </div>
        {/* Preview — full width on mobile, fills remaining width on desktop */}
        <div className="flex-1 relative min-h-0" style={{ background: 'var(--color-surface)' }}>
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={previewSrc}
            className="absolute inset-0 w-full h-full border-0"
            style={{ background: 'var(--color-bg)' }}
            title={`Preview · ${format}`}
          />
        </div>
      </div>

      {/* Mobile bottom-sheet trigger */}
      <button
        onClick={() => setSheetOpen(true)}
        className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2.5 rounded-full font-[family-name:var(--font-mono)] text-[0.75rem] uppercase tracking-wider"
        style={{
          background: 'var(--color-accent)',
          color: 'var(--color-bg)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
        Edit{overrideCount > 0 ? ` · ${overrideCount}` : ''}
      </button>

      {/* Mobile bottom sheet + backdrop */}
      <div
        onClick={() => setSheetOpen(false)}
        className="md:hidden fixed inset-0 z-40 transition-opacity duration-200"
        style={{
          background: 'rgba(0,0,0,0.5)',
          opacity: sheetOpen ? 1 : 0,
          pointerEvents: sheetOpen ? 'auto' : 'none',
        }}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit overrides"
        className="md:hidden fixed left-0 right-0 bottom-0 z-50 flex flex-col rounded-t-2xl transition-transform duration-300"
        style={{
          background: 'var(--color-bg)',
          maxHeight: '85vh',
          height: '85vh',
          transform: sheetOpen ? 'translateY(0)' : 'translateY(100%)',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
          borderTop: '1px solid var(--color-surface)',
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
          style={{ borderColor: 'var(--color-surface)' }}
        >
          <div
            aria-hidden="true"
            className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full"
            style={{ background: 'var(--color-surface)' }}
          />
          <h2 className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-wider">
            Edit overrides{overrideCount > 0 ? ` · ${overrideCount}` : ''}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="px-3 py-1.5 rounded-md font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-wider disabled:opacity-40"
              style={{
                background: 'var(--color-accent)',
                color: 'var(--color-bg)',
              }}
            >
              {saving ? '…' : dirty ? 'Save' : 'Saved'}
            </button>
            <button
              onClick={() => setSheetOpen(false)}
              aria-label="Close"
              className="w-8 h-8 inline-flex items-center justify-center rounded-md"
              style={{ color: 'var(--color-text)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">{editControls}</div>
      </div>
    </div>
  )
}

function FormatToggle({
  value,
  onChange,
}: {
  value: Format
  onChange: (v: Format) => void
}) {
  return (
    <div
      className="flex rounded-md overflow-hidden border"
      style={{ borderColor: 'var(--color-surface)' }}
    >
      {(['report', 'slides'] as const).map((opt) => {
        const active = value === opt
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className="px-3 py-1.5 font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-wider"
            style={{
              background: active ? 'var(--color-accent)' : 'transparent',
              color: active ? 'var(--color-bg)' : 'var(--color-text)',
            }}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function PageControls({
  page,
  unit,
  chartIds,
  onChange,
}: {
  page: PageState
  unit: BuilderUnit
  chartIds: string[]
  onChange: (patch: Partial<PageState>) => void
}) {
  return (
    <div
      className="rounded-md p-3 space-y-2 border"
      style={{
        borderColor: 'var(--color-surface)',
        opacity: page.include ? 1 : 0.5,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-wider opacity-60">
          §{unit.parentIndex}.{unit.subIndex}
          {unit.eyebrow && ` · ${unit.eyebrow}`}
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={page.include}
            onChange={(e) => onChange({ include: e.target.checked })}
          />
          <span className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-wider">
            Include
          </span>
        </label>
      </div>
      <div className="text-[0.85rem] opacity-80 line-clamp-2">
        {unit.heading || unit.subheading || unit.paragraphs[0] || '(no heading)'}
      </div>
      <input
        type="text"
        placeholder={unit.heading ? `Override: ${unit.heading}` : 'Custom heading'}
        value={page.heading}
        onChange={(e) => onChange({ heading: e.target.value })}
        className="w-full px-2 py-1.5 rounded text-[0.85rem] border"
        style={{
          borderColor: 'var(--color-surface)',
          background: 'transparent',
          color: 'var(--color-text)',
        }}
      />
      <input
        type="text"
        placeholder="Custom subheading"
        value={page.subheading}
        onChange={(e) => onChange({ subheading: e.target.value })}
        className="w-full px-2 py-1.5 rounded text-[0.85rem] border"
        style={{
          borderColor: 'var(--color-surface)',
          background: 'transparent',
          color: 'var(--color-text)',
        }}
      />
      <textarea
        placeholder={unit.paragraphs[0] ? 'Custom paragraphs (blank line between)' : 'Custom paragraphs'}
        value={page.paragraphs}
        onChange={(e) => onChange({ paragraphs: e.target.value })}
        rows={3}
        className="w-full px-2 py-1.5 rounded text-[0.85rem] border resize-vertical"
        style={{
          borderColor: 'var(--color-surface)',
          background: 'transparent',
          color: 'var(--color-text)',
        }}
      />
      {chartIds.length > 0 && (
        <select
          value={page.chartOverrideId}
          onChange={(e) => onChange({ chartOverrideId: e.target.value })}
          className="w-full px-2 py-1.5 rounded text-[0.85rem] border"
          style={{
            borderColor: 'var(--color-surface)',
            background: 'transparent',
            color: 'var(--color-text)',
          }}
        >
          <option value="">{unit.chartId ? `Default: ${unit.chartId}` : 'No chart override'}</option>
          {chartIds.map((id) => (
            <option key={id} value={`data:${id}`}>
              data:{id}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
