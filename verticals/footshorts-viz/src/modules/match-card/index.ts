import type { VizModule, AdminFormField } from '@vismay/viz-engine'
import {
  type FsBackgroundConfig,
  fsBackgroundFields,
  parseFsBackground,
} from '../shared/background'
import { parsePositiveInt, parsePositiveNumber } from '../shared/grid'

/**
 * `fs:match-card` — editorial fixture card with multiple layout variants.
 *
 * Variants — compact / horizontal / portrait / score — all draw from the
 * same single-fixture config (`home`/`away` + score/kickoff/competition). The
 * `grid` variant instead tiles several fixtures from `cards[]` as score cards
 * (the same editorial card as the `score` layout) in a `columns`-wide matrix
 * (like `fs:team-form-strip`'s grid).
 *
 * Team crests, brand colors, and competition tags come from the bundled palette
 * in `../../data/teams.ts` and `competitions.ts`; authors override per-card via
 * the optional URL / hex fields below.
 *
 * Every variant also accepts the shared image-background fields
 * (`backgroundImage` / `backgroundFit` / `backgroundDim` / `backgroundBlur`) —
 * see `../shared/background`. Note `horizontal`/`portrait` keep their existing
 * hero treatment (the image is blended into the card gradient); `compact` /
 * `score` / `grid` paint it as a backdrop behind the content.
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
 *       backgroundImage: "https://…"  # hero on horizontal/portrait; backdrop otherwise
 *
 *   # grid variant — tile several fixtures:
 *     - type: fs:match-card
 *       layout: grid
 *       columns: 2             # cards per row (default 2)
 *       rows: 2                # optional — caps to rows × columns
 *       cards:
 *         - { home: Arsenal, away: Chelsea, score: "2 – 1", competition: "Prem" }
 *         - { home: Liverpool, away: "Man City", score: "1 – 1" }
 */

export type MatchCardLayout = 'compact' | 'horizontal' | 'portrait' | 'score' | 'grid'

const LAYOUTS: readonly MatchCardLayout[] = [
  'compact',
  'horizontal',
  'portrait',
  'score',
  'grid',
]

/** One fixture in the `grid` variant — the per-card subset of the single-card fields. */
export interface MatchCardItem {
  home: string
  away: string
  score?: string
  kickoff?: string
  competition?: string
  competitionSlug?: string
  homeColor?: string
  awayColor?: string
  homeCrestUrl?: string
  awayCrestUrl?: string
}

