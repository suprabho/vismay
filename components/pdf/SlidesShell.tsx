'use client'

import { useMemo, type ReactNode } from 'react'
import type { ResolvedUnit, StoryConfig } from '@/lib/storyConfig.types'
import ChartPanel from '@/components/story/ChartPanel'
import PdfMapBg from './PdfMapBg'
import PreviewFrame from './PreviewFrame'
import { usePdfReadiness } from '@/lib/pdfReadiness'

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
}: Props) {
  const slides = useMemo(() => {
    return units.map((unit) => {
      const map = unit.parentConfig.map
      const subMap = unit.parentConfig.subsections?.[unit.subIndex]?.map
      const center = (subMap?.center ?? map?.center) as [number, number] | undefined
      const zoom = subMap?.zoom ?? map?.zoom
      const pitch = subMap?.pitch ?? map?.pitch
      const bearing = subMap?.bearing ?? map?.bearing
      const pins = subMap?.pins ?? map?.pins
      const regions = subMap?.regions ?? map?.regions
      const heatmap = subMap?.heatmap ?? map?.heatmap
      return { unit, center, zoom, pitch, bearing, pins, regions, heatmap }
    })
  }, [units])

  const expectedMaps = useMemo(
    () => slides.filter((s) => !!s.center && typeof s.zoom === 'number').length,
    [slides]
  )
  const { noteMapReady } = usePdfReadiness(expectedMaps)

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
    const showMap = !!center && typeof zoom === 'number'
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
              {chartId && (
                <div className="flex-1 min-h-[240px] mt-4">
                  <ChartPanel chartId={chartId} activeStep={unit.subIndex} slug={slug} />
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
      {slides.map((slide, i) => (
        <PreviewFrame
          key={i}
          nativeWidth={SLIDE_W}
          nativeHeight={SLIDE_H}
          maxHeight="calc(100vh - 96px)"
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
