'use client'

import { useMemo, type ReactNode } from 'react'
import type { ResolvedUnit, StoryConfig } from '@/lib/storyConfig.types'
import ForegroundVizSlot from '@/components/story/viz/ForegroundVizSlot'
import { resolveSlots } from '@/lib/resolveSlots'
import PdfMapBg from './PdfMapBg'
import PreviewFrame from './PreviewFrame'
import { useStoryReadiness } from '@/lib/storyReadiness'
import {
  getReportMapOverride,
  getReportPins,
  isReportMapHidden,
} from '@/lib/storyReportConfig'

const SLIDE_W = 1920
const SLIDE_H = 1080

interface Props {
  slug: string
  title: string
  units: ResolvedUnit[]
  config: StoryConfig
  accessToken: string
  logo?: string
  /** When true, hides any non-print chrome (debug overlays, etc.). */
  print?: boolean
  /** When true, hides the preview-chrome banner (used when embedded in /reports). */
  embed?: boolean
}

/** Strip basic markdown bold/italic markers for plain-text layout. */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
}

/**
 * 16:9 slide deck — one unit per 1920×1080 slide. Map left, copy + chart right.
 * Each slide is a fixed-size flex frame; CSS `break-after: page` produces
 * one PDF page per slide when Playwright's page.pdf() rasterizes the document.
 */
export default function SlidesShell({
  slug,
  title,
  units,
  config,
  accessToken,
  logo,
  print = false,
  embed = false,
}: Props) {
  const slides = useMemo(() => {
    return units.map((unit) => {
      const map = unit.parentConfig.map
      const subMap = unit.parentConfig.subsections?.[unit.subIndex]?.map
      // Per-page report override beats subsection beats parent — so editing
      // the camera in /reports always wins, even when the source story has a
      // subsection map block for the same unit.
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
      return { unit, center, zoom, pitch, bearing, pins, regions, heatmap }
    })
  }, [units])

  // Count each capture-blocking element: every visible map + every foreground
  // viz layer (chart / image / video / rive / embed). The slot's
  // `noteLayerReady` fires once per layer when its first paintable state lands.
  const expectedSignals = useMemo(() => {
    let total = 0
    for (const s of slides) {
      if (
        !!s.center &&
        typeof s.zoom === 'number' &&
        !isReportMapHidden(s.unit.parentConfig)
      ) {
        total++
      }
      total += resolveSlots(s.unit.parentConfig).foreground.length
    }
    return total
  }, [slides])
  const { noteReady } = useStoryReadiness(expectedSignals)
  // Keep the legacy alias so the JSX below doesn't have to thread a renamed prop.
  const noteMapReady = noteReady

  const renderSlideContent = (
    {
      unit,
      center,
      zoom,
      pitch,
      bearing,
      pins,
      regions,
      heatmap,
    }: (typeof slides)[number],
    i: number
  ): ReactNode => {
    const heading = unit.heading
    const subheading = unit.subheading
    const chartId = unit.parentConfig.chart
    const foregroundLayers = resolveSlots(unit.parentConfig).foreground
    const showMap =
      !!center && typeof zoom === 'number' && !isReportMapHidden(unit.parentConfig)
    return (
      <>
        <header
          className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-12"
          style={{
            height: '64px',
            borderBottom: '1px solid var(--color-line)',
            background: 'rgb(var(--color-bg-rgb) / 0.85)',
          }}
        >
          <div
            className="font-[family-name:var(--font-mono)] uppercase tracking-[0.2em]"
            style={{ fontSize: '13px', color: 'var(--color-muted)' }}
          >
            {title}
          </div>
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt=""
              style={{ height: '28px', width: 'auto', opacity: 0.9 }}
            />
          )}
        </header>

        <div
          className="absolute inset-0 flex"
          style={{ paddingTop: '64px', paddingBottom: '48px' }}
        >
          <div className="relative h-full" style={{ width: '50%' }}>
            {showMap && (
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
            )}
          </div>

          <div
            className="relative h-full flex flex-col"
            style={{ width: '50%', padding: '64px 80px' }}
          >
            {unit.parentConfig.eyebrow && (
              <div
                className="font-[family-name:var(--font-mono)] uppercase tracking-[0.18em] mb-4"
                style={{ fontSize: '14px', color: 'var(--color-accent)' }}
              >
                {unit.parentConfig.eyebrow}
              </div>
            )}
            {heading && (
              <h2
                className="font-serif font-bold mb-3"
                style={{
                  fontSize: '52px',
                  lineHeight: 1.1,
                  color: 'var(--color-text)',
                }}
              >
                {heading}
              </h2>
            )}
            {subheading && (
              <p
                className="mb-6"
                style={{
                  fontSize: '22px',
                  lineHeight: 1.4,
                  color: 'var(--color-muted)',
                }}
              >
                {subheading}
              </p>
            )}
            <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
              {unit.paragraphs.map((p, j) => (
                <p
                  key={j}
                  style={{
                    fontSize: '20px',
                    lineHeight: 1.55,
                    color: 'var(--color-text)',
                  }}
                >
                  {stripMarkdown(p)}
                </p>
              ))}
              {(chartId || foregroundLayers.length > 0) && (
                <div className="relative flex-1 min-h-[240px] mt-4">
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
          </div>
        </div>

        <footer
          className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-12"
          style={{
            height: '48px',
            borderTop: '1px solid var(--color-line)',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--color-muted)',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}
        >
          <span>{slug}</span>
          <span>
            {i + 1} / {slides.length}
          </span>
        </footer>
      </>
    )
  }

  // Print path: flat 1920×1080 sections with page-break, no chrome, no scale.
  if (print) {
    return (
      <div
        data-pdf-shell="slides"
        style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}
      >
        {/* `preferCSSPageSize: true` in page.pdf() honors this; without it
            Chromium falls back to default Letter portrait and ignores the
            explicit width/height passed to page.pdf(). */}
        <style>{`@page { size: ${SLIDE_W}px ${SLIDE_H}px; margin: 0; }`}</style>
        {slides.map((slide, i) => (
          <section
            key={i}
            className="relative overflow-hidden"
            style={{
              width: `${SLIDE_W}px`,
              height: `${SLIDE_H}px`,
              breakAfter: 'page',
              breakInside: 'avoid',
              background: 'var(--color-bg)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {renderSlideContent(slide, i)}
          </section>
        ))}
      </div>
    )
  }

  // Preview path: each slide is a fit-scaled framed card. Stack vertically on
  // desktop; on mobile the `min(95vw, …)` width clamp falls back to 95vw and
  // the aspect-ratio drives height.
  return (
    <div
      data-pdf-shell="slides"
      style={{
        background: 'var(--color-surface)',
        color: 'var(--color-text)',
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
          <span>Slides preview</span>
          <a
            href={`/reports/${slug}`}
            style={{ color: 'var(--color-accent)' }}
            className="hover:underline"
          >
            Edit overrides →
          </a>
        </div>
      )}
      {slides.map((slide, i) => (
        <PreviewFrame
          key={i}
          nativeWidth={SLIDE_W}
          nativeHeight={SLIDE_H}
        >
          <section
            className="relative overflow-hidden"
            style={{
              width: `${SLIDE_W}px`,
              height: `${SLIDE_H}px`,
              background: 'var(--color-bg)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {renderSlideContent(slide, i)}
          </section>
        </PreviewFrame>
      ))}
    </div>
  )
}
