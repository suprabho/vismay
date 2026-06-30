'use client'

import { useEffect, useRef, useState } from 'react'
import * as Plot from '@observablehq/plot'
import { useChartColors, useIsMobile } from '../../lib/chartTheme'
import { readThemeVars, replaceColorTokens, type JsonValue } from '../_shared/jsonTokens'

/**
 * The D3-family parallel to {@link GenericChart}: a data-driven chart whose
 * spec is authored as JSON and rendered with Observable Plot. Reached via the
 * `plot:<id>` chart id, served from the same `/api/chart-data/<slug>/<id>`
 * endpoint as the ECharts `data:` path.
 *
 * The JSON mirrors Observable Plot's option object, except `marks` are
 * declared as `{ type, data?, options? }` tuples instead of function calls
 * (JSON can't hold functions). The `$token` color convention and CSS-var
 * resolution are shared with GenericChart via `_shared/jsonTokens`.
 *
 *   {
 *     "steps": [
 *       {
 *         "title"?: string,
 *         "plot": {
 *           "x": { "label": "…" },
 *           "y": { "grid": true },
 *           "color": { "legend": true },
 *           "marks": [
 *             { "type": "dot", "data": [...], "options": { "x": "gdp", "y": "life", "fill": "$accent" } },
 *             { "type": "ruleY", "data": [0] }
 *           ]
 *         }
 *       }
 *     ]
 *   }
 *
 * See docs/generic-plot-schema.md for the full schema and supported marks.
 *
 * Per the import guardrails this file may import `@observablehq/plot` / `d3-*`
 * but never `echarts`. ChartPanel lazy-loads it so Plot only enters the bundle
 * of a story that actually renders a `plot:` chart.
 */

interface PlotStep {
  title?: string
  plot: Record<string, JsonValue>
}

interface PlotData {
  steps: PlotStep[]
}

interface Props {
  slug: string
  id: string
  activeStep: number
}

type MarkSpec = { type?: string; data?: JsonValue[]; options?: Record<string, JsonValue> }

// Marks called as fn(data, options).
const DATA_MARK_FNS: Record<string, (data: Plot.Data, options: Plot.MarkOptions) => Plot.Markish> = {
  dot: Plot.dot, dotX: Plot.dotX, dotY: Plot.dotY,
  line: Plot.line, lineX: Plot.lineX, lineY: Plot.lineY,
  area: Plot.area, areaX: Plot.areaX, areaY: Plot.areaY,
  barX: Plot.barX, barY: Plot.barY,
  rect: Plot.rect, rectX: Plot.rectX, rectY: Plot.rectY,
  cell: Plot.cell, cellX: Plot.cellX, cellY: Plot.cellY,
  tickX: Plot.tickX, tickY: Plot.tickY,
  text: Plot.text, textX: Plot.textX, textY: Plot.textY,
  ruleX: Plot.ruleX, ruleY: Plot.ruleY,
  link: Plot.link, arrow: Plot.arrow, vector: Plot.vector,
  boxX: Plot.boxX, boxY: Plot.boxY,
  tip: Plot.tip,
}

// Marks called as fn(options) only.
const OPTION_MARK_FNS: Record<string, (options: Plot.MarkOptions) => Plot.Markish> = {
  frame: Plot.frame, gridX: Plot.gridX, gridY: Plot.gridY,
}

function buildMarks(marks: MarkSpec[], mobile: boolean): Plot.Markish[] {
  const out: Plot.Markish[] = []
  for (const m of marks) {
    if (!m || typeof m.type !== 'string') continue
    // No hover surface on mobile — drop the dedicated tip mark and any
    // `tip: true` on other marks (mirrors GenericChart's tooltip suppression).
    if (m.type === 'tip' && mobile) continue
    const options = { ...(m.options ?? {}) } as Plot.MarkOptions & { tip?: unknown }
    if (mobile && 'tip' in options) delete options.tip

    const optionOnly = OPTION_MARK_FNS[m.type]
    if (optionOnly) {
      out.push(optionOnly(options))
      continue
    }
    const dataFn = DATA_MARK_FNS[m.type]
    if (!dataFn) {
      console.warn(`[GenericPlot] unknown mark type: ${m.type}`)
      continue
    }
    out.push(dataFn((m.data ?? []) as Plot.Data, options))
  }
  return out
}

export default function GenericPlot({ slug, id, activeStep }: Props) {
  const colors = useChartColors()
  const mobile = useIsMobile()
  const [data, setData] = useState<PlotData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const figureRef = useRef<HTMLDivElement>(null)
  const [cssVars, setCssVars] = useState<Record<string, string>>({})

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
      .then((json: PlotData) => {
        if (!cancelled) setData(json)
      })
      .catch((err) => {
        if (!cancelled) setError(String(err))
      })
    return () => {
      cancelled = true
    }
  }, [slug, id])

  // Render (and re-render) the Plot figure into the container imperatively —
  // Plot returns a detached DOM node, not React elements.
  useEffect(() => {
    const host = figureRef.current
    if (!host || !data) return
    const step = data.steps[activeStep] ?? data.steps[0]
    if (!step?.plot) return

    try {
      const palette = { ...cssVars, ...(colors as unknown as Record<string, string>) }
      const spec = replaceColorTokens(step.plot, palette) as Record<string, JsonValue>
      const { marks: rawMarks, style: specStyle, ...rest } = spec
      const marks = Array.isArray(rawMarks) ? buildMarks(rawMarks as MarkSpec[], mobile) : []

      const figure = Plot.plot({
        width: mobile ? 360 : 720,
        ...(rest as Plot.PlotOptions),
        style: {
          background: 'transparent',
          color: colors.chromeText,
          fontFamily: 'var(--font-mono)',
          fontSize: mobile ? '10px' : '12px',
          ...((specStyle as Record<string, string>) ?? {}),
        },
        marks,
      })
      // Plot already sets max-width:100%; height:auto on its root.
      host.replaceChildren(figure)
      setError(null)
    } catch (err) {
      host.replaceChildren()
      setError(String(err))
    }
  }, [data, activeStep, mobile, cssVars, colors])

  const step = data?.steps[activeStep] ?? data?.steps[0]

  return (
    <div
      ref={rootRef}
      style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      {error ? (
        <div style={{ color: colors.muted, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          Plot load failed: {error}
        </div>
      ) : (
        <div
          ref={figureRef}
          style={{ width: '100%', flex: 1, minHeight: mobile ? 280 : 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        />
      )}
      {step?.title && (
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
