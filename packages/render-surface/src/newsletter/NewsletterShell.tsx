'use client'

import { useMemo } from 'react'
import type { ResolvedUnit, StoryConfig, StoryFormat } from '@vismay/viz-engine'
import {
  ForegroundVizSlot,
  ForegroundLayoutSlot,
  resolveSlots,
  resolveSlotsFlat,
  getVizModule,
  useStoryReadiness,
} from '@vismay/viz-engine'
import type { NewsletterBlock, NewsletterVisualRef } from '@vismay/content-source/storyNewsletterConfig'
import PdfMapBg from '../pdf/PdfMapBg'

/**
 * Headless capture stage for the newsletter render. Renders ONLY the visual
 * blocks (maps / charts / deck panels) of the selected units, each wrapped
 * in a `[data-newsletter-visual="<key>"]` marker sized for the email column
 * (1200px = 600px @2x). The render worker element-screenshots each marker;
 * the surrounding text never appears here — it flows straight into the HTML
 * template server-side.
 *
 * Readiness follows the ReportShell contract: every visible map fires one
 * signal, every REGISTERED foreground viz layer fires one, and the shared
 * coordinator flips `window.__pdfReady__` after the post-settle window.
 */

// 1200px column → 600 CSS px in the email at 2x density.
const BLOCK_W = 1200
const MAP_H = 675 // 16:9
const VIZ_H = 750
const PANEL_H = 900 // 4:3 slide panel

interface Props {
  slug: string
  blocks: NewsletterBlock[]
  config: StoryConfig
  format: StoryFormat
  accessToken: string
  /** When true, hides the dev-preview banner (set by the capture worker). */
  print?: boolean
}

function countRegisteredForeground(unit: ResolvedUnit): number {
  let total = 0
  for (const layer of resolveSlotsFlat(unit.parentConfig).foreground) {
    const mod = getVizModule(layer.type)
    if (mod && mod.slots.includes('foreground')) total++
  }
  return total
}

export default function NewsletterShell({
  slug,
  blocks,
  config,
  format: _format,
  accessToken,
  print = false,
}: Props) {
  // Sum capture-blocking signals across the rendered visuals only. Unknown
  // layer types render null in the slots without firing noteReady, so they
  // must not be counted — same rule as ReportShell.
  const expectedSignals = useMemo(() => {
    let total = 0
    for (const block of blocks) {
      for (const visual of block.visuals) {
        if (visual.kind === 'map') total += 1
        else total += countRegisteredForeground(block.unit)
      }
    }
    return total
  }, [blocks])
  const { noteReady } = useStoryReadiness(expectedSignals)

  const renderVisual = (block: NewsletterBlock, visual: NewsletterVisualRef) => {
    const unit = block.unit
    const section = unit.parentConfig

    if (visual.kind === 'map') {
      const map = section.map
      const subMap = section.subsections?.[unit.subIndex]?.map
      const center = (subMap?.center ?? map?.center) as [number, number] | undefined
      const zoom = subMap?.zoom ?? map?.zoom
      if (!center || typeof zoom !== 'number') return null
      return (
        <div
          key={visual.key}
          data-newsletter-visual={visual.key}
          style={{
            width: `${BLOCK_W}px`,
            height: `${MAP_H}px`,
            position: 'relative',
            overflow: 'hidden',
            background: 'var(--color-bg)',
          }}
        >
          <PdfMapBg
            center={center}
            zoom={zoom}
            pitch={subMap?.pitch ?? map?.pitch}
            bearing={subMap?.bearing ?? map?.bearing}
            pins={subMap?.pins ?? map?.pins}
            regions={subMap?.regions ?? map?.regions}
            heatmap={subMap?.heatmap ?? map?.heatmap}
            accessToken={accessToken}
            style={config.defaults.mapStyle}
            palette={config.defaults.mapPalette}
            fontstack={config.defaults.mapFontstack}
            highlightCountry={config.defaults.highlightCountry}
            highlightColor={config.defaults.highlightColor}
            defaultOpacity={config.defaults.mapOpacity}
            defaultPinColor={config.defaults.pinColor}
            defaultPinRadius={config.defaults.pinRadius}
            onReady={noteReady}
            lazy={false}
          />
        </div>
      )
    }

    if (visual.kind === 'panel') {
      const resolved = resolveSlots(section)
      return (
        <div
          key={visual.key}
          data-newsletter-visual={visual.key}
          style={{
            width: `${BLOCK_W}px`,
            height: `${PANEL_H}px`,
            position: 'relative',
            overflow: 'hidden',
            background: 'var(--color-bg)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <div style={{ position: 'absolute', inset: 0 }}>
            <ForegroundLayoutSlot
              slug={slug}
              foreground={resolved.foreground}
              unit={unit}
              activeStep={unit.subIndex}
              mode="print"
              noteLayerReady={noteReady}
            />
          </div>
        </div>
      )
    }

    // 'viz' — the section's flat foreground (chart / image / table / …).
    const layers = resolveSlotsFlat(section).foreground
    return (
      <div
        key={visual.key}
        data-newsletter-visual={visual.key}
        style={{
          width: `${BLOCK_W}px`,
          height: `${VIZ_H}px`,
          position: 'relative',
          overflow: 'hidden',
          background: 'var(--color-bg)',
        }}
      >
        <ForegroundVizSlot
          slug={slug}
          layers={layers}
          unitKey={`${unit.parentIndex}-${unit.subIndex}`}
          activeStep={unit.subIndex}
          mode="print"
          noteLayerReady={noteReady}
        />
      </div>
    )
  }

  return (
    <div
      data-newsletter-shell=""
      style={{
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        fontFamily: 'var(--font-sans)',
        minHeight: '100vh',
      }}
    >
      {!print && (
        <div
          style={{
            padding: '12px 16px',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '0.65rem',
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            color: 'var(--color-muted)',
            borderBottom: '1px solid var(--color-line)',
          }}
        >
          Newsletter capture stage · {blocks.reduce((n, b) => n + b.visuals.length, 0)}{' '}
          visuals · screenshots are taken per block, this page is not the
          newsletter
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: print ? 0 : '24px 0' }}>
        {blocks.map((block) =>
          block.visuals.map((visual) => renderVisual(block, visual))
        )}
      </div>
    </div>
  )
}
