'use client'

import { useMemo, type ReactNode } from 'react'
import type { ResolvedUnit, StoryConfig } from '@/lib/storyConfig.types'
import ChartPanel from '@/components/story/ChartPanel'
import PdfMapBg from './PdfMapBg'
import PreviewFlowFrame from './PreviewFlowFrame'
import { usePdfReadiness } from '@/lib/pdfReadiness'

// A4 @ 96 dpi: 210mm × 297mm → 794 × 1123 px. Mirrors the `format: 'A4'`
// passed to Playwright's `page.pdf()` so the preview matches print exactly.
const PAGE_W = 794
const PAGE_H = 1123

interface Props {
  slug: string
  title: string
  units: ResolvedUnit[]
  config: StoryConfig
  accessToken: string
  logo?: string
  print?: boolean
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
}

interface SectionGroup {
  parentIndex: number
  units: ResolvedUnit[]
}

function groupByParent(units: ResolvedUnit[]): SectionGroup[] {
  const groups: SectionGroup[] = []
  let current: SectionGroup | null = null
  for (const unit of units) {
    if (!current || current.parentIndex !== unit.parentIndex) {
      current = { parentIndex: unit.parentIndex, units: [] }
      groups.push(current)
    }
    current.units.push(unit)
  }
  return groups
}

/**
 * Letter-size portrait booklet. One section group per page (with `break-before:
 * page`); content flows and may continue onto a second page if it overflows.
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
  accessToken,
  logo,
  print = false,
}: Props) {
  const groups = useMemo(() => groupByParent(units), [units])
  const expectedMaps = useMemo(
    () => groups.filter((g) => !!g.units[0]?.parentConfig.map?.center).length,
    [groups]
  )
  const { noteMapReady } = usePdfReadiness(expectedMaps)

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
          <div
            className="font-[family-name:var(--font-mono)] uppercase"
            style={{ fontSize: '10pt', letterSpacing: '0.15em', color: 'var(--color-muted)' }}
          >
            {slug}
          </div>
        </div>
      </section>
  )

  const renderSectionPage = (
    group: SectionGroup,
    gi: number,
    options: { breakBefore: boolean }
  ): ReactNode => {
    const first = group.units[0]
    const map = first.parentConfig.map
    const center = map?.center as [number, number] | undefined
    const zoom = map?.zoom
    const pitch = map?.pitch
    const bearing = map?.bearing
    const pins = map?.pins
    const regions = map?.regions
    const heatmap = map?.heatmap
    const showMap = !!center && typeof zoom === 'number'
    const eyebrow = first.parentConfig.eyebrow
    const sectionHeading = first.heading
    const sectionSubheading = first.subheading

    return (
      <section
        key={gi}
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
              {sectionHeading && (
                <h2
                  className="font-serif font-bold mb-2"
                  style={{ fontSize: '22pt', lineHeight: 1.15, color: 'var(--color-text)' }}
                >
                  {sectionHeading}
                </h2>
              )}
              {sectionSubheading && (
                <p
                  style={{ fontSize: '12pt', lineHeight: 1.4, color: 'var(--color-muted)' }}
                >
                  {sectionSubheading}
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

            <div className="flex flex-col gap-5">
              {group.units.map((unit, ui) => {
                const isFirst = ui === 0
                const showSubheadingHere = !isFirst && unit.subheading
                const showHeadingHere = !isFirst && unit.heading
                const chartId = unit.parentConfig.chart
                return (
                  <div key={ui} style={{ breakInside: 'avoid' }}>
                    {showHeadingHere && (
                      <h3
                        className="font-serif font-bold mb-1"
                        style={{ fontSize: '14pt', lineHeight: 1.2, color: 'var(--color-text)' }}
                      >
                        {unit.heading}
                      </h3>
                    )}
                    {showSubheadingHere && (
                      <p
                        className="mb-2"
                        style={{ fontSize: '11pt', lineHeight: 1.4, color: 'var(--color-muted)' }}
                      >
                        {unit.subheading}
                      </p>
                    )}
                    {unit.paragraphs.map((p, j) => (
                      <p
                        key={j}
                        className="mb-2"
                        style={{ fontSize: '11pt', lineHeight: 1.5, color: 'var(--color-text)' }}
                      >
                        {stripMarkdown(p)}
                      </p>
                    ))}
                    {chartId && (
                      <div
                        className="my-3"
                        style={{ width: '100%', height: '2.8in', breakInside: 'avoid' }}
                      >
                        <ChartPanel chartId={chartId} activeStep={unit.subIndex} slug={slug} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

        <footer
          className="absolute bottom-3 left-0 right-0 flex justify-between px-[56px] font-[family-name:var(--font-mono)] uppercase"
          style={{ fontSize: '8pt', letterSpacing: '0.15em', color: 'var(--color-muted)' }}
        >
          <span>{slug}</span>
          <span>{gi + 1} / {groups.length}</span>
        </footer>
      </section>
    )
  }

  // Print path: native-size pages with break-before: page between groups.
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
        {groups.map((group, gi) =>
          renderSectionPage(group, gi, { breakBefore: true })
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
      <PreviewFlowFrame
        nativeWidth={PAGE_W}
        minNativeHeight={PAGE_H}
        maxWidth={`min(95vw, ${PAGE_W}px)`}
      >
        {renderCover()}
      </PreviewFlowFrame>
      {groups.map((group, gi) => (
        <PreviewFlowFrame
          key={gi}
          nativeWidth={PAGE_W}
          minNativeHeight={PAGE_H}
          maxWidth={`min(95vw, ${PAGE_W}px)`}
        >
          {renderSectionPage(group, gi, { breakBefore: false })}
        </PreviewFlowFrame>
      ))}
    </div>
  )
}
