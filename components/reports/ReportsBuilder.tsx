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
            const link = document.createElement('a')
            link.href = data.public_url
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

  return (
    <div
      className="h-screen flex flex-col"
      style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-6 py-3 border-b flex-shrink-0"
        style={{ borderColor: 'var(--color-surface)' }}
      >
        <div className="flex items-center gap-4">
          <a
            href={`/story/${slug}`}
            className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-wider opacity-60 hover:opacity-100"
          >
            ← Story
          </a>
          <h1 className="font-[family-name:var(--font-serif)] text-lg font-bold">
            Reports — {title}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <FormatToggle value={format} onChange={setFormat} />
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-4 py-1.5 rounded-md font-[family-name:var(--font-mono)] text-[0.75rem] uppercase tracking-wider disabled:opacity-40"
            style={{
              background: 'var(--color-accent)',
              color: 'var(--color-bg)',
            }}
          >
            {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
          <button
            onClick={() => handleDownload(format)}
            disabled={downloading !== null}
            className="px-4 py-1.5 rounded-md font-[family-name:var(--font-mono)] text-[0.75rem] uppercase tracking-wider border disabled:opacity-40"
            style={{
              borderColor: 'var(--color-surface)',
              color: 'var(--color-text)',
            }}
          >
            {downloading === format
              ? 'Rendering…'
              : `Download ${format === 'report' ? 'Report' : 'Slides'}`}
          </button>
        </div>
      </div>
      {(saveError || downloadError) && (
        <div
          className="px-6 py-2 text-[0.75rem]"
          style={{ background: 'var(--color-surface)', color: 'var(--color-warn, #ff6b6b)' }}
        >
          {saveError ?? downloadError}
        </div>
      )}

      {/* Body: controls left, preview right */}
      <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: '420px 1fr' }}>
        <div
          className="overflow-y-auto border-r p-4 space-y-3"
          style={{ borderColor: 'var(--color-surface)' }}
        >
          {pages.map((p, i) => (
            <PageControls
              key={unitKey(p)}
              page={p}
              unit={units[i]}
              chartIds={chartIds}
              onChange={(patch) => update(i, patch)}
            />
          ))}
        </div>
        <div className="relative" style={{ background: 'var(--color-surface)' }}>
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
