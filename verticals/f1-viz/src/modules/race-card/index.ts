import type { VizModule, AdminFormField } from '@vismay/viz-engine'

/**
 * `f1:race-card` — editorial race card with multiple layout variants.
 *
 * Layouts — compact / horizontal / portrait / score — share a single config
 * shape. Country flags, accent colors, and circuit names come from the
 * bundled palette in `../../data/grands-prix.ts`; authors override
 * per-card via the YAML fields below.
 *
 * Story YAML:
 *
 *   foreground:
 *     - type: f1:race-card
 *       layout: portrait
 *       grandPrix: "Monaco Grand Prix"     # display name or slug — matched on both
 *       season: 2026
 *       round: 7
 *       date: "2026-05-24"
 *       sessionLabel: "2:00 PM"           # free-form, e.g. "Race · Sun 14:00"
 *       winner: "Charles Leclerc"          # optional, shown post-race
 *       circuit: "Circuit de Monaco"       # optional override of bundled circuit name
 *       accent: "#CE1126"                  # override bundled GP accent
 *       backgroundImage: "https://…"       # horizontal/portrait layouts only
 */

export type RaceCardLayout = 'compact' | 'horizontal' | 'portrait' | 'score'

const LAYOUTS: readonly RaceCardLayout[] = ['compact', 'horizontal', 'portrait', 'score']

export interface RaceCardConfig {
  type: 'f1:race-card'
  layout: RaceCardLayout
  /** Grand Prix display name, e.g. "Monaco Grand Prix". */
  grandPrix: string
  /** Season year. */
  season: number
  /** Round number within the season, shown on portrait + horizontal. */
  round?: number
  /** ISO `YYYY-MM-DD` race date — used by `dateLabel` fallback. */
  date?: string
  /** Free-form session label, e.g. "2:00 PM", "Race · Sun 14:00", "Qualifying". */
  sessionLabel?: string
  /** Winning driver display name. Shown when the race has run. */
  winner?: string
  /** Optional circuit override. Bundled palette supplies a default. */
  circuit?: string
  /** Optional hex override for the accent color. */
  accent?: string
  /** Optional flag URL override (defaults to flagcdn.com via the bundled code). */
  flagUrl?: string
  /** Optional hero background image (horizontal + portrait layouts). */
  backgroundImage?: string
  /** Override the date label shown on portrait/horizontal. */
  dateLabel?: string
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function parseLayout(raw: unknown, label: string): RaceCardLayout {
  if (raw === undefined || raw === null) return 'score'
  if (typeof raw !== 'string' || !LAYOUTS.includes(raw as RaceCardLayout)) {
    throw new Error(
      `${label}: f1:race-card 'layout' must be one of ${LAYOUTS.join(', ')} (got ${String(raw)})`,
    )
  }
  return raw as RaceCardLayout
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): RaceCardConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: f1:race-card layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.grandPrix !== 'string' || r.grandPrix.length === 0) {
    throw new Error(`${ctx.label}: f1:race-card requires 'grandPrix' (display name or slug)`)
  }
  const seasonRaw = r.season
  let season: number | undefined
  if (typeof seasonRaw === 'number') season = seasonRaw
  else if (typeof seasonRaw === 'string' && /^\d{4}$/.test(seasonRaw)) season = Number(seasonRaw)
  if (season === undefined) {
    throw new Error(`${ctx.label}: f1:race-card requires numeric 'season' (e.g. 2026)`)
  }
  return {
    type: 'f1:race-card',
    layout: parseLayout(r.layout, ctx.label),
    grandPrix: r.grandPrix,
    season,
    round: asNumber(r.round),
    date: asString(r.date),
    sessionLabel: asString(r.sessionLabel),
    winner: asString(r.winner),
    circuit: asString(r.circuit),
    accent: asString(r.accent),
    flagUrl: asString(r.flagUrl),
    backgroundImage: asString(r.backgroundImage),
    dateLabel: asString(r.dateLabel),
  }
}

function adminForm(): AdminFormField[] {
  return [
    {
      kind: 'select',
      key: 'layout',
      label: 'Layout',
      options: LAYOUTS.map((l) => ({ value: l, label: l })),
    },
    { kind: 'text', key: 'grandPrix', label: 'Grand Prix (name or slug)', required: true },
    { kind: 'number', key: 'season', label: 'Season', min: 1950, max: 2100 },
    { kind: 'number', key: 'round', label: 'Round' },
    { kind: 'text', key: 'date', label: 'Race date (YYYY-MM-DD)' },
    { kind: 'text', key: 'sessionLabel', label: 'Session label (e.g. "2:00 PM")' },
    { kind: 'text', key: 'winner', label: 'Winner (post-race)' },
    { kind: 'text', key: 'circuit', label: 'Circuit name override' },
    { kind: 'text', key: 'accent', label: 'Accent color override (hex)' },
    { kind: 'text', key: 'flagUrl', label: 'Flag URL override' },
    { kind: 'text', key: 'backgroundImage', label: 'Hero background image URL' },
    { kind: 'text', key: 'dateLabel', label: 'Date label override (portrait)' },
  ]
}

const raceCardModule: VizModule<RaceCardConfig> = {
  type: 'f1:race-card',
  label: 'F1 — race card',
  slots: ['foreground'],
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (config) =>
    `f1:race-card:${config.layout}:${config.season}:${config.grandPrix}`,
}

export default raceCardModule
