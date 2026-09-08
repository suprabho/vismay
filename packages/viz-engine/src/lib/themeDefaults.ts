import type { Theme } from '../types/story'

/**
 * Story theme defaults, validators, and the built-in per-app presets.
 *
 * Lives in the engine (not story-pipeline) because every layer above needs it:
 * story-pipeline seeds generated stories from `DEFAULT_THEME`, content-source
 * validates saved themes with `normalizeTheme`, and the admin merges
 * `STORY_THEME_PRESETS` over the `story_themes` rows. The dependency graph is
 * story-pipeline → content-source → viz-engine, so this is the lowest common
 * home with no cycle.
 */

/**
 * A complete, neutral editorial theme. The engine injects this so the model
 * never has to author a full palette (and so every token the renderer reads is
 * present). The model may suggest accent colours, which `buildFrontmatter`
 * folds over this base.
 */
export const DEFAULT_THEME = {
  colors: {
    background: '#f6f4ef',
    text: '#1a1c22',
    accent: '#2f4b7c',
    accent2: '#d4612a',
    teal: '#2a9d8f',
    surface: '#ffffff',
    muted: '#6b7280',
    positive: '#2a9d8f',
    amber: '#e0a13c',
    red: '#c0432f',
    line: '#e2ddd3',
  },
  fonts: {
    serif: 'Fraunces',
    sans: 'Inter',
    mono: 'JetBrains Mono',
  },
} as const satisfies Theme

export const THEME_REQUIRED_COLOR_KEYS = [
  'background',
  'text',
  'accent',
  'accent2',
  'teal',
  'surface',
  'muted',
] as const
export const THEME_OPTIONAL_COLOR_KEYS = ['positive', 'amber', 'red', 'line'] as const
export const THEME_FONT_KEYS = ['serif', 'sans', 'mono'] as const

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const MAX_FONT_LEN = 60

function isHex(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v.trim())
}

/**
 * Validate an untrusted value (API body, jsonb row, YAML) into a `Theme`.
 * Returns `null` when a required colour is missing/not hex or a font is not a
 * non-empty string ≤ 60 chars. Empty or invalid OPTIONAL colours are dropped
 * rather than failing, since the theme editor's "clear" leaves `''` behind.
 */
export function normalizeTheme(input: unknown): Theme | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const raw = input as { colors?: unknown; fonts?: unknown }
  if (!raw.colors || typeof raw.colors !== 'object' || Array.isArray(raw.colors)) return null
  if (!raw.fonts || typeof raw.fonts !== 'object' || Array.isArray(raw.fonts)) return null
  const rc = raw.colors as Record<string, unknown>
  const rf = raw.fonts as Record<string, unknown>

  const colors: Record<string, string> = {}
  for (const key of THEME_REQUIRED_COLOR_KEYS) {
    const v = rc[key]
    if (!isHex(v)) return null
    colors[key] = v.trim()
  }
  for (const key of THEME_OPTIONAL_COLOR_KEYS) {
    const v = rc[key]
    if (isHex(v)) colors[key] = v.trim()
  }

  const fonts: Record<string, string> = {}
  for (const key of THEME_FONT_KEYS) {
    const v = rf[key]
    if (typeof v !== 'string') return null
    const t = v.trim()
    if (!t || t.length > MAX_FONT_LEN) return null
    fonts[key] = t
  }

  return { colors, fonts } as unknown as Theme
}

/**
 * Fill any missing required token from `base` so a partial theme (an old row,
 * a hand-edited frontmatter) can never crash `ThemeProvider`, which hard-reads
 * `colors.background` / `fonts.sans` etc. Optional tokens pass through as-is.
 */
export function fillTheme(partial: Partial<Theme> | null | undefined, base: Theme = DEFAULT_THEME): Theme {
  return {
    colors: { ...base.colors, ...(partial?.colors ?? {}) },
    fonts: { ...base.fonts, ...(partial?.fonts ?? {}) },
  }
}

/** Relative luminance (WCAG) of a hex colour, 0..1. Non-hex input → 1 (treated as light). */
export function hexLuminance(hex: string): number {
  const m = HEX_RE.exec(hex.trim())
  if (!m) return 1
  let h = m[1] ?? ''
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  const chan = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * chan((n >> 16) & 0xff) + 0.7152 * chan((n >> 8) & 0xff) + 0.0722 * chan(n & 0xff)
}

/** True when the page background is dark enough that dark map styles / chrome read better. */
export function isDarkTheme(theme: Pick<Theme, 'colors'>): boolean {
  return hexLuminance(theme.colors.background) < 0.2
}

/**
 * Stable identity of a palette, ignoring fonts, key order, case and unset
 * optional tokens — used to highlight which preset a story currently matches
 * (fonts can be tweaked independently, so colours alone decide).
 */
