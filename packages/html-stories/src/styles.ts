/**
 * Style randomizer for the HTML story brief. Instead of every agent-authored
 * page using the house palette, the brief can hand the agent a palette and a
 * font trio lifted from the existing viz-engine stories (their frontmatter
 * `theme`). Palette and fonts are drawn independently, so a shuffle can pair
 * one story's colours with another story's type.
 *
 * Pure — no Supabase / Node imports — so the admin client can shuffle without
 * a round trip. The server-side pool loader lives in ./storyStyles.
 */

export interface StylePalette {
  background: string
  surface: string
  text: string
  muted: string
  /** Hairlines / gridlines. Some stories don't set one. */
  line?: string
  accent: string
  accent2: string
  teal: string
  positive?: string
  amber?: string
  red?: string
}

export interface StyleFonts {
  serif: string
  sans: string
  mono: string
}

/** Where a palette or font trio came from, for attribution in the UI and the
 *  brief: an existing story (the randomizer), or a competition's style set in
 *  the footshorts Asset Studio. Absent `kind` means a story. */
export interface StyleSource {
  slug: string
  title: string
  kind?: 'story' | 'competition'
}

export interface PaletteOption {
  palette: StylePalette
  from: StyleSource
}

export interface FontOption {
  fonts: StyleFonts
  from: StyleSource
}

export interface StylePool {
  palettes: PaletteOption[]
  fonts: FontOption[]
}

/** One randomized look to hand the agent. */
export interface StoryStyle {
  palette: StylePalette
  fonts: StyleFonts
  paletteFrom: StyleSource
  fontsFrom: StyleSource
}

/** Loose shape of a story's frontmatter, as read from markdown. */
export interface ThemedStory {
  slug: string
  title?: string
  theme?: {
    colors?: Partial<Record<keyof StylePalette, unknown>>
    fonts?: Partial<Record<keyof StyleFonts, unknown>>
  }
}

const REQUIRED_COLORS = ['background', 'surface', 'text', 'muted', 'accent', 'accent2', 'teal'] as const
const OPTIONAL_COLORS = ['line', 'positive', 'amber', 'red'] as const
const FONT_SLOTS = ['serif', 'sans', 'mono'] as const

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/**
 * Build a deduplicated pool from stories' themes. Stories with an incomplete
 * theme are skipped for that half (a story with fonts but partial colours
 * still contributes its fonts). Sorted by slug so the pool is stable.
 */
export function stylePoolFromStories(stories: ThemedStory[]): StylePool {
  const palettes = new Map<string, PaletteOption>()
  const fonts = new Map<string, FontOption>()

  for (const story of [...stories].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const from = { slug: story.slug, title: story.title || story.slug }
    const colors = story.theme?.colors ?? {}
    const required = REQUIRED_COLORS.map((k) => str(colors[k]))
    if (required.every(Boolean)) {
      const palette = Object.fromEntries(REQUIRED_COLORS.map((k, i) => [k, required[i]])) as unknown as StylePalette
      for (const k of OPTIONAL_COLORS) {
        const v = str(colors[k])
        if (v) palette[k] = v
      }
      const key = [palette.background, palette.text, palette.accent, palette.accent2].join('|').toLowerCase()
      if (!palettes.has(key)) palettes.set(key, { palette, from })
    }

    const f = story.theme?.fonts ?? {}
    const trio = FONT_SLOTS.map((k) => str(f[k]))
    if (trio.every(Boolean)) {
      const value = { serif: trio[0]!, sans: trio[1]!, mono: trio[2]! }
      const key = trio.join('|').toLowerCase()
      if (!fonts.has(key)) fonts.set(key, { fonts: value, from })
    }
  }

  return { palettes: [...palettes.values()], fonts: [...fonts.values()] }
}

function pick<T>(items: T[], rng: () => number, avoid?: (item: T) => boolean): T {
  const candidates = avoid && items.length > 1 ? items.filter((i) => !avoid(i)) : items
  return candidates[Math.floor(rng() * candidates.length) % candidates.length]!
}

/**
 * Draw a palette and a font trio at random. Pass `previous` to guarantee the
 * palette changes on a re-shuffle (and the fonts too, when the pool has more
 * than one trio). Returns null when the pool has nothing to draw from.
 */
