const GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2'

// System fonts that don't need a Google Fonts request
const SYSTEM_FONTS = new Set(['Georgia', 'Courier New', 'Times New Roman', 'Arial', 'Helvetica', 'monospace', 'serif', 'sans-serif'])

// Known fonts with non-default weight sets; any other Google Font falls back to [400, 700]
const KNOWN_WEIGHTS: Record<string, number[]> = {
  'Inter': [400, 500, 600, 700],
  'JetBrains Mono': [400, 500, 600, 700],
  'IBM Plex Mono': [400, 600],
  'Space Mono': [400, 700],
  'Instrument Serif': [400, 600],
}

const DEFAULT_WEIGHTS = [400, 700]

function resolveFont(name: string): { family: string; weights: number[] } | null {
  if (SYSTEM_FONTS.has(name)) return null
  return { family: name, weights: KNOWN_WEIGHTS[name] ?? DEFAULT_WEIGHTS }
}

export function getFontImportUrl(fonts: { serif?: string; sans?: string; mono?: string }): string | null {
  const seen = new Map<string, number[]>()

  for (const name of [fonts.serif, fonts.sans, fonts.mono]) {
    if (!name) continue
    const resolved = resolveFont(name)
    if (resolved && !seen.has(resolved.family)) {
      seen.set(resolved.family, resolved.weights)
    }
  }

  if (seen.size === 0) return null

  const families = Array.from(seen.entries()).map(
    ([family, weights]) => `${family.replace(/ /g, '+')}:wght@${weights.join(';')}`
  )

  const query = families.map(f => `family=${f}`).join('&') + '&display=swap'
  return `${GOOGLE_FONTS_URL}?${query}`
}
