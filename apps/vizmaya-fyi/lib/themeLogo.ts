import { promises as fs } from 'fs'
import path from 'path'
import type { Theme } from '@/types/story'

export const DEFAULT_LOGO_PATH = '/vizmaya-logo-01.svg'

/**
 * Brand colors baked into the source logo SVGs (`public/vizmaya-logo-*.svg`)
 * mapped to the theme tokens that should replace them.
 *
 * The originals are the three Vizmaya circle colors plus the near-black
 * outline. Whites/off-whites are left alone — they act as contrast fills
 * inside the circles and shouldn't follow the theme.
 */
const COLOR_MAP_KEYS: Array<{
  from: string[]
  token: keyof Theme['colors']
}> = [
  { from: ['#00e6d9'], token: 'teal' },
  { from: ['#fc3692'], token: 'accent' },
  { from: ['#004cff'], token: 'accent2' },
  { from: ['#20201e'], token: 'text' },
]

function buildReplacements(theme: Theme): Array<[RegExp, string]> {
  const out: Array<[RegExp, string]> = []
  for (const { from, token } of COLOR_MAP_KEYS) {
    const to = theme.colors[token]
    if (!to) continue
    for (const hex of from) {
      // Match the hex case-insensitively, anywhere it appears (fill, stroke,
      // gradient stops). Word boundary keeps `#20201e` from matching inside
      // a longer hex. Escape `#` for the regex.
      out.push([new RegExp(`${hex.replace('#', '\\#')}\\b`, 'gi'), to])
    }
  }
  return out
}

function applyReplacements(svg: string, replacements: Array<[RegExp, string]>): string {
  let out = svg
  for (const [re, to] of replacements) out = out.replace(re, to)
  return out
}

function toDataUrl(svg: string): string {
  // SVGs round-trip cleanly through encodeURIComponent and stay readable in
  // devtools; base64 would inflate size by ~33% with no benefit.
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/**
 * Read a logo SVG from `public/` and recolor its brand palette using the
 * story theme. Returns a `data:image/svg+xml` URL so the share card is
 * self-contained (no extra fetch during html-to-image capture).
 *
 * `logoPath` accepts:
 *   • `undefined` — uses the default Vizmaya logo
 *   • `/foo.svg`  — read from `public/foo.svg`
 *   • `http(s)://…` — returned unchanged (we can't read remote files here)
 */
export async function themedLogoDataUrl(
  logoPath: string | undefined,
  theme: Theme
): Promise<string> {
  const requested = logoPath ?? DEFAULT_LOGO_PATH
  if (/^https?:\/\//i.test(requested)) return requested

  const rel = requested.startsWith('/') ? requested.slice(1) : requested
  const abs = path.join(process.cwd(), 'public', rel)
  let svg: string
  try {
    svg = await fs.readFile(abs, 'utf8')
  } catch {
    // Fall back to serving the original path as-is so the card still
    // renders something rather than crashing the page.
    return requested
  }

  const replacements = buildReplacements(theme)
  const themed = applyReplacements(svg, replacements)
  return toDataUrl(themed)
}