export function pickRandomStyle(
  pool: StylePool,
  { rng = Math.random, previous }: { rng?: () => number; previous?: StoryStyle | null } = {},
): StoryStyle | null {
  if (!pool.palettes.length || !pool.fonts.length) return null
  const p = pick(pool.palettes, rng, (o) => o.from.slug === previous?.paletteFrom.slug)
  const f = pick(pool.fonts, rng, (o) => o.from.slug === previous?.fontsFrom.slug)
  return { palette: p.palette, fonts: f.fonts, paletteFrom: p.from, fontsFrom: f.from }
}

/** Relative luminance of a #rgb / #rrggbb colour; null for anything else. */
function luminance(color: string): number | null {
  let hex = color.replace('#', '')
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) return null
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('')
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/** Whether the palette is a light page (dark text on a pale background). */
export function isLightPalette(palette: StylePalette): boolean {
  const l = luminance(palette.background)
  return l !== null && l > 0.5
}

// ── competition styles (footshorts Asset Studio → entities.story_style) ──────

/** A competition's saved look: one palette and one font trio. */
export interface CompetitionStyle {
  palette: StylePalette
  fonts: StyleFonts
}

/** A competition with a saved style, as the brief's picker lists it. */
export interface CompetitionStyleOption {
  slug: string
  name: string
  crestUrl: string | null
  style: CompetitionStyle
}

export const PALETTE_REQUIRED_SLOTS = REQUIRED_COLORS
export const PALETTE_OPTIONAL_SLOTS = OPTIONAL_COLORS
export const FONT_ROLES = FONT_SLOTS

const STRICT_HEX = /^#[0-9a-fA-F]{6}$/
/** A Google Fonts family name: letters, digits, spaces and hyphens. */
const FONT_NAME = /^[A-Za-z0-9][A-Za-z0-9 -]{0,59}$/

/**
 * Validate and normalize a competition style (what `entities.story_style`
 * stores): every required palette slot a `#RRGGBB` hex, optional slots either
 * absent or hex, three font names. Hexes are upper-cased, unknown keys dropped.
 * Returns the cleaned style, or an error message naming the first bad field.
 */
export function parseCompetitionStyle(value: unknown): { style: CompetitionStyle } | { error: string } {
  if (!value || typeof value !== 'object') return { error: 'style must be an object with palette and fonts' }
  const v = value as { palette?: unknown; fonts?: unknown }
  if (!v.palette || typeof v.palette !== 'object') return { error: 'style.palette must be an object' }
  if (!v.fonts || typeof v.fonts !== 'object') return { error: 'style.fonts must be an object' }
  const colors = v.palette as Record<string, unknown>
  const palette: Partial<StylePalette> = {}
  for (const k of REQUIRED_COLORS) {
    const c = colors[k]
    if (typeof c !== 'string' || !STRICT_HEX.test(c.trim())) return { error: `palette.${k} must be a #RRGGBB hex` }
    palette[k] = c.trim().toUpperCase()
  }
  for (const k of OPTIONAL_COLORS) {
    const c = colors[k]
    if (c == null || c === '') continue
    if (typeof c !== 'string' || !STRICT_HEX.test(c.trim())) return { error: `palette.${k} must be a #RRGGBB hex or empty` }
    palette[k] = c.trim().toUpperCase()
  }
  const f = v.fonts as Record<string, unknown>
  const fonts: Partial<StyleFonts> = {}
  for (const k of FONT_SLOTS) {
    const name = typeof f[k] === 'string' ? (f[k] as string).trim().replace(/\s+/g, ' ') : ''
    if (!FONT_NAME.test(name)) return { error: `fonts.${k} must be a font family name (letters, digits, spaces, hyphens)` }
    fonts[k] = name
  }
  return { style: { palette: palette as StylePalette, fonts: fonts as StyleFonts } }
}

/** The brief style for a competition's saved look (palette and fonts both from it). */
export function competitionStoryStyle(option: Pick<CompetitionStyleOption, 'slug' | 'name' | 'style'>): StoryStyle {
  const from: StyleSource = { slug: option.slug, title: option.name, kind: 'competition' }
  return { palette: option.style.palette, fonts: option.style.fonts, paletteFrom: from, fontsFrom: from }
}