export interface MatchCardConfig extends FsBackgroundConfig {
  type: 'fs:match-card'
  layout: MatchCardLayout
  home: string
  away: string
  /** "2–1" / "FT" / "Live" / etc. — free-form display string. */
  score?: string
  /** Pre-match kickoff label, e.g. "1:30 PM" or "Sat · 17:30". */
  kickoff?: string
  /** Full-time status shown under the score on the horizontal layout. Defaults
   *  to "FT"; set to "PEN" / "AET" when a tie was decided in a shootout / extra time. */
  statusLabel?: string
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
  /** Grid variant — fixtures tiled as compact cards (author order). */
  cards?: MatchCardItem[]
  /** Grid only — cards per row. Defaults to 2. */
  columns?: number
  /** Grid only — caps visible cards to `rows × columns` (first ones kept). */
  rows?: number
  /** Grid only — uniform fixed card width in px. */
  cardWidth?: number
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

function parseCards(raw: unknown, label: string): MatchCardItem[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`${label}: fs:match-card grid layout requires a non-empty 'cards' array`)
  }
  return raw.map((c, i) => {
    if (!c || typeof c !== 'object') {
      throw new Error(`${label}: fs:match-card cards[${i}] must be an object`)
    }
    const r = c as Record<string, unknown>
    if (typeof r.home !== 'string' || r.home.length === 0) {
      throw new Error(`${label}: fs:match-card cards[${i}] requires 'home'`)
    }
    if (typeof r.away !== 'string' || r.away.length === 0) {
      throw new Error(`${label}: fs:match-card cards[${i}] requires 'away'`)
    }
    return {
      home: r.home,
      away: r.away,
      score: asString(r.score),
      kickoff: asString(r.kickoff),
      competition: asString(r.competition),
      competitionSlug: asString(r.competitionSlug),
      homeColor: asString(r.homeColor),
      awayColor: asString(r.awayColor),
      homeCrestUrl: asString(r.homeCrestUrl),
      awayCrestUrl: asString(r.awayCrestUrl),
    }
  })
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): MatchCardConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fs:match-card layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  const layout = parseLayout(r.layout, ctx.label)

  if (layout === 'grid') {
    const cards = parseCards(r.cards, ctx.label)
    const columns = parsePositiveInt(r.columns, 'columns', ctx.label)
    const rows = parsePositiveInt(r.rows, 'rows', ctx.label)
    const cardWidth = parsePositiveNumber(r.cardWidth, 'cardWidth', ctx.label)
    return {
      type: 'fs:match-card',
      layout,
      // Top-level home/away are unused in grid mode, but the type keeps them
      // required (the four single-card layouts read them directly), so mirror
      // the first card to stay consistent.
      home: cards[0]!.home,
      away: cards[0]!.away,
      cards,
      ...(columns !== undefined ? { columns } : {}),
      ...(rows !== undefined ? { rows } : {}),
      ...(cardWidth !== undefined ? { cardWidth } : {}),
      // Editorial theming applied uniformly to every tile (each card also picks
      // up its own competition accent when these are omitted).
      accent: asString(r.accent),
      cardColor: asString(r.cardColor),
      borderColor: asString(r.borderColor),
      textColor: asString(r.textColor),
      ...parseFsBackground(r),
    }
  }

  if (typeof r.home !== 'string' || r.home.length === 0) {
    throw new Error(`${ctx.label}: fs:match-card requires 'home' (team name or slug)`)
  }
  if (typeof r.away !== 'string' || r.away.length === 0) {
    throw new Error(`${ctx.label}: fs:match-card requires 'away' (team name or slug)`)
  }
  return {
    type: 'fs:match-card',
    layout,
    home: r.home,
    away: r.away,
    score: asString(r.score),
    kickoff: asString(r.kickoff),
    statusLabel: asString(r.statusLabel),
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
    ...parseFsBackground(r),
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
    { kind: 'text', key: 'statusLabel', label: 'Full-time status (e.g. "FT", "PEN", "AET")' },
    { kind: 'text', key: 'competition', label: 'Competition line' },
    { kind: 'text', key: 'competitionSlug', label: 'Competition slug (palette key)' },
    { kind: 'text', key: 'homeColor', label: 'Home color override (hex)' },
    { kind: 'text', key: 'awayColor', label: 'Away color override (hex)' },
    { kind: 'text', key: 'homeCrestUrl', label: 'Home crest URL' },
    { kind: 'text', key: 'awayCrestUrl', label: 'Away crest URL' },
    // `backgroundImage` is supplied by fsBackgroundFields() below (it doubles as
    // the hero image on horizontal/portrait), so it isn't listed separately here.
    { kind: 'text', key: 'watchOn', label: 'Watch-on line (portrait layout)' },
    { kind: 'text', key: 'dateLabel', label: 'Date label (portrait layout)' },
    { kind: 'text', key: 'accent', label: 'Accent color override (hex)' },
    { kind: 'text', key: 'cardColor', label: 'Card box color (score layout)' },
    { kind: 'text', key: 'borderColor', label: 'Card border color (score layout)' },
    { kind: 'text', key: 'textColor', label: 'Card text color (score layout)' },
    { kind: 'json', key: 'cards', label: 'Cards (grid layout)' },
    { kind: 'number', key: 'columns', label: 'Columns (grid only)', min: 1, step: 1 },
    { kind: 'number', key: 'rows', label: 'Rows (grid only — caps to rows × columns)', min: 1, step: 1 },
    { kind: 'number', key: 'cardWidth', label: 'Card width in px (grid; uniform)', min: 1, step: 1 },
    ...fsBackgroundFields(),
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
  stableIdentity: (config) => {
    if (config.layout === 'grid') {
      const ids = (config.cards ?? [])
        .map((c) => `${c.home}>${c.away}:${c.score ?? ''}`)
        .join('|')
      return `fs:match-card:grid:${config.columns ?? ''}x${config.rows ?? ''}:${config.cardWidth ?? ''}:${ids}:${config.backgroundImage ?? ''}`
    }
    return `fs:match-card:${config.layout}:${config.home}::${config.away}::${config.score ?? ''}:${config.backgroundImage ?? ''}`
  },
}

export default matchCardModule
