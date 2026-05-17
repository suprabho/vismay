'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import {
  parseStoryOverrides,
  type PinOverride,
  type ReportPageOverride,
} from '@/lib/storyReportConfig'
import { extractMapView, type MapView } from '@vismay/viz-engine'
import MapPickerModal, {
  type PickerFrame,
} from '@/components/admin/MapPickerModal'

export interface BuilderUnit {
  parentIndex: number
  subIndex: number
  heading: string | undefined
  subheading: string | undefined
  paragraphs: string[]
  eyebrow: string | undefined
  chartId: string | undefined
  /** Section default map camera. Null when the section has no `map:` block. */
  parentMap: MapView | null
  /** Section default pin list, used as starting state when the user opens the
   *  pin-override YAML editor. */
  parentPins: Array<{ coordinates: [number, number]; label?: string; labelAnchor?: PinOverride['labelAnchor'] }>
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

/** Actual map-div dimensions inside each PDF page layout, used as the
 *  "frame reference" rectangle in the map picker so the user can frame the
 *  camera against the same aspect ratio they'll see in the rendered output.
 *  Sources:
 *    - report: ReportShell.tsx — full-width map @ 3.5in tall inside a 794×1123
 *      page with 56px side padding. Effective 682×336 px.
 *    - slides: SlidesShell.tsx — left-half map at 50% × (1080 - 64 - 48) px =
 *      960×968 px. */
const MAP_FRAME_BY_FORMAT: Record<Format, PickerFrame> = {
  report: { width: 682, height: 336, label: 'Report map · 682×336' },
  slides: { width: 960, height: 968, label: 'Slides map · 960×968' },
}

interface PageState {
  parentIndex: number
  subIndex: number
  include: boolean
  heading: string
  subheading: string
  paragraphs: string
  chartOverrideId: string
  hideChart: boolean
  hideMap: boolean
  /** Per-page camera override. Null = use the section default. */
  mapView: MapView | null
  /** Per-page pin patches (label position, color, etc.). Empty = no patches. */
  pinOverrides: PinOverride[]
}

type PagesByFormat = Record<Format, PageState[]>

function unitKey(u: { parentIndex: number; subIndex: number }): string {
  return `${u.parentIndex}.${u.subIndex}`
}

function buildPageStatesFor(
  units: BuilderUnit[],
  pages: ReportPageOverride[]
): PageState[] {
  const overrides = new Map<string, ReportPageOverride>()
  for (const p of pages) {
    overrides.set(`${p.parentIndex}.${p.subIndex}`, p)
  }
  return units.map((u) => {
    const ov = overrides.get(unitKey(u))
    const mo = ov?.mapOverride
    const mapView: MapView | null =
      mo && mo.center && typeof mo.zoom === 'number'
        ? {
            center: mo.center,
            zoom: mo.zoom,
            pitch: mo.pitch ?? 0,
            bearing: mo.bearing ?? 0,
          }
        : null
    return {
      parentIndex: u.parentIndex,
      subIndex: u.subIndex,
      include: ov?.include !== false,
      heading: ov?.heading ?? '',
      subheading: ov?.subheading ?? '',
      paragraphs: (ov?.paragraphs ?? []).join('\n\n'),
      chartOverrideId: ov?.chartOverride?.id ?? '',
      hideChart: ov?.hideChart === true,
      hideMap: ov?.hideMap === true,
      mapView,
      pinOverrides: mo?.pinOverrides ?? [],
    }
  })
}

function buildInitialState(
  units: BuilderUnit[],
  initialYaml: string | null
): PagesByFormat {
  const all = parseStoryOverrides(initialYaml)
  return {
    report: buildPageStatesFor(units, all.report.pages),
    slides: buildPageStatesFor(units, all.slides.pages),
  }
}

/** Round-trip helper: build a minimal `map:` YAML block so we can hand it to
 *  MapPickerModal (which speaks YAML). The modal hands back a patched YAML
 *  blob that we parse back into a MapView. */
function viewToFakeSectionRaw(view: MapView): string {
  return [
    'map:',
    `  center: [${view.center[0]}, ${view.center[1]}]`,
    `  zoom: ${view.zoom}`,
    `  pitch: ${view.pitch}`,
    `  bearing: ${view.bearing}`,
  ].join('\n')
}

/** Combined map-override payload edited through the YAML textarea. Camera
 *  fields are required (so the textarea always seeds with a valid view);
 *  `pinOverrides` is empty when the user hasn't patched any pins. */
interface MapEditPayload {
  view: MapView
  pinOverrides: PinOverride[]
}

/** Serialize the camera + pin patches to the flat YAML shape used in the
 *  per-page YAML textarea (no enclosing `mapOverride:` key — just the
 *  fields). */
function payloadToYaml(p: MapEditPayload): string {
  const lines = [
    `center: [${round(p.view.center[0], 4)}, ${round(p.view.center[1], 4)}]`,
    `zoom: ${round(p.view.zoom, 2)}`,
    `pitch: ${round(p.view.pitch, 1)}`,
    `bearing: ${round(p.view.bearing, 1)}`,
  ]
  if (p.pinOverrides.length > 0) {
    lines.push('pinOverrides:')
    for (const pin of p.pinOverrides) {
      lines.push(
        `  - coordinates: [${round(pin.coordinates[0], 6)}, ${round(pin.coordinates[1], 6)}]`
      )
      if (pin.label !== undefined) lines.push(`    label: ${JSON.stringify(pin.label)}`)
      if (pin.labelAnchor !== undefined) lines.push(`    labelAnchor: ${pin.labelAnchor}`)
      if (pin.color !== undefined) lines.push(`    color: ${JSON.stringify(pin.color)}`)
      if (pin.radius !== undefined) lines.push(`    radius: ${pin.radius}`)
      if (pin.pulse !== undefined) lines.push(`    pulse: ${pin.pulse}`)
    }
  }
  return lines.join('\n')
}

const VALID_PIN_ANCHORS: ReadonlySet<NonNullable<PinOverride['labelAnchor']>> = new Set([
  'top',
  'bottom',
  'left',
  'right',
])

function parsePinOverridesFromYaml(raw: unknown): PinOverride[] | null {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) return null
  const out: PinOverride[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null
    const e = entry as Record<string, unknown>
    const c = e.coordinates
    if (!Array.isArray(c) || c.length !== 2) return null
    const lng = Number(c[0])
    const lat = Number(c[1])
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
    const patch: PinOverride = { coordinates: [lng, lat] }
    if (e.label !== undefined) {
      if (typeof e.label !== 'string') return null
      patch.label = e.label
    }
    if (e.labelAnchor !== undefined) {
      if (
        typeof e.labelAnchor !== 'string' ||
        !VALID_PIN_ANCHORS.has(e.labelAnchor as NonNullable<PinOverride['labelAnchor']>)
      ) {
        return null
      }
      patch.labelAnchor = e.labelAnchor as PinOverride['labelAnchor']
    }
    if (e.color !== undefined) {
      if (typeof e.color !== 'string') return null
      patch.color = e.color
    }
    if (e.radius !== undefined) {
      const n = Number(e.radius)
      if (!Number.isFinite(n)) return null
      patch.radius = n
    }
    if (e.pulse !== undefined) {
      if (typeof e.pulse !== 'boolean') return null
      patch.pulse = e.pulse
    }
    out.push(patch)
  }
  return out
}

