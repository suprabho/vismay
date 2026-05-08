'use client'

import { useMemo } from 'react'
import type { ResolvedUnit, StoryConfig } from '@/lib/storyConfig.types'
import ChartPanel from '@/components/story/ChartPanel'
import PdfMapBg from './PdfMapBg'
import Image from 'next/image'
import { usePdfReadiness } from '@/lib/pdfReadiness'

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

  return (
    <div
      data-pdf-shell="report"
      style={{
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {!print && (
        <div
          className="fixed top-2 right-2 z-50 px-3 py-1 rounded font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-wider"
          style={{ background: 'var(--color-surface)', color: 'var(--color-muted)' }}
        >
          Report preview · add ?print=1 to hide chrome
        </div>
      )}

      {/* Cover */}
      <section
        className="relative overflow-hidden"
        style={{
          width: '8.5in',
          height: '11in',
          breakAfter: 'page',
          breakInside: 'avoid',
          background: 'var(--color-bg)',
          padding: '1in',
        }}
      >
        <div className="h-full flex flex-col justify-between">
          <div>
            {logo && (
              <Image
                src={logo}
                alt=""
                width={200}
                height={48}
                unoptimized
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

      {/* Section pages */}
      {groups.map((group, gi) => {
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
              width: '8.5in',
              minHeight: '11in',
              breakBefore: 'page',
              padding: '0.6in 0.6in 0.5in',
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
              className="absolute bottom-3 left-0 right-0 flex justify-between px-[0.6in] font-[family-name:var(--font-mono)] uppercase"
              style={{ fontSize: '8pt', letterSpacing: '0.15em', color: 'var(--color-muted)' }}
            >
              <span>{slug}</span>
              <span>{gi + 1} / {groups.length}</span>
            </footer>
          </section>
        )
      })}
    </div>
  )
}