export function themeColorsKey(theme: Pick<Theme, 'colors'>): string {
  const entries = Object.entries(theme.colors)
    .filter(([, v]) => typeof v === 'string' && v.trim() !== '')
    .map(([k, v]) => [k, (v as string).trim().toLowerCase()] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return JSON.stringify(entries)
}

/** A built-in preset: mirrors one row of the `story_themes` table. */
export interface StoryThemePresetSeed {
  /** Stable row slug (`<app>-<name>`), the merge key against DB rows. */
  slug: string
  name: string
  /** Owning app slug; `null` = shared by every app. */
  appSlug: string | null
  /** Seeds new stories of `appSlug` when true (one per app). */
  isDefault: boolean
  theme: Theme
}

const FOOTSHORTS_FONTS = { serif: 'Forum', sans: 'Space Grotesk', mono: 'Space Mono' } as const

/**
 * Built-in presets, one per consumer-app look. These mirror the apps' own
 * brand tokens (apps/footshorts/brand/src/themes/*, apps/vizf1/brand) mapped
 * onto the story token vocabulary: accent = brand colour, accent2 = the app's
 * secondary pop, teal = third series colour, semantic tokens AA-checked
 * against background + surface.
 *
 * KEEP IN SYNC with the seed rows in
 * supabase/vizmaya-fyi/migrations/077_story_themes.sql — the migration inserts
 * these same values as `builtin = true` rows (DB rows win over this list by
 * slug in the admin, so the rows can be edited later; this list is the
 * fs-mode / no-DB fallback and the compile-time source).
 */
export const STORY_THEME_PRESETS: readonly StoryThemePresetSeed[] = [
  {
    slug: 'footshorts-classic',
    name: 'Classic',
    appSlug: 'footshorts',
    isDefault: true,
    theme: {
      colors: {
        background: '#0B0B0F',
        surface: '#16161D',
        line: '#24242E',
        text: '#F4F4F5',
        muted: '#8E8E99',
        accent: '#F26A3C',
        accent2: '#00D26A',
        teal: '#38BDF8',
        positive: '#00D26A',
        amber: '#FBBF24',
        red: '#F87171',
      },
      fonts: { ...FOOTSHORTS_FONTS },
    },
  },
  {
    slug: 'footshorts-pitch',
    name: 'Pitch',
    appSlug: 'footshorts',
    isDefault: false,
    theme: {
      colors: {
        background: '#06140C',
        surface: '#0E2517',
        line: '#1B3A26',
        text: '#ECFDF1',
        muted: '#7FA48C',
        accent: '#F26A3C',
        accent2: '#34D399',
        teal: '#5EEAD4',
        positive: '#34D399',
        amber: '#FCD34D',
        red: '#FB7185',
      },
      fonts: { ...FOOTSHORTS_FONTS },
    },
  },
  {
    slug: 'footshorts-terrace',
    name: 'Terrace',
    appSlug: 'footshorts',
    isDefault: false,
    theme: {
      colors: {
        background: '#FAF7F2',
        surface: '#FFFFFF',
        line: '#E5DFD3',
        text: '#1B1A17',
        muted: '#6B675E',
        accent: '#C2410C',
        accent2: '#15803D',
        teal: '#0F766E',
        positive: '#15803D',
        amber: '#B45309',
        red: '#B91C1C',
      },
      fonts: { ...FOOTSHORTS_FONTS },
    },
  },
  {
    slug: 'vizf1-paddock',
    name: 'Paddock',
    appSlug: 'vizf1',
    isDefault: true,
    theme: {
      colors: {
        background: '#0b0d12',
        surface: '#13161d',
        line: '#1f2330',
        text: '#f5f5f5',
        muted: '#8e8e99',
        accent: '#ff4346',
        accent2: '#A855F7',
        teal: '#2DD4BF',
        positive: '#22C55E',
        amber: '#FACC15',
        red: '#EF4444',
      },
      // VizF1 has no brand typeface (system sans in the app); Inter in both
      // text slots keeps headlines sans so stories read like the app.
      fonts: { serif: 'Inter', sans: 'Inter', mono: 'JetBrains Mono' },
    },
  },
]

/** Built-in presets visible to one app: its own plus every shared one. */
export function builtinThemePresetsFor(appSlug: string): StoryThemePresetSeed[] {
  return STORY_THEME_PRESETS.filter((p) => p.appSlug === null || p.appSlug === appSlug)
}

/** The built-in default theme for an app, or `null` when it has none (→ `DEFAULT_THEME`). */
export function builtinDefaultThemeFor(appSlug: string | null | undefined): Theme | null {
  if (!appSlug) return null
  return STORY_THEME_PRESETS.find((p) => p.appSlug === appSlug && p.isDefault)?.theme ?? null
}