/** Parse the flat YAML shape produced by payloadToYaml back into the payload.
 *  Returns null on any structural mismatch so the caller can show an error. */
function yamlToPayload(text: string): MapEditPayload | null {
  let raw: unknown
  try {
    raw = parseYaml(text)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const c = o.center
  if (!Array.isArray(c) || c.length !== 2) return null
  const lng = Number(c[0])
  const lat = Number(c[1])
  const zoom = Number(o.zoom)
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(zoom)) {
    return null
  }
  const pitch = Number.isFinite(Number(o.pitch)) ? Number(o.pitch) : 0
  const bearing = Number.isFinite(Number(o.bearing)) ? Number(o.bearing) : 0
  const pinOverrides = parsePinOverridesFromYaml(o.pinOverrides)
  if (pinOverrides === null) return null
  return { view: { center: [lng, lat], zoom, pitch, bearing }, pinOverrides }
}

function pagesForFormat(states: PageState[]): ReportPageOverride[] {
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
    if (s.hideChart) {
      entry.hideChart = true
      dirty = true
    }
    if (s.hideMap) {
      entry.hideMap = true
      dirty = true
    }
    if (s.chartOverrideId.trim()) {
      entry.chartOverride = { id: s.chartOverrideId.trim() }
      dirty = true
    }
    if (s.mapView) {
      entry.mapOverride = {
        center: [round(s.mapView.center[0], 4), round(s.mapView.center[1], 4)],
        zoom: round(s.mapView.zoom, 2),
        pitch: round(s.mapView.pitch, 1),
        bearing: round(s.mapView.bearing, 1),
      }
      dirty = true
    }
    if (s.pinOverrides.length > 0) {
      entry.mapOverride = {
        ...(entry.mapOverride ?? {}),
        pinOverrides: s.pinOverrides.map((p) => ({
          coordinates: [round(p.coordinates[0], 6), round(p.coordinates[1], 6)],
          ...(p.label !== undefined ? { label: p.label } : {}),
          ...(p.labelAnchor !== undefined ? { labelAnchor: p.labelAnchor } : {}),
          ...(p.color !== undefined ? { color: p.color } : {}),
          ...(p.radius !== undefined ? { radius: p.radius } : {}),
          ...(p.pulse !== undefined ? { pulse: p.pulse } : {}),
        })),
      }
      dirty = true
    }
    if (dirty) pages.push(entry)
  }
  return pages
}

