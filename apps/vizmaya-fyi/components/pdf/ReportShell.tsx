'use client'

import { useMemo, type ReactNode } from 'react'
import type { ResolvedUnit, StoryConfig } from '@vismay/viz-engine'
import { ForegroundVizSlot, ForegroundLayoutSlot } from '@vismay/viz-engine'
import { resolveSlotsFlat, resolveSlots, getVizModule } from '@vismay/viz-engine'
import type { StoryFormat } from '@vismay/viz-engine'
import PdfMapBg from './PdfMapBg'
import PreviewFlowFrame from './PreviewFlowFrame'
import { useStoryReadiness } from '@vismay/viz-engine'
import {
  getReportMapOverride,
  getReportPins,
  isReportMapHidden,
} from '@/lib/storyReportConfig'

// A4 @ 96 dpi: 210mm × 297mm → 794 × 1123 px. Mirrors the `format: 'A4'`
// passed to Playwright's `page.pdf()` so the preview matches print exactly.
const PAGE_W = 794
const PAGE_H = 1123

interface Props {
  slug: string
  title: string
  units: ResolvedUnit[]
  config: StoryConfig
  /**
   * Story format. Map stories get the legacy heading + paragraphs + map +
   * chart booklet layout. Deck stories get one full-page slide per unit,
   * with the section's composed foreground (layouts, slot positions)
   * preserved via `ForegroundLayoutSlot`.
   */
  format?: StoryFormat
  /** Frontmatter aura slug — reserved for future per-page backdrop. */
  aura?: string
  accessToken: string
  logo?: string
  print?: boolean
  /** When true, hides the preview-chrome banner (used when embedded in /reports). */
  embed?: boolean
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
}

function extractByline(units: ResolvedUnit[]): string {
  const hero = units.find((u) => (u.parentConfig.kind ?? 'text') === 'hero') ?? units[0]
  if (!hero) return ''
  const bylineParagraph = hero.paragraphs.find((p) => p.startsWith('**'))
  return bylineParagraph?.replace(/^\*+|\*+$/g, '').trim() ?? ''
}

/**
 * Letter-size portrait booklet. One unit per page (with `break-before: page`),
 * so every subsection lands on its own page instead of stacking under its
 * parent. Each subsection page renders the map resolved at that unit's level
 * — per-page `/reports` override beats subsection `map:` block beats parent
 * `map:` — plus the subsection's heading, paragraphs, and chart. Mirrors the
 * SlidesShell precedence so the same `/reports` edit applies to both formats.
 *
 * @page rules sit in the route's <style> tag — they need to apply to the
 * print stylesheet of the document, which Playwright's page.pdf() honors when
 * `preferCSSPageSize: true`.
 */
