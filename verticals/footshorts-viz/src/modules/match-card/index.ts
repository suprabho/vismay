import type { VizModule, AdminFormField } from '@vismay/viz-engine'

/**
 * `fs:match-card` — editorial fixture card with multiple layout variants.
 *
 * Variants — compact / horizontal / portrait / score — all draw from the
 * same config. Team crests, brand colors, and competition tags come from
 * the bundled palette in `../../data/teams.ts` and `competitions.ts`;
 * authors override per-card via the optional URL / hex fields below.
 *
 * Story YAML:
 *
 *   foreground:
 *     - type: fs:match-card
 *       layout: horizontal
 *       home: "Arsenal"        # display name or slug — bundled palette is matched on both
 *       away: "Chelsea"
 *       score: "2 – 1"
 *       kickoff: "1:30 PM"
 *       competition: "Premier League · matchday 35"
 *       competitionSlug: prem  # picks the watermark tag; falls back to slugified competition
 *       homeColor: "#EF0107"   # YAML override; bundled palette otherwise
 *       backgroundImage: "https://…"  # horizontal/portrait only; gradient otherwise
 */

export type MatchCardLayout = 'compact' | 'horizontal' | 'portrait' | 'score'

const LAYOUTS: readonly MatchCardLayout[] = ['compact', 'horizontal', 'portrait', 'score']

export interface MatchCardConfig {
  type: 'fs:match-card'
  layout: MatchCardLayout
  home: string
  away: string
  /** "2–1" / "FT" / "Live" / etc. — free-form display string. */
  score?: string
  /** Pre-match kickoff label, e.g. "1:30 PM" or "Sat · 17:30". */
  kickoff?: string
  /** Full competition line, e.g. "Premier League · matchday 35". */
  competition?: string
  /** Optional slug into the bundled competition palette. Falls back to slugified `competition`. */
  competitionSlug?: string
  /** Optional accent color override (hex). Defaults to the theme's accent. */
  accent?: string
  /** Box fill of the score-layout card. Any CSS color/gradient; defaults to a light warm panel (`#FBF7EF`). */
  cardColor?: string
  /** Border color of the score-layout card. Defaults to the accent. */
  borderColor?: string
  /** Team-name / date text color on the score-layout card. Defaults to deep navy (`#1D2A4A`); pair a light value with a dark `cardColor`. */
  textColor?: string
  /** Hex override for the home team's brand color. Bundled palette is the default. */
  homeColor?: string
  /** Hex override for the away team's brand color. */
  awayColor?: string
  /** Optional crest URLs. If omitted, an inline-SVG placeholder is drawn from the bundled palette. */
  homeCrestUrl?: string
  awayCrestUrl?: string
  /** Optional URL for a hero background image (horizontal + portrait layouts). */
  backgroundImage?: string
  /** Optional "Watch on …" line shown on the portrait layout. */
  watchOn?: string
  /** Date label shown on the portrait layout, e.g. "Thursday, Jun 5". */
  dateLabel?: string
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function parseLayout(raw: unknown, label: string): MatchCardLayout {
  if (raw === undefined || raw === null) return 'score'
  if (typeof raw !== 'string' || !LAYOUTS.includes(raw as MatchCardLayout)) {
    throw new Error(
      `${label}: fs:match-card 'layout' must be one of ${LAYOUTS.join(', ')} (got ${String(raw)})`,
    )
  }
  return raw as MatchCardLayout
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): MatchCardConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fs:match-card layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.home !== 'string' || r.home.length === 0) {
    throw new Error(`${ctx.label}: fs:match-card requires 'home' (team name or slug)`)
  }
  if (typeof r.away !== 'string' || r.away.length === 0) {
    throw new Error(`${ctx.label}: fs:match-card requires 'away' (team name or slug)`)
  }
  return {
    type: 'fs:match-card',
    layout: parseLayout(r.layout, ctx.label),
    home: r.home,
    away: r.away,
    score: asString(r.score),
    kickoff: asString(r.kickoff),
    competition: asString(r.competition),
    competitionSlug: asString(r.competitionSlug),
    accent: asString(r.accent),
    cardColor: asString(r.cardColor),
    borderColor: asString(r.borderColor),
    textColor: asString(r.textColor),
    homeColor: asString(r.homeColor),
    awayColor: asString(r.awayColor),
    homeCrestUrl: asString(r.homeCrestUrl),
    awayCrestUrl: asString(r.awayCrestUrl),
    backgroundImage: asString(r.backgroundImage),
    watchOn: asString(r.watchOn),
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
    { kind: 'text', key: 'home', label: 'Home team', required: true },
    { kind: 'text', key: 'away', label: 'Away team', required: true },
    { kind: 'text', key: 'score', label: 'Score / status (e.g. "2 – 1", "Live")' },
    { kind: 'text', key: 'kickoff', label: 'Kickoff label (e.g. "1:30 PM")' },
    { kind: 'text', key: 'competition', label: 'Competition line' },
    { kind: 'text', key: 'competitionSlug', label: 'Competition slug (palette key)' },
    { kind: 'text', key: 'homeColor', label: 'Home color override (hex)' },
    { kind: 'text', key: 'awayColor', label: 'Away color override (hex)' },
    { kind: 'text', key: 'homeCrestUrl', label: 'Home crest URL' },
    { kind: 'text', key: 'awayCrestUrl', label: 'Away crest URL' },
    { kind: 'text', key: 'backgroundImage', label: 'Hero background image URL' },
    { kind: 'text', key: 'watchOn', label: 'Watch-on line (portrait layout)' },
    { kind: 'text', key: 'dateLabel', label: 'Date label (portrait layout)' },
    { kind: 'text', key: 'accent', label: 'Accent color override (hex)' },
    { kind: 'text', key: 'cardColor', label: 'Card box color (score layout)' },
    { kind: 'text', key: 'borderColor', label: 'Card border color (score layout)' },
    { kind: 'text', key: 'textColor', label: 'Card text color (score layout)' },
  ]
}

const matchCardModule: VizModule<MatchCardConfig> = {
  type: 'fs:match-card',
  label: 'Footshorts — match card',
  slots: ['foreground'],
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (config) =>
    `fs:match-card:${config.layout}:${config.home}::${config.away}::${config.score ?? ''}`,
}

export default matchCardModule
