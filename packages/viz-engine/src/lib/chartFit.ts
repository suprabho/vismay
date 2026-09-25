import type { EChartsOption } from 'echarts'

/**
 * Re-flow a generated chart option for the width it actually renders at.
 *
 * flint-chart (the story-pipeline chart assembler) lays a chart out for one
 * fixed canvas: a vertical side legend pinned at an absolute pixel `left`, a
 * bold text `graphic` above it as the legend title, and a pixel `grid.right`
 * reserving that column. Those pixels are only right at flint's canvas width —
 * narrower (a phone) the legend lands off-canvas and gets clipped; wider it
 * floats over the plot. Measured width in, fixed-up option out:
 *
 *   - wide: pin the legend + title to the column `grid.right` reserves.
 *   - narrow: fold the legend into a centered horizontal row above the plot,
 *     drop the side column + title, and push the plot down to make room.
 *
 * Options without a pixel-pinned vertical legend pass through untouched, so
 * hand-built and non-flint charts are unaffected.
 */

type JsonObject = Record<string, unknown>

/** Below this the side legend's column eats too much of the plot. */
export const NARROW_CHART_WIDTH = 480

function isObject(v: unknown): v is JsonObject {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function toList(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v == null ? [] : [v]
}

/** Rough rendered width of a legend item (icon + gap + label at ~11px). */
function legendItemWidth(name: string): number {
  return 25 + name.length * 6.5 + 10
}

export function fitChartToWidth(
  option: EChartsOption,
  width: number,
  opts: { muted?: string } = {},
): EChartsOption {
  if (!(width > 0)) return option
  const legends = toList(option.legend)
  const side = legends.find(
    (l): l is JsonObject => isObject(l) && l.orient === 'vertical' && typeof l.left === 'number',
  )
  if (!side) return option

  const pinnedLeft = side.left as number
  const grid = isObject(option.grid) ? option.grid : null
  const gridRight = grid && typeof grid.right === 'number' ? grid.right : null
  // flint's legend title: a text graphic sharing the legend's pixel `left`.
  const isTitle = (g: unknown) => isObject(g) && g.type === 'text' && g.left === pinnedLeft

  if (width < NARROW_CHART_WIDTH) {
    const names = toList(side.data).map((d) => (isObject(d) ? String(d.name ?? '') : String(d)))
    const perRow = Math.max(1, width - 24)
    const total = names.reduce((sum, n) => sum + legendItemWidth(n), 0)
    const rows = Math.max(1, Math.ceil(total / perRow))
    const legendHeight = 8 + rows * 22
    const nextLegends = legends.map((l) => {
      if (l !== side) return l
      const { left: _left, right: _right, bottom: _bottom, align: _align, ...rest } = side
      return { ...rest, orient: 'horizontal', left: 'center', top: 4, itemGap: 12 }
    })
    const graphics = toList(option.graphic).filter((g) => !isTitle(g))
    const out: EChartsOption = {
      ...option,
      legend: (Array.isArray(option.legend) ? nextLegends : nextLegends[0]) as EChartsOption['legend'],
      graphic: graphics as EChartsOption['graphic'],
    }
    if (grid) {
      const top = typeof grid.top === 'number' ? grid.top : 0
      out.grid = { ...grid, right: 16, top: Math.max(top, legendHeight + 12) } as EChartsOption['grid']
    }
    return out
  }

  // Wide: keep the side column, but anchor it to the plot's right edge at the
  // real width instead of flint's canvas width.
  const left = gridRight != null ? Math.max(0, width - gridRight + 12) : null
  const place = (o: JsonObject): JsonObject => {
    if (left != null) return { ...o, left }
    const { left: _left, ...rest } = o
    return { ...rest, right: 12 }
  }
  const nextLegends = legends.map((l) => (l === side ? place(side) : l))
  const graphics = toList(option.graphic).map((g) => {
    if (!isTitle(g)) return g
    const placed = place(g as JsonObject)
    // flint paints the title #333 — invisible on a dark story theme.
    const style = isObject(placed.style) ? placed.style : {}
    return opts.muted ? { ...placed, style: { ...style, fill: opts.muted } } : placed
  })
  return {
    ...option,
    legend: (Array.isArray(option.legend) ? nextLegends : nextLegends[0]) as EChartsOption['legend'],
    graphic: (Array.isArray(option.graphic) || graphics.length !== 1
      ? graphics
      : graphics[0]) as EChartsOption['graphic'],
  }
}
