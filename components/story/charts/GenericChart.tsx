'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import type { EChartsOption } from 'echarts'
import { useChartColors, useIsMobile } from '@/lib/chartTheme'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

/**
 * A data-driven chart: reads its ECharts option(s) from a JSON file served
 * at /api/chart-data/<slug>/<id>. The JSON has the shape:
 *
 *   {
 *     "steps": [
 *       { "title"?: string, "option": EChartsOption },
 *       ...
 *     ]
 *   }
 *
 * `activeStep` selects which step to render. Steps share the same container,
 * so switching is driven by re-rendering with a different option. Color
 * tokens in the option (anything like "$accent", "$teal", "$muted", "$line",
 * "$surface", "$amber", "$red", "$green", "$accent2") are replaced with
 * the live theme before handing to ECharts.
 *
 * Ingest-generated charts should prefer `$`-prefixed tokens so swapping a
 * story's theme auto-reflows colors (same pattern as hand-built charts
 * which call useChartColors()).
 */

interface ChartStep {
  title?: string
  option: EChartsOption
}

interface ChartData {
  steps: ChartStep[]
}

interface Props {
  slug: string
  id: string
  activeStep: number
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

function replaceColorTokens<T extends JsonValue>(value: T, palette: Record<string, string>): T {
  if (typeof value === 'string' && value.startsWith('$')) {
    const key = value.slice(1)
    return (palette[key] ?? value) as T
  }
  if (Array.isArray(value)) {
    return value.map((v) => replaceColorTokens(v as JsonValue, palette)) as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, JsonValue> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = replaceColorTokens(v as JsonValue, palette)
    }
    return out as T
  }
  return value
}

/**
 * Theme tokens that ThemeProvider publishes as CSS variables but that
 * aren't part of ChartColors. Resolved from the chart's own mounted
 * element (which sits inside the theme wrapper), so they pick up the
 * story's frontmatter colors.
 */
const EXTRA_CSS_VAR_KEYS = ['positive', 'text', 'bg', 'amber', 'red', 'accent', 'accent2', 'teal', 'surface', 'muted'] as const

function readThemeVars(el: HTMLElement | null): Record<string, string> {
  if (!el) return {}
  const cs = getComputedStyle(el)
  const out: Record<string, string> = {}
  for (const k of EXTRA_CSS_VAR_KEYS) {
    const v = cs.getPropertyValue(`--color-${k}`).trim()
    if (v) out[k] = v
  }
  // ThemeProvider writes --color-bg but the content usually writes
  // $background in chart JSON. Alias both directions.
  if (out.bg && !out.background) out.background = out.bg
  return out
}

export default function GenericChart({ slug, id, activeStep }: Props) {
  const colors = useChartColors()
  const mobile = useIsMobile()
  const [data, setData] = useState<ChartData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [cssVars, setCssVars] = useState<Record<string, string>>({})

  // Read the story's CSS variables once the root mounts. They live on
  // ThemeProvider's wrapper div, not on documentElement, so we have to
  // resolve relative to an element inside the theme tree.
  useEffect(() => {
    setCssVars(readThemeVars(rootRef.current))
  }, [data])

  useEffect(() => {
    let cancelled = false
    setError(null)
    setData(null)
    fetch(`/api/chart-data/${slug}/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json()
      })
      .then((json: ChartData) => {
        if (!cancelled) setData(json)
      })
      .catch((err) => {
        if (!cancelled) setError(String(err))
      })
    return () => {
      cancelled = true
    }
  }, [slug, id])

  if (error) {
    return (
      <div style={{ color: colors.muted, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        Chart load failed: {error}
      </div>
    )
  }
  if (!data) return null

  const step = data.steps[activeStep] ?? data.steps[0]
  if (!step) return null

  // ChartColors keys (accent/teal/red/green/…) win over CSS vars, so
  // story-specific overrides remain authoritative. cssVars fills in the
  // names the chart JSON commonly uses (positive/text/bg).
  const palette = { ...cssVars, ...(colors as unknown as Record<string, string>) }
  const resolved = replaceColorTokens(step.option as unknown as JsonValue, palette) as EChartsOption
  // Slide PDFs (1920x1080 landscape) consistently render an opaque white
  // chart canvas even with `backgroundColor: 'transparent'` set on the option
  // — Chromium's PDF compositor doesn't preserve canvas alpha in the
  // landscape path. A4-portrait reports are fine. Painting the canvas with
  // the story's theme bg (--color-bg, resolved into cssVars) sidesteps the
  // compositor entirely: the chart blends into the page background regardless
  // of how alpha is handled.
  const themeBg = cssVars.bg || cssVars.background
  const option: EChartsOption = {
    ...resolved,
    backgroundColor: themeBg || 'transparent',
  }

  return (
    <div
      ref={rootRef}
      style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <ReactECharts
        option={option}
        style={{ width: '100%', height: '100%', minHeight: mobile ? 280 : 360 }}
        notMerge
        lazyUpdate={false}
      />
      {step.title && (
        <div
          style={{
            color: colors.muted,
            fontFamily: 'var(--font-mono)',
            fontSize: mobile ? 10 : 12,
            textAlign: 'center',
            padding: '6px 12px 0',
          }}
        >
          {step.title}
        </div>
      )}
    </div>
  )
}