function pagesToYamlNode(pages: ReportPageOverride[]) {
  return {
    pages: pages.map((p) => ({
      unit: { parentIndex: p.parentIndex, subIndex: p.subIndex },
      ...(p.include === false && { include: false }),
      ...(p.hideChart && { hideChart: true }),
      ...(p.hideMap && { hideMap: true }),
      ...(p.heading && { heading: p.heading }),
      ...(p.subheading && { subheading: p.subheading }),
      ...(p.paragraphs && { paragraphs: p.paragraphs }),
      ...(p.chartOverride && { chartOverride: p.chartOverride }),
      ...(p.mapOverride && { mapOverride: p.mapOverride }),
    })),
  }
}

function serializeToYaml(byFormat: PagesByFormat): string {
  const reportPages = pagesForFormat(byFormat.report)
  const slidesPages = pagesForFormat(byFormat.slides)
  if (reportPages.length === 0 && slidesPages.length === 0) return ''
  const doc: Record<string, unknown> = {}
  if (reportPages.length > 0) doc.report = pagesToYamlNode(reportPages)
  if (slidesPages.length > 0) doc.slides = pagesToYamlNode(slidesPages)
  return stringifyYaml(doc)
}

function round(n: number, places: number): number {
  const p = Math.pow(10, places)
  return Math.round(n * p) / p
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
  const [pagesByFormat, setPagesByFormat] = useState<PagesByFormat>(() =>
    buildInitialState(units, initialYaml)
  )
  const pages = pagesByFormat[format]
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

  const draftYaml = useMemo(() => serializeToYaml(pagesByFormat), [pagesByFormat])
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

  const update = useCallback(
    (idx: number, patch: Partial<PageState>) => {
      setPagesByFormat((prev) => {
        const list = prev[format].slice()
        list[idx] = { ...list[idx], ...patch }
        return { ...prev, [format]: list }
      })
    },
    [format]
  )

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

  const previewSrc = `/story/${slug}/${format}?embed=1`
  const overrideCount = useMemo(
    () =>
      pages.filter(
        (p) =>
          !p.include ||
          p.hideChart ||
          p.hideMap ||
          p.heading.trim() ||
          p.subheading.trim() ||
          p.paragraphs.trim() ||
          p.chartOverrideId.trim() ||
          p.mapView != null ||
          p.pinOverrides.length > 0
      ).length,
    [pages]
  )

  const [mapEditIdx, setMapEditIdx] = useState<number | null>(null)

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
          onEditMap={() => setMapEditIdx(i)}
        />
      ))}
    </>
  )

  const mapEditUnit = mapEditIdx !== null ? units[mapEditIdx] : null
  const mapEditPage = mapEditIdx !== null ? pages[mapEditIdx] : null
  const mapEditCurrent: MapView | null =
    mapEditPage?.mapView ?? mapEditUnit?.parentMap ?? null

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

      {mapEditIdx !== null && mapEditUnit && mapEditCurrent && (
        <MapPickerModal
          sectionRaw={viewToFakeSectionRaw(mapEditCurrent)}
          sectionLabel={
            mapEditUnit.eyebrow
              ? `§${mapEditUnit.parentIndex}.${mapEditUnit.subIndex} · ${mapEditUnit.eyebrow} · ${format}`
              : `§${mapEditUnit.parentIndex}.${mapEditUnit.subIndex} · ${format}`
          }
          hideMobileTarget
          frame={MAP_FRAME_BY_FORMAT[format]}
          onApply={(nextRaw) => {
            const next = extractMapView(nextRaw)
            if (next && mapEditIdx !== null) {
              update(mapEditIdx, { mapView: next })
            }
            setMapEditIdx(null)
          }}
          onClose={() => setMapEditIdx(null)}
        />
      )}
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
  onEditMap,
}: {
  page: PageState
  unit: BuilderUnit
  chartIds: string[]
  onChange: (patch: Partial<PageState>) => void
  onEditMap: () => void
}) {
  const hasMap = unit.parentMap !== null
  const hasChart = !!unit.chartId
  const overrideView = page.mapView
  const effectiveView = overrideView ?? unit.parentMap
  const [yamlOpen, setYamlOpen] = useState(false)
  const effectivePayload: MapEditPayload | null = effectiveView
    ? { view: effectiveView, pinOverrides: page.pinOverrides }
    : null
  const [yamlDraft, setYamlDraft] = useState<string>(() =>
    effectivePayload ? payloadToYaml(effectivePayload) : ''
  )
  const [yamlError, setYamlError] = useState<string | null>(null)
  // Keep the textarea in sync when the source view changes (e.g. modal apply
  // or reset) — but only when the user isn't actively editing.
  useEffect(() => {
    if (!yamlOpen) {
      setYamlDraft(effectivePayload ? payloadToYaml(effectivePayload) : '')
      setYamlError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    overrideView?.center[0],
    overrideView?.center[1],
    overrideView?.zoom,
    overrideView?.pitch,
    overrideView?.bearing,
    unit.parentMap?.center[0],
    unit.parentMap?.center[1],
    unit.parentMap?.zoom,
    unit.parentMap?.pitch,
    unit.parentMap?.bearing,
    page.pinOverrides.length,
    yamlOpen,
  ])
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
      {(hasChart || hasMap) && (
        <div className="flex items-center gap-4">
          {hasChart && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={page.hideChart}
                onChange={(e) => onChange({ hideChart: e.target.checked })}
              />
              <span className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-wider">
                Hide chart
              </span>
            </label>
          )}
          {hasMap && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={page.hideMap}
                onChange={(e) => onChange({ hideMap: e.target.checked })}
              />
              <span className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-wider">
                Hide map
              </span>
            </label>
          )}
        </div>
      )}
      {chartIds.length > 0 && !page.hideChart && (
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
      {hasMap && !page.hideMap && (
        <>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onEditMap}
              className="flex-1 px-2 py-1.5 rounded text-[0.75rem] font-[family-name:var(--font-mono)] uppercase tracking-wider border"
              style={{
                borderColor: 'var(--color-surface)',
                background: 'transparent',
                color: 'var(--color-text)',
              }}
            >
              {overrideView ? 'Edit map override' : 'Edit map'}
            </button>
            <button
              type="button"
              onClick={() => setYamlOpen((v) => !v)}
              aria-expanded={yamlOpen}
              aria-label="Edit map YAML"
              className="px-2 py-1.5 rounded text-[0.7rem] font-[family-name:var(--font-mono)] uppercase tracking-wider border"
              style={{
                borderColor: 'var(--color-surface)',
                background: yamlOpen ? 'var(--color-surface)' : 'transparent',
                color: 'var(--color-text)',
                opacity: 0.8,
              }}
            >
              YAML
            </button>
            {overrideView && (
              <button
                type="button"
                onClick={() => onChange({ mapView: null })}
                title="Reset to section default"
                aria-label="Reset map override"
                className="px-2 py-1.5 rounded text-[0.7rem] border opacity-60 hover:opacity-100"
                style={{
                  borderColor: 'var(--color-surface)',
                  background: 'transparent',
                  color: 'var(--color-text)',
                }}
              >
                Reset
              </button>
            )}
          </div>
          {yamlOpen && (
            <div className="space-y-1">
              <textarea
                value={yamlDraft}
                onChange={(e) => {
                  const text = e.target.value
                  setYamlDraft(text)
                  const next = yamlToPayload(text)
                  if (next) {
                    setYamlError(null)
                    onChange({
                      mapView: next.view,
                      pinOverrides: next.pinOverrides,
                    })
                  } else {
                    setYamlError(
                      'Invalid YAML — needs center, zoom (numbers); pinOverrides[] entries need coordinates.'
                    )
                  }
                }}
                spellCheck={false}
                rows={6}
                className="w-full px-2 py-1.5 rounded text-[0.75rem] border font-[family-name:var(--font-mono)] resize-vertical"
                style={{
                  borderColor: yamlError
                    ? 'var(--color-warn, #ff6b6b)'
                    : 'var(--color-surface)',
                  background: 'transparent',
                  color: 'var(--color-text)',
                }}
                placeholder={[
                  'center: [lng, lat]',
                  'zoom: 0',
                  'pitch: 0',
                  'bearing: 0',
                  'pinOverrides:',
                  '  - coordinates: [lng, lat]',
                  '    labelAnchor: right',
                ].join('\n')}
              />
              {unit.parentPins.length > 0 && (
                <details className="text-[0.7rem] opacity-70">
                  <summary
                    className="cursor-pointer font-[family-name:var(--font-mono)] uppercase tracking-wider"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    {unit.parentPins.length} pin
                    {unit.parentPins.length === 1 ? '' : 's'} — coords reference
                  </summary>
                  <ul className="mt-1 space-y-0.5 font-[family-name:var(--font-mono)]">
                    {unit.parentPins.map((p, i) => (
                      <li key={i} style={{ color: 'var(--color-muted)' }}>
                        [{round(p.coordinates[0], 4)}, {round(p.coordinates[1], 4)}]
                        {p.label ? ` — ${p.label}` : ''}
                        {p.labelAnchor ? ` · ${p.labelAnchor}` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {yamlError && (
                <div
                  className="text-[0.7rem] font-[family-name:var(--font-mono)]"
                  style={{ color: 'var(--color-warn, #ff6b6b)' }}
                >
                  {yamlError}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
