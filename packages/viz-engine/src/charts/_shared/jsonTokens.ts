/**
 * Renderer-agnostic helpers shared by the JSON-driven charts (`data:` ECharts
 * via GenericChart, `plot:` Observable Plot via GenericPlot).
 *
 * Both formats use the same `$token` color convention and read the same story
 * CSS variables, so the logic lives here rather than being duplicated per
 * engine. This module must stay engine-agnostic (no echarts / d3 imports) —
 * the ESLint guardrails enforce that for charts/_shared.
 */

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

/**
 * Replace `$token` strings anywhere in a JSON tree with the matching palette
 * value. A string like `"$accent"` becomes the resolved color; anything that
 * isn't a `$`-prefixed string (including Plot/ECharts field references like
 * `"value"`) passes through untouched.
 */
export function replaceColorTokens<T extends JsonValue>(value: T, palette: Record<string, string>): T {
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
 * Theme tokens that ThemeProvider publishes as CSS variables but that aren't
 * part of ChartColors. Resolved from a mounted element inside the theme
 * wrapper so they pick up the story's frontmatter colors.
 */
export const EXTRA_CSS_VAR_KEYS = ['positive', 'text', 'bg', 'amber', 'red', 'accent', 'accent2', 'teal', 'surface', 'muted'] as const

export function readThemeVars(el: HTMLElement | null): Record<string, string> {
  if (!el) return {}
  const cs = getComputedStyle(el)
  const out: Record<string, string> = {}
  for (const k of EXTRA_CSS_VAR_KEYS) {
    const v = cs.getPropertyValue(`--color-${k}`).trim()
    if (v) out[k] = v
  }
  // ThemeProvider writes --color-bg but content usually writes $background in
  // chart JSON. Alias both directions.
  if (out.bg && !out.background) out.background = out.bg
  return out
}