export default function ReportShell({
  slug,
  title,
  units,
  config,
  format = 'map',
  aura: _aura,
  accessToken,
  logo,
  print = false,
  embed = false,
}: Props) {
  const isDeck = format === 'deck'
  const byline = useMemo(() => extractByline(units), [units])
  // Sum capture-blocking signals: each visible map page + each foreground
  // viz layer (chart / image / video / rive / embed) WHOSE MODULE IS
  // REGISTERED. Unknown layer types render null in `ForegroundVizSlot`
  // without firing `noteReady`, so counting them would prevent
  // `__pdfReady__` from ever flipping true. Matches the unified readiness
  // model in `lib/storyReadiness.ts`.
  const expectedSignals = useMemo(() => {
    let total = 0
    for (const u of units) {
      const subMap = u.parentConfig.subsections?.[u.subIndex]?.map
      const ov = getReportMapOverride(u.parentConfig)
      const center = ov?.center ?? subMap?.center ?? u.parentConfig.map?.center
      const zoom = ov?.zoom ?? subMap?.zoom ?? u.parentConfig.map?.zoom
      if (!!center && typeof zoom === 'number' && !isReportMapHidden(u.parentConfig)) {
        total++
      }
      const layers = resolveSlotsFlat(u.parentConfig).foreground
      for (const layer of layers) {
        const mod = getVizModule(layer.type)
        if (mod && mod.slots.includes('foreground')) total++
      }
    }
    return total
  }, [units])
  const { noteReady } = useStoryReadiness(expectedSignals)
  const noteMapReady = noteReady

  const renderCover = (): ReactNode => (
    <section
      className="relative overflow-hidden"
      style={{
        width: `${PAGE_W}px`,
        height: `${PAGE_H}px`,
        breakAfter: 'page',
        breakInside: 'avoid',
        background: 'var(--color-bg)',
        padding: '96px',
      }}
    >
        <div className="h-full flex flex-col justify-between">
          <div>
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt=""
                style={{ height: '48px', width: 'auto' }}
              />
            )}
          </div>
          <div>
            <div
              className="font-[family-name:var(--font-mono)] uppercase mb-4"
              style={{ fontSize: '12pt', letterSpacing: '0.18em', color: 'var(--color-accent)' }}
            >
              Report
            </div>
            <h1
              className="font-serif font-bold"
              style={{ fontSize: '36pt', lineHeight: 1.1, color: 'var(--color-text)' }}
            >
              {title}
            </h1>
          </div>
          {byline && (
            <div
              className="font-[family-name:var(--font-mono)] uppercase"
              style={{ fontSize: '10pt', letterSpacing: '0.15em', color: 'var(--color-muted)' }}
            >
              {byline}
            </div>
          )}
        </div>
      </section>
  )

  /**
   * Deck-format unit page. Renders one slide per page using the full canvas,
   * delegating to `ForegroundLayoutSlot` so deck layouts and slot positions
   * render identically to the live page.
   *
   * Hero/cover units overlay the section title in the bottom-left corner of
   * the page over the foreground (matching the live cover treatment).
   */
  const renderDeckPage = (
    unit: ResolvedUnit,
    ui: number,
    options: { breakBefore: boolean }
  ): ReactNode => {
    const resolved = resolveSlots(unit.parentConfig)
    const rawKind = unit.parentConfig.kind ?? 'text'
    const isHeroLike = rawKind === 'cover' || rawKind === 'hero'
    return (
      <section
        key={ui}
        className="relative overflow-hidden"
        style={{
          width: `${PAGE_W}px`,
          height: `${PAGE_H}px`,
          breakBefore: options.breakBefore ? 'page' : undefined,
          breakInside: 'avoid',
          background: 'var(--color-bg)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <div className="absolute inset-0">
          <ForegroundLayoutSlot
            slug={slug}
            foreground={resolved.foreground}
            unit={unit}
            activeStep={unit.subIndex}
            mode="print"
            noteLayerReady={noteReady}
          />
        </div>
        {isHeroLike && (
          <div
            className="absolute z-30 pointer-events-none flex flex-col gap-2"
            style={{ left: '40px', right: '40px', bottom: '56px' }}
          >
            {unit.parentConfig.eyebrow && (
              <div
                className="font-[family-name:var(--font-mono)] uppercase tracking-[0.18em]"
                style={{ fontSize: '11pt', color: 'var(--color-accent)' }}
              >
                {unit.parentConfig.eyebrow}
              </div>
            )}
            {unit.heading && (
              <h2
                className="font-serif font-bold"
                style={{
                  fontSize: '28pt',
                  lineHeight: 1.1,
                  color: 'var(--color-text)',
                  maxWidth: '72%',
                }}
              >
                {unit.heading}
              </h2>
            )}
          </div>
        )}
        <footer
          className="absolute bottom-2 left-0 right-0 flex justify-between px-[40px] font-[family-name:var(--font-mono)] uppercase pointer-events-none"
          style={{ fontSize: '8pt', letterSpacing: '0.15em', color: 'var(--color-muted)' }}
        >
          <span>{slug}</span>
          <span>{ui + 1} / {units.length}</span>
        </footer>
      </section>
    )
  }

  const renderUnitPage = (
    unit: ResolvedUnit,
    ui: number,
    options: { breakBefore: boolean }
  ): ReactNode => {
    const map = unit.parentConfig.map
    const subMap = unit.parentConfig.subsections?.[unit.subIndex]?.map
    // Per-page report override beats subsection beats parent — mirrors the
    // precedence used in SlidesShell so the same /reports edit applies to both
    // formats, and the source story's subsection `map:` blocks still flow
    // through when no override is set.
    const ov = getReportMapOverride(unit.parentConfig)
    const center = (ov?.center ?? subMap?.center ?? map?.center) as
      | [number, number]
      | undefined
    const zoom = ov?.zoom ?? subMap?.zoom ?? map?.zoom
    const pitch = ov?.pitch ?? subMap?.pitch ?? map?.pitch
    const bearing = ov?.bearing ?? subMap?.bearing ?? map?.bearing
    const pins = getReportPins(unit.parentConfig) ?? subMap?.pins ?? map?.pins
    const regions = subMap?.regions ?? map?.regions
    const heatmap = subMap?.heatmap ?? map?.heatmap
    const showMap =
      !!center && typeof zoom === 'number' && !isReportMapHidden(unit.parentConfig)
    const eyebrow = unit.parentConfig.eyebrow
    const heading = unit.heading
    const subheading = unit.subheading
    const chartId = unit.parentConfig.chart
    const foregroundLayers = resolveSlotsFlat(unit.parentConfig).foreground

    return (
      <section
        key={ui}
        className="relative"
        style={{
          width: `${PAGE_W}px`,
          minHeight: `${PAGE_H}px`,
          breakBefore: options.breakBefore ? 'page' : undefined,
          padding: '56px 56px 48px',
          background: 'var(--color-bg)',
        }}
      >
            <header className="mb-4">
              {eyebrow && (
                <div
                  className="font-[family-name:var(--font-mono)] uppercase mb-2"
                  style={{ fontSize: '9pt', letterSpacing: '0.18em', color: 'var(--color-accent)' }}
                >
                  {eyebrow}
                </div>
              )}
              {heading && (
                <h2
                  className="font-serif font-bold mb-2"
                  style={{ fontSize: '22pt', lineHeight: 1.15, color: 'var(--color-text)' }}
                >
                  {heading}
                </h2>
              )}
              {subheading && (
                <p
                  style={{ fontSize: '12pt', lineHeight: 1.4, color: 'var(--color-muted)' }}
                >
                  {subheading}
                </p>
              )}
            </header>

            {showMap && (
              <div
                className="relative mb-5"
                style={{ width: '100%', height: '3.5in', borderRadius: '4px', overflow: 'hidden' }}
              >
                <PdfMapBg
                  center={center!}
                  zoom={zoom!}
                  pitch={pitch}
                  bearing={bearing}
                  pins={pins}
                  regions={regions}
                  heatmap={heatmap}
                  accessToken={accessToken}
                  style={config.defaults.mapStyle}
                  palette={config.defaults.mapPalette}
                  fontstack={config.defaults.mapFontstack}
                  highlightCountry={config.defaults.highlightCountry}
                  highlightColor={config.defaults.highlightColor}
                  defaultOpacity={config.defaults.mapOpacity}
                  defaultPinColor={config.defaults.pinColor}
                  defaultPinRadius={config.defaults.pinRadius}
                  onReady={noteMapReady}
                  lazy={!print}
                />
              </div>
            )}

            <div className="flex flex-col gap-3">
              {unit.paragraphs.map((p, j) => (
                <p
                  key={j}
                  style={{ fontSize: '11pt', lineHeight: 1.5, color: 'var(--color-text)' }}
                >
                  {stripMarkdown(p)}
                </p>
              ))}
              {(chartId || foregroundLayers.length > 0) && (
                <div
                  className="relative mt-3"
                  style={{ width: '100%', height: '3.8in', overflow: 'hidden', breakInside: 'avoid' }}
                >
                  <ForegroundVizSlot
                    slug={slug}
                    layers={foregroundLayers}
                    unitKey={`${unit.parentIndex}-${unit.subIndex}`}
                    activeStep={unit.subIndex}
                    mode="print"
                    noteLayerReady={noteReady}
                  />
                </div>
              )}
            </div>

        <footer
          className="absolute bottom-3 left-0 right-0 flex justify-between px-[56px] font-[family-name:var(--font-mono)] uppercase"
          style={{ fontSize: '8pt', letterSpacing: '0.15em', color: 'var(--color-muted)' }}
        >
          <span>{slug}</span>
          <span>{ui + 1} / {units.length}</span>
        </footer>
      </section>
    )
  }

  // Print path: native-size pages with break-before: page between units.
  if (print) {
    return (
      <div
        data-pdf-shell="report"
        style={{
          background: 'var(--color-bg)',
          color: 'var(--color-text)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {/* `preferCSSPageSize: true` in page.pdf() honors this; without it
            Chromium falls back to default Letter portrait and ignores the
            `format: 'A4'` passed to page.pdf(). */}
        <style>{`@page { size: A4 portrait; margin: 0; }`}</style>
        {renderCover()}
        {units.map((unit, ui) =>
          isDeck
            ? renderDeckPage(unit, ui, { breakBefore: true })
            : renderUnitPage(unit, ui, { breakBefore: true })
        )}
      </div>
    )
  }

  // Preview path: each native page becomes a fit-scaled framed card stacked
  // vertically. The cover renders as one card and each section as another.
  return (
    <div
      data-pdf-shell="report"
      style={{
        background: 'var(--color-surface)',
        color: 'var(--color-text)',
        fontFamily: 'var(--font-sans)',
        minHeight: '100vh',
        paddingTop: '56px',
      }}
    >
      {!embed && (
        <div
          className="fixed top-3 right-3 z-50 flex items-center gap-3 px-3 py-1.5 rounded font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-wider"
          style={{
            background: 'var(--color-bg)',
            color: 'var(--color-muted)',
            border: '1px solid var(--color-line)',
          }}
        >
          <span>Report preview</span>
          <a
            href={`/reports/${slug}`}
            style={{ color: 'var(--color-accent)' }}
            className="hover:underline"
          >
            Edit overrides →
          </a>
        </div>
      )}
      <PreviewFlowFrame
        nativeWidth={PAGE_W}
        minNativeHeight={PAGE_H}
        maxWidth={`min(95vw, ${PAGE_W}px)`}
      >
        {renderCover()}
      </PreviewFlowFrame>
      {units.map((unit, ui) => (
        <PreviewFlowFrame
          key={ui}
          nativeWidth={PAGE_W}
          minNativeHeight={PAGE_H}
          maxWidth={`min(95vw, ${PAGE_W}px)`}
        >
          {isDeck
            ? renderDeckPage(unit, ui, { breakBefore: false })
            : renderUnitPage(unit, ui, { breakBefore: false })}
        </PreviewFlowFrame>
      ))}
    </div>
  )
}
