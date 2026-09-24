/**
 * Composer-planned charts are rendered to SVG at compose time with the
 * edition's DARK palette baked in as hex (scripts/ai-data-centers/
 * editionCharts.ts — the two tables must agree). The page swaps those exact
 * hexes for the CSS variables the stylesheet defines, so the same frozen SVG
 * follows the light theme and any epic-row overrides, and never ships a
 * colour the page didn't choose.
 *
 * `fill="var(--x)"` is not a valid presentation attribute, so the colour moves
 * into a `style` attribute (merged with any the element already carries).
 *
 * The companion series (accent-mid, accent-hi) map to --chart-mid/--chart-hi,
 * which edition.css pins to the page's accent steps: a layer tile re-points
 * --accent at its own hue, and its chart's other series must stay distinct
 * hues rather than become tints of it.
 */

import { AI_DATA_CENTERS_THEME_DEFAULTS as T } from '../../../ai-data-centers/theme'
import { CHART_FONT_SENTINEL } from './chartConstants'

/** Dark-theme hex → CSS variable. ECharts' own axis defaults are mapped too. */
const HEX_TO_VAR: Record<string, string> = {
  [T.energy]: '--energy',
  [T.accent]: '--accent',
  [T.accentMid]: '--chart-mid',
  [T.accentHi]: '--chart-hi',
  [T.comp1]: '--comp1',
  [T.comp2]: '--comp2',
  [T.comp3]: '--comp3',
  [T.muted]: '--muted',
  [T.line]: '--line',
  [T.dim]: '--dim',
  [T.bone]: '--bone',
  [T.down]: '--down',
  '#6e7079': '--muted',
  '#e0e6f1': '--line',
  '#dbdee4': '--line',
  '#54555a': '--muted',
  '#ccc': '--line-strong',
  '#cccccc': '--line-strong',
  '#333': '--bone',
  '#333333': '--bone',
}

const COLOR_ATTR = /\s(fill|stroke)="(#[0-9a-fA-F]{3,6})"/g

/** Swap baked palette hexes for CSS variables and the font sentinel for the page's mono face. */
export function themeChartSvg(svg: string): string {
  const themed = svg.replace(/<([a-zA-Z]+)((?:\s+[^\s=>]+="[^"]*")*)\s*(\/?)>/g, (whole, tag: string, attrs: string, selfClose: string) => {
    const moved: string[] = []
    let rest = attrs.replace(COLOR_ATTR, (m, prop: string, hex: string) => {
      const v = HEX_TO_VAR[hex.toLowerCase()]
      if (!v) return m
      moved.push(`${prop}:var(${v})`)
      return ''
    })
    if (moved.length === 0) return whole
    const styleMatch = rest.match(/\sstyle="([^"]*)"/)
    if (styleMatch) {
      const existing = styleMatch[1].trim().replace(/;?$/, ';')
      rest = rest.replace(styleMatch[0], ` style="${existing}${moved.join(';')};"`)
    } else {
      rest = `${rest} style="${moved.join(';')};"`
    }
    return `<${tag}${rest}${selfClose ? ' /' : ''}>`
  })
  return themed.split(`font-family:${CHART_FONT_SENTINEL}`).join('font-family:var(--mono)')
}
