/**
 * Season-spreads books (plan v2): the Books tab's second format.
 *
 * A v1 book is ~60 claim spreads per season (plan.ts). A v2 book is built
 * from four kinds of data spread in the team-spread visual language: a league
 * spread per league, one team spread per club, a competition spread per
 * European and domestic cup, and honourable mentions (team spreads for clubs
 * outside the covered leagues). The planner decides what the book carries and
 * in what order (Roster), shows every spread (Spreads), works one at a time
 * (Editor, with its tabs), pages the book (Flatplan) and shows the system.
 *
 * What lives here: the plan v2 schema and its parts, the spread keys, the
 * editor tabs per template, the module and check registries from the spec,
 * the book maths (spread list, page count, KDP limit), the editorial checks
 * that run without a data pack, and the one-way v1 → v2 conversion.
 *
 * Interim storage: until `admin_book_spreads` lands, a spread's editorial
 * row is kept on the book plan under `spreads[key]`, in the row's own shape,
 * so the move to its own table is a data move, not a redesign.
 *
 * Shared by the admin planner (client) and the books API (server validation).
 */
import { z } from 'zod'
import {
  beatSchema, emptySpread, planSchema, seasonLabel, seasonMonths, spreadSchema, wordCount,
  type Beat, type Plan,
} from './plan'
import { leagueMatches, standings, type MatchRow } from './matches'

// ---------------------------------------------------------------------------
// Formats

export const BOOK_FORMATS = {
  'claim-spreads': 'Claim spreads',
  'season-spreads': 'Season spreads',
} as const
export type BookFormat = keyof typeof BOOK_FORMATS

// ---------------------------------------------------------------------------
// Scope catalogue: the competitions a book can carry, as
// `admin_historical_matches.competition` spells the ones with match data.

/** Leagues a book can carry, in book order. The five big leagues first; the context leagues are offered but off by default. */
export const BOOK_LEAGUES = ['Premier League', 'LaLiga', 'Serie A', 'Bundesliga', 'Ligue 1', 'Championship', 'Eredivisie', 'Primeira Liga', 'Scottish Premiership'] as const
export const DEFAULT_LEAGUES: readonly string[] = BOOK_LEAGUES.slice(0, 5)

export const LEAGUE_COUNTRY: Record<string, string> = {
  'Premier League': 'England', Championship: 'England', LaLiga: 'Spain', 'Serie A': 'Italy', Bundesliga: 'Germany',
  'Ligue 1': 'France', Eredivisie: 'Netherlands', 'Primeira Liga': 'Portugal', 'Scottish Premiership': 'Scotland',
}

/** Cups the catalogue offers but a new book leaves off (open question: minor cups may not carry a spread). */
export const MINOR_CUPS = new Set(['DFB-Ligapokal'])

/** National and league cups by country, in the order they sit in the book. */
export const DOMESTIC_CUPS: Record<string, readonly string[]> = {
  England: ['FA Cup', 'League Cup'],
  Spain: ['Copa del Rey'],
  Italy: ['Coppa Italia'],
  Germany: ['DFB-Pokal', 'DFB-Ligapokal'],
  France: ['Coupe de France', 'Coupe de la Ligue'],
  Netherlands: ['KNVB Cup'],
  Portugal: ['Taça de Portugal'],
  Scotland: ['Scottish Cup', 'Scottish League Cup'],
}

/** The European competitions of a season, by the names they carried then. */
export function europeanCompetitionsFor(seasonStart: number): string[] {
  const out = ['Champions League', seasonStart >= 2009 ? 'Europa League' : 'UEFA Cup']
  if (seasonStart >= 2021) out.push('Conference League')
  if (seasonStart <= 2007) out.push('Intertoto Cup')
  return out
}

/** Competitions the admin match table holds (the rest are offered without match data for now). */
export const COMPETITIONS_WITH_MATCHES = new Set<string>([...BOOK_LEAGUES, 'Champions League'])

/** Short codes for league and competition marks. */
export const COMPETITION_CODES: Record<string, string> = {
  'Premier League': 'EPL', LaLiga: 'LIG', 'Serie A': 'SEA', Bundesliga: 'BUN', 'Ligue 1': 'L1', Championship: 'CHA',
  Eredivisie: 'ERE', 'Primeira Liga': 'PRI', 'Scottish Premiership': 'SPL',
  'Champions League': 'UCL', 'UEFA Cup': 'UC', 'Europa League': 'EL', 'Conference League': 'ECL', 'Intertoto Cup': 'UIC',
  'FA Cup': 'FAC', 'League Cup': 'LC', 'Copa del Rey': 'CDR', 'Coppa Italia': 'CI', 'DFB-Pokal': 'DFB', 'DFB-Ligapokal': 'LP',
  'Coupe de France': 'CDF', 'Coupe de la Ligue': 'CDL', 'KNVB Cup': 'KNVB', 'Taça de Portugal': 'TDP', 'Scottish Cup': 'SC', 'Scottish League Cup': 'SLC',
}

export function competitionCode(name: string): string {
  return COMPETITION_CODES[name] ?? name.replace(/[^A-Z0-9]/g, '').slice(0, 3).toUpperCase()
}

// ---------------------------------------------------------------------------
// Spread kinds, keys and templates

export type SpreadKind = 'league' | 'team' | 'competition'

export const SPREAD_KINDS: Record<SpreadKind, { label: string; template: string; letter: string; className: string }> = {
  league: { label: 'League spread', template: 'league@1.0', letter: 'L', className: 'bg-amber-400 text-neutral-950' },
  team: { label: 'Team spread', template: 'team@1.2', letter: 'T', className: 'bg-sky-400 text-neutral-950' },
  competition: { label: 'Competition spread', template: 'competition@1.0', letter: 'C', className: 'bg-emerald-400 text-neutral-950' },
}

/** `Deportivo La Coruña` → `deportivo-la-coruna`: the id part of a spread key. */
export function slugId(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x'
}

export const spreadKeySchema = z.string().regex(/^(league|team|comp):[\w-]+$/)
export type SpreadKey = z.infer<typeof spreadKeySchema>

export function spreadKeyFor(kind: SpreadKind, subjectId: string): SpreadKey {
  return `${kind === 'competition' ? 'comp' : kind}:${slugId(subjectId)}`
}

export function spreadKindOf(key: string): SpreadKind | null {
  const prefix = key.split(':')[0]
  return prefix === 'league' || prefix === 'team' ? prefix : prefix === 'comp' ? 'competition' : null
}

// ---------------------------------------------------------------------------
// Plan v2 schema

const id = z.string().min(1).max(40).regex(/^[\w-]+$/)
const text = (max: number) => z.string().max(max)
const competition = text(80)
const teamId = text(80)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const urlOrBlank = z.string().max(500).refine(s => s === '' || /^https?:\/\//.test(s), 'Expected an http(s) URL')

export const partSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('intro') }),
  z.object({
    kind: z.literal('league'), id, league: competition,
    order: z.enum(['final-position', 'manual']),
    /** Included clubs, in book order (final position unless manual). */
    teams: z.array(teamId).max(24),
    excluded: z.array(z.object({ teamId, reason: text(200) })).max(24),
  }),
  z.object({ kind: z.literal('european'), id, competitions: z.array(competition).max(4) }),
  z.object({ kind: z.literal('domestic'), id, countries: z.array(z.object({ country: text(40), competitions: z.array(competition).max(6) })).max(10) }),
  z.object({ kind: z.literal('honourable'), id, teams: z.array(z.object({ teamId, league: competition, reason: text(200) })).max(6) }),
  z.object({ kind: z.literal('outro') }),
])
export type Part = z.infer<typeof partSchema>
export type LeaguePart = Extract<Part, { kind: 'league' }>
export type HonourablePart = Extract<Part, { kind: 'honourable' }>

export const BOOK_SPREAD_STATUSES = {
  data: 'Data',
  draft: 'Draft',
  checked: 'Checked',
  approved: 'Approved',
  'handed-off': 'Handed off',
} as const
export type BookSpreadStatus = keyof typeof BOOK_SPREAD_STATUSES
export const BOOK_SPREAD_STATUS_ORDER = Object.keys(BOOK_SPREAD_STATUSES) as BookSpreadStatus[]

/** Who sets a status and what it means. */
export const STATUS_META: Record<BookSpreadStatus, { by: string; means: string; dot: string }> = {
  data: { by: 'Builder', means: 'Pack built, every module renders from data, editorial fields empty', dot: 'bg-neutral-600' },
  draft: { by: 'Editor (or Claude draft)', means: 'Headline, story, moments and the template’s own text fields filled', dot: 'bg-sky-400' },
  checked: { by: 'Editor', means: 'All blocking checks pass or carry an override with a reason', dot: 'bg-violet-400' },
  approved: { by: 'Second editor', means: 'Snapshot frozen (pack + SVG); later pack rebuilds flag the spread instead of changing it', dot: 'bg-emerald-400' },
  'handed-off': { by: 'Export', means: 'Included in an InDesign package', dot: 'bg-amber-400' },
}

export const PALETTE_ROLES = ['page1Ground', 'page2Ground', 'accent', 'eliminationCard', 'highlight', 'text', 'draw', 'grid', 'card'] as const
export type PaletteRole = (typeof PALETTE_ROLES)[number]
export const PALETTE_ROLE_LABELS: Record<PaletteRole, string> = {
  page1Ground: 'Page 1 ground', page2Ground: 'Page 2 ground', accent: 'Accent', eliminationCard: 'Elimination card',
  highlight: 'Highlight', text: 'Text', draw: 'Draw', grid: 'Grid', card: 'Card',
}
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const momentSchema = z.object({ date: isoDate, text: text(120), eventId: z.string().max(80).nullable() })
export type Moment = z.infer<typeof momentSchema>

/** Fields every template has (Story, Moments, Modules notes). */
const editorialSchema = z.object({
  /** 2 lines at 55 pt, uppercase. */
  headline: text(40),
  storyStat: z.object({ value: text(16), label: text(48), source: text(120).nullable() }),
  /** ≤ 30 words, checked. */
  story: text(240),
  moments: z.array(momentSchema).max(4),
  /** Clubs or players drawn in colour; the rest are context. */
  highlight: z.array(text(80)).max(4),
  notes: z.record(z.string().max(40), text(300)),
})

const teamEditorialSchema = z.object({
  turningPoint: isoDate.nullable(),
  cupParagraphs: z.record(competition, text(300)),
  cupVariant: z.record(competition, z.enum(['rail', 'ladder'])),
  coach: z.object({ name: text(80), context: text(200), assistants: text(120), sourceUrl: urlOrBlank }),
  xiSplitDate: isoDate.nullable(),
  storyPlayers: z.array(text(80)).max(10),
  heatmapPlayers: z.array(text(80)).max(4),
})
const leagueEditorialSchema = z.object({
  awards: z.array(z.object({ name: text(60), sourceUrl: urlOrBlank })).max(12),
  leadAnnotations: z.array(z.object({ date: isoDate, text: text(120) })).max(2),
  halfwayNote: text(200),
})
const competitionEditorialSchema = z.object({
  oddities: z.array(z.object({ text: text(120), source: text(120) })).max(6),
  pinned: z.array(text(80)).max(4),
  mapGrouping: z.enum(['country', 'division']),
})

export const bookSpreadSchema = z.object({
  key: spreadKeySchema,
  kind: z.enum(['league', 'team', 'competition']),
  subjectId: text(80),
  part: text(40),
  templateVersion: text(24),
  status: z.enum(BOOK_SPREAD_STATUS_ORDER as [BookSpreadStatus, ...BookSpreadStatus[]]),
  editorial: editorialSchema,
  team: teamEditorialSchema.nullable(),
  league: leagueEditorialSchema.nullable(),
  competition: competitionEditorialSchema.nullable(),
  modules: z.record(z.string().max(40), z.object({ enabled: z.boolean(), variant: z.string().max(40).nullable(), nudge: z.object({ dx: z.number(), dy: z.number() }).nullable() })),
  /** Only roles that differ from the derived palette. */
  palette: z.record(z.enum(PALETTE_ROLES), hex).nullable(),
  pack: z.object({ id: z.string().max(80), hash: z.string().max(80), builtAt: z.string().max(40) }).nullable(),
  checkOverrides: z.array(z.object({ check: z.string().max(40), reason: text(200), by: z.string().max(200) })).max(40),
})
export type BookSpread = z.infer<typeof bookSpreadSchema>

export const beatV2Schema = beatSchema.extend({ spreadKey: spreadKeySchema.nullable() })
export type BeatV2 = z.infer<typeof beatV2Schema>

export const planV2Schema = z.object({
  version: z.literal(2),
  scope: z.object({
    leagues: z.array(competition).max(10),
    european: z.array(competition).max(4),
    domestic: z.array(competition).max(20),
  }),
  parts: z.array(partSchema).max(24),
  /** The v1 card shape, reused for the three frame spreads. */
  frame: z.object({ cover: spreadSchema, intro: spreadSchema, outro: spreadSchema }),
  beats: z.array(beatV2Schema).max(400),
  /** Archived v1 month spreads of a converted book, read-only, never deleted. */
  legacy: z.array(spreadSchema).max(120).optional(),
  /** Editorial rows by spread key (interim home of `admin_book_spreads`). */
  spreads: z.record(spreadKeySchema, bookSpreadSchema),
})
export type PlanV2 = z.infer<typeof planV2Schema>

export type AnyPlan = Plan | PlanV2

export function isPlanV2(plan: AnyPlan): plan is PlanV2 {
  return 'version' in plan && plan.version === 2
}

export function planFormat(plan: AnyPlan): BookFormat {
  return isPlanV2(plan) ? 'season-spreads' : 'claim-spreads'
}

/** A stored plan parses as v2 when it says so and as v1 otherwise (a plan with no version is v1). */
export function parseAnyPlan(raw: unknown): { success: true; data: AnyPlan } | { success: false; error: string } {
  const version = raw && typeof raw === 'object' ? (raw as { version?: unknown }).version : undefined
  if (version === 2) {
    const r = planV2Schema.safeParse(raw)
    return r.success ? r : { success: false, error: `Invalid plan at ${r.error.issues[0].path.join('.')}: ${r.error.issues[0].message}` }
  }
  if (version !== undefined) return { success: false, error: `Unknown plan version ${String(version)}` }
  const r = planSchema.safeParse(raw)
  return r.success ? r : { success: false, error: `Invalid plan at ${r.error.issues[0].path.join('.')}: ${r.error.issues[0].message}` }
}

// ---------------------------------------------------------------------------
// Views and editor tabs

/** The season-spreads planner's views, in workflow order (`?view=`). */
export const SEASON_BOOK_VIEWS = ['roster', 'spreads', 'editor', 'flatplan', 'system', 'legacy'] as const
export type SeasonBookView = (typeof SEASON_BOOK_VIEWS)[number]
export const isSeasonBookView = (v: unknown): v is SeasonBookView => (SEASON_BOOK_VIEWS as readonly unknown[]).includes(v)

export type EditorTabId = 'story' | 'moments' | 'cups' | 'side' | 'people' | 'race-lead' | 'players' | 'field-bracket' | 'oddities' | 'modules' | 'colour-marks' | 'checks'

export interface EditorTab {
  id: EditorTabId
  label: string
  /** The templates that show the tab; `all` for every spread. */
  templates: 'all' | readonly SpreadKind[]
  fields: string
}

/** The editor panel's tabs (right side). Every spread has Story, Moments, Modules, Colour and marks, and Checks; each template adds its own. */
export const EDITOR_TABS: readonly EditorTab[] = [
  { id: 'story', label: 'Story', templates: 'all', fields: 'Headline (live 2-line fit at 55 pt), story statistic with suggestions derived from the pack, story copy with a 30-word meter' },
  { id: 'moments', label: 'Moments', templates: 'all', fields: 'Up to four dated moments from verified events or match rows; the builder routes their leaders and flags conflicts' },
  { id: 'cups', label: 'Cups', templates: ['team'], fields: 'One paragraph per competition played, cup-run variant (rail, or ladder with group table)' },
  { id: 'side', label: 'Side', templates: ['team'], fields: 'Coach name, context, assistants with a source URL; XI split date (defaults to the turning point)' },
  { id: 'people', label: 'People', templates: ['team'], fields: 'Story players on the bubble chart, the four heatmap players, module notes' },
  { id: 'race-lead', label: 'Race and lead', templates: ['league'], fields: 'Clubs drawn in colour on the race (champion plus up to three), the annotations on the lead strip, the halfway note' },
  { id: 'players', label: 'Players', templates: ['league'], fields: 'Awards shown (team of the year, players of the month, top scorers), each with a source URL' },
  { id: 'field-bracket', label: 'Field and bracket', templates: ['competition'], fields: 'Clubs highlighted on the bracket and pinned on the map (finalists by default), the map’s grouping (country for European competitions, division for domestic cups)' },
  { id: 'oddities', label: 'Oddities', templates: ['competition'], fields: 'Six one-line oddities, each tied to the stat that proves it; the builder proposes candidates from the pack' },
  { id: 'modules', label: 'Modules', templates: 'all', fields: 'Enable, variant and nudge (± pt) per module; reset returns a module to the template' },
  { id: 'colour-marks', label: 'Colour and marks', templates: 'all', fields: 'The derived palette, per-role overrides with a contrast readout, and every club, league or competition mark the spread uses' },
  { id: 'checks', label: 'Checks', templates: 'all', fields: 'Every failing check for this spread, linked to its module; an override needs a reason' },
]

export function editorTabsFor(kind: SpreadKind): EditorTab[] {
  return EDITOR_TABS.filter(t => t.templates === 'all' || t.templates.includes(kind))
}

export const isEditorTab = (v: unknown): v is EditorTabId => EDITOR_TABS.some(t => t.id === v)

// ---------------------------------------------------------------------------
// Modules: what each template draws, where, from which part of the pack, and
// which editor tab drives it (clicking a module on the render opens that tab).

export interface SpreadModule {
  id: string
  label: string
  page: 1 | 2
  data: string
  rules: string
  tab: EditorTabId
  /** A field on that tab the module is driven by, for focusing. */
  field?: string
  variants?: readonly string[]
  optional?: boolean
}

export const SPREAD_MODULES: Record<SpreadKind, readonly SpreadModule[]> = {
  league: [
    { id: 'identity', label: 'Identity', page: 1, data: 'spread row, league marks', rules: 'League flag tile + code, kicker, headline', tab: 'story', field: 'headline' },
    { id: 'story-stat', label: 'Story stat', page: 1, data: 'editorial + pack', rules: 'e.g. “20 → 0”: lead changes before and after 1 February', tab: 'story', field: 'storyStat' },
    { id: 'race', label: 'Race', page: 1, data: 'leagueRounds', rules: 'League points by round for every club; highlighted clubs in colour with end labels, the rest as context; relegation line labelled with its points; halfway marker + note', tab: 'race-lead', field: 'highlight' },
    { id: 'lead', label: 'Lead', page: 1, data: 'leagueRounds', rules: 'Top of the table every matchday as an Aug–May strip coloured by leader; days-at-the-top ranking with club tokens; up to two dated annotations', tab: 'race-lead', field: 'leadAnnotations' },
    { id: 'season-record', label: 'Season record', page: 1, data: 'keyNumbers', rules: 'League games, goals, GF:GA of the champion, other league-wide totals', tab: 'modules' },
    { id: 'table', label: 'Table', page: 2, data: 'standings, matches', rules: 'Final standings with every result in order as W/D/L pips, relegated marked, dashed halfway line, place after R19 and places gained or lost', tab: 'modules' },
    { id: 'players', label: 'Players', page: 2, data: 'awards, scorers', rules: 'Team of the year, players of the month, top scorers; every award with its source', tab: 'players', field: 'awards' },
    { id: 'signings', label: 'Signings', page: 2, data: 'transfers', rules: 'Summer signings above the fee threshold (£5m in 2003–04) with buying and selling club tokens', tab: 'modules' },
  ],
  team: [
    { id: 'identity', label: 'Identity', page: 1, data: 'spread row, club marks', rules: 'Kicker (club / season), headline, club token 64 pt + 3-letter code at x 470', tab: 'story', field: 'headline' },
    { id: 'climb', label: 'Climb', page: 1, data: 'leagueTableByRound', rules: 'Position by round, 1st at top, range fitted to the team; markers at start, turning point, finish; round order, not date order', tab: 'side', field: 'turningPoint' },
    { id: 'calendar', label: 'Calendar', page: 1, data: 'matches', rules: 'Aug–May, 5 × 2 month grids; square league, circle Europe, diamond domestic cup; colour = result; two games on one day sit side by side', tab: 'modules' },
    { id: 'key-moments', label: 'Key moments', page: 1, data: 'editorial + events', rules: 'Up to 4; date ringed on the calendar, orthogonal leaders through the gaps, never crossing', tab: 'moments', field: 'moments' },
    { id: 'season-record', label: 'Season record', page: 1, data: 'keyNumbers', rules: 'League finish, league points, all-comp goals, all-comp W-D-L; labels name the scope', tab: 'modules' },
    { id: 'cup-runs', label: 'Cup runs', page: 2, data: 'matches, groupTables', rules: 'One run per competition played; rail (aligned on the final) or ladder; a group stage expands into a table above the knockout steps; elimination card or champion state; super cups keep the header + single row', tab: 'cups', field: 'cupParagraphs', variants: ['rail', 'ladder'] },
    { id: 'coach', label: 'Coach', page: 2, data: 'keyNumbers.manager, editorial', rules: 'Name, context, assistants, all-comp record; mid-season changes show both coaches with dates', tab: 'side', field: 'coach' },
    { id: 'xis', label: 'XIs', page: 2, data: 'lineups, squad', rules: 'Two most-used XIs split at the turning point; shirt-number dots by squad position; newcomers in accent', tab: 'side', field: 'xiSplitDate' },
    { id: 'transfers', label: 'Transfers', page: 2, data: 'transfers', rules: 'Compact in/out table: player, other club token + code, fee or loan/free, month', tab: 'modules' },
    { id: 'appearances', label: 'Appearances', page: 2, data: 'squad', rules: 'Most appearances, all competitions', tab: 'people', field: 'notes', optional: true },
    { id: 'radar', label: 'Radar', page: 2, data: 'whole-league matches', rules: 'Six league-relative ranks: goals/game, conceded/game, clean sheets, win %, away points/game, cards/game', tab: 'modules' },
    { id: 'bubble', label: 'Bubble', page: 2, data: 'squad', rules: 'Minutes vs goals, area = league appearances, position outlines, collision-avoided labels', tab: 'people', field: 'storyPlayers' },
    { id: 'heatmap', label: 'Heatmap', page: 2, data: 'playerMonths', rules: 'Optional: four players × ten months', tab: 'people', field: 'heatmapPlayers', optional: true },
  ],
  competition: [
    { id: 'identity', label: 'Identity', page: 1, data: 'spread row, competition marks', rules: 'Competition tile (24 × 16 motif, scaled) + code, kicker, headline', tab: 'story', field: 'headline' },
    { id: 'story-stat', label: 'Story stat', page: 1, data: 'editorial + pack', rules: 'e.g. “3 from 4”: Porto’s goals from shots in the final', tab: 'story', field: 'storyStat' },
    { id: 'field', label: 'Field', page: 1, data: 'entrants', rules: 'Choropleth of Europe shaded by clubs per country, finalists pinned at their home cities; the cup variant groups entrants by division instead', tab: 'field-bracket', field: 'pinned', variants: ['country', 'division'] },
    { id: 'bracket', label: 'Bracket', page: 1, data: 'ties', rules: 'Round of 16 to the final in two halves meeting in the centre; club tokens, aggregate bold and legs small, AG, pens and aet markers', tab: 'field-bracket', field: 'highlight' },
    { id: 'season-record', label: 'Season record', page: 1, data: 'keyNumbers', rules: 'Matches with date span, goals, goals per game, home wins', tab: 'modules' },
    { id: 'groups', label: 'Groups', page: 2, data: 'groupTables', rules: 'Every group table, six results in date order, dashed qualification cut, tie-break note; off when the competition has no group stage', tab: 'modules', optional: true },
    { id: 'finalists', label: 'Finalists', page: 2, data: 'matches', rules: 'Every game of both finalists with opponent tokens; the final outlined', tab: 'modules', variants: ['finalists', 'road'] },
    { id: 'final', label: 'Final', page: 2, data: 'finalShots, finalTeam', rules: 'StatsBomb shot map + team comparison when the final has event data; otherwise a match-facts panel; StatsBomb logo placed in InDesign', tab: 'modules' },
    { id: 'scorers', label: 'Scorers', page: 2, data: 'scorers', rules: 'Everyone above a goal threshold (5 for the 2003–04 UCL), qualifying included', tab: 'modules' },
    { id: 'oddities', label: 'Oddities', page: 2, data: 'editorial + pack', rules: 'Six data-derived one-liners, each tied to its proving stat', tab: 'oddities', field: 'oddities' },
  ],
}

export function moduleById(kind: SpreadKind, moduleId: string): SpreadModule | undefined {
  return SPREAD_MODULES[kind].find(m => m.id === moduleId)
}

// ---------------------------------------------------------------------------
// Checks registry (what the builder runs on every render). The ones that need
// only the editorial row run here; the rest wait for a pack and a layout.

export type CheckLevel = 'block' | 'warn'

export interface SpreadCheck {
  id: string
  level: CheckLevel
  applies: 'all' | 'book' | readonly SpreadKind[]
  rule: string
  /** True when the check can run on the editorial row alone (no pack, no layout). */
  local?: boolean
}

export const SPREAD_CHECKS: readonly SpreadCheck[] = [
  { id: 'reconcile', level: 'block', applies: 'all', rule: 'Every total on the spread equals the pack’s keyNumbers' },
  { id: 'geometry', level: 'block', applies: 'all', rule: 'Nothing within 40 pt of the fold or outside the canvas, no type under 6.5 pt, no text overflow, every legend present' },
  { id: 'marks-complete', level: 'block', applies: 'all', rule: 'Every club token on the spread has a verified admin_club_marks row for that season; league and competition marks exist' },
  { id: 'contrast', level: 'block', applies: 'all', rule: 'Palette passes the contrast rules in Design system v2', local: true },
  { id: 'sourced', level: 'block', applies: 'all', rule: 'Coach context, fees, awards and any fact outside the pack carry a source URL', local: true },
  { id: 'calendar-complete', level: 'block', applies: ['team'], rule: 'Every competitive match appears once, on its real date, with the right shape and colour; friendlies excluded' },
  { id: 'leaders', level: 'block', applies: ['team'], rule: 'Each key-moment leader lands on its own date ring and crosses no other leader or match mark' },
  { id: 'cup-format', level: 'block', applies: ['team', 'competition'], rule: 'Each cup run, group and bracket matches the season’s real format; aggregates from the right side' },
  { id: 'squad-match', level: 'block', applies: ['team'], rule: 'XIs, shirt numbers, bubble values, heatmap cells and transfer rows match the pack' },
  { id: 'table-match', level: 'block', applies: ['league'], rule: 'Final table and every result pip match standings computed from matches.csv' },
  { id: 'lead-match', level: 'block', applies: ['league'], rule: 'Leader per matchday and days at the top match the computed table' },
  { id: 'field-count', level: 'block', applies: ['competition'], rule: 'Clubs and countries on the map equal the entrants list, qualifying included' },
  { id: 'statsbomb-credit', level: 'block', applies: ['competition', 'team'], rule: 'Any module drawn from StatsBomb data carries the credit, and the handoff flags the logo' },
  { id: 'headline-fit', level: 'warn', applies: 'all', rule: 'Headline fits two lines at 55 pt without tracking below 0', local: true },
  { id: 'copy-length', level: 'warn', applies: 'all', rule: 'Story ≤ 30 words; paragraphs, notes and oddities ≤ 40 words', local: true },
  { id: 'moments', level: 'warn', applies: ['team', 'league'], rule: 'Moments inside the season and placeable without crossing', local: true },
  { id: 'optional-dropped', level: 'warn', applies: 'all', rule: 'Reflow switched off an optional module' },
  { id: 'pack-stale', level: 'warn', applies: 'all', rule: 'The pack changed since the spread was approved' },
  { id: 'roster-complete', level: 'block', applies: 'book', rule: 'Every club in each in-scope league, and every in-scope competition, is included or excluded with a reason' },
  { id: 'honourable-reason', level: 'block', applies: 'book', rule: 'Every honourable mention carries an editor’s reason' },
  { id: 'page-count', level: 'block', applies: 'book', rule: 'Total pages are even and within the chosen KDP format’s limit' },
  { id: 'headline-unique', level: 'warn', applies: 'book', rule: 'No two spreads in one book share a headline' },
  { id: 'palette-clash', level: 'warn', applies: 'book', rule: 'Consecutive spreads in one part do not use near-identical grounds' },
]

export function checksFor(kind: SpreadKind): SpreadCheck[] {
  return SPREAD_CHECKS.filter(c => c.applies === 'all' || (c.applies !== 'book' && c.applies.includes(kind)))
}

// ---------------------------------------------------------------------------
// Book structure: parts → the spreads the book carries, in reading order

export interface PlannedSpread {
  key: SpreadKey
  kind: SpreadKind
  subjectId: string
  /** The club, league or competition name as printed. */
  label: string
  /** Part id (`intro`, the league part's id, `european`, `domestic`, `honourable`, `outro`). */
  part: string
  partLabel: string
  /** Honourable mentions: why the club is in the book. */
  reason?: string
  /** Team spreads: the club's own league. */
  league?: string
}

export const PART_LABELS = { intro: 'Introduction', european: 'European competitions', domestic: 'Domestic competitions', honourable: 'Honourable mentions', outro: 'Season in numbers' } as const

export function partLabel(part: Part): string {
  switch (part.kind) {
    case 'league': return LEAGUE_COUNTRY[part.league] ?? part.league
    case 'intro': case 'european': case 'domestic': case 'honourable': case 'outro': return PART_LABELS[part.kind]
  }
}

export function partId(part: Part): string {
  return part.kind === 'intro' || part.kind === 'outro' ? part.kind : part.id
}

/** Every league, team and competition spread the parts call for, in book order (frame spreads aside). */
export function bookSpreads(plan: PlanV2): PlannedSpread[] {
  const out: PlannedSpread[] = []
  for (const part of plan.parts) {
    const pl = partLabel(part)
    if (part.kind === 'league') {
      out.push({ key: spreadKeyFor('league', part.league), kind: 'league', subjectId: part.league, label: part.league, part: part.id, partLabel: pl })
      for (const team of part.teams) out.push({ key: spreadKeyFor('team', team), kind: 'team', subjectId: team, label: team, part: part.id, partLabel: pl, league: part.league })
    } else if (part.kind === 'european') {
      for (const c of part.competitions) out.push({ key: spreadKeyFor('competition', c), kind: 'competition', subjectId: c, label: c, part: part.id, partLabel: pl })
    } else if (part.kind === 'domestic') {
      for (const country of part.countries) for (const c of country.competitions) out.push({ key: spreadKeyFor('competition', c), kind: 'competition', subjectId: c, label: c, part: part.id, partLabel: `${pl} · ${country.country}` })
    } else if (part.kind === 'honourable') {
      for (const t of part.teams) out.push({ key: spreadKeyFor('team', t.teamId), kind: 'team', subjectId: t.teamId, label: t.teamId, part: part.id, partLabel: pl, reason: t.reason, league: t.league })
    }
  }
  // The same club or cup can only be in the book once; the first part keeps it.
  const seen = new Set<string>()
  return out.filter(s => !seen.has(s.key) && seen.add(s.key))
}

/** Frame spreads first and last: cover, intro, …, outro. */
export const FRAME_SPREADS = 3
export const PAGES_PER_SPREAD = 2
/** KDP premium colour hardcover. */
export const KDP_PAGE_LIMIT = 550

export function spreadCount(plan: PlanV2): number {
  return FRAME_SPREADS + bookSpreads(plan).length
}

export function pageCount(plan: PlanV2): number {
  return spreadCount(plan) * PAGES_PER_SPREAD
}

/** `114 spreads · 228 pp`, the Roster tab's meta. */
export function bookSizeLabel(plan: PlanV2): string {
  return `${spreadCount(plan)} spreads · ${pageCount(plan)} pp`
}

/** The editorial row for a spread, or the empty one the editor starts from. */
export function spreadRow(plan: PlanV2, s: PlannedSpread): BookSpread {
  return plan.spreads[s.key] ?? emptyBookSpread(s)
}

export function emptyBookSpread(s: PlannedSpread): BookSpread {
  return {
    key: s.key,
    kind: s.kind,
    subjectId: s.subjectId,
    part: s.part,
    templateVersion: SPREAD_KINDS[s.kind].template,
    status: 'data',
    editorial: { headline: '', storyStat: { value: '', label: '', source: null }, story: '', moments: [], highlight: [], notes: {} },
    team: s.kind === 'team' ? { turningPoint: null, cupParagraphs: {}, cupVariant: {}, coach: { name: '', context: '', assistants: '', sourceUrl: '' }, xiSplitDate: null, storyPlayers: [], heatmapPlayers: [] } : null,
    league: s.kind === 'league' ? { awards: [], leadAnnotations: [], halfwayNote: '' } : null,
    competition: s.kind === 'competition' ? { oddities: [], pinned: [], mapGrouping: 'country' } : null,
    modules: {},
    palette: null,
    pack: null,
    checkOverrides: [],
  }
}

/** A spread is drafted when the editor has filled its story. */
export function isDrafted(row: BookSpread | undefined): boolean {
  return !!row && (row.editorial.headline.trim() !== '' || row.editorial.story.trim() !== '' || row.editorial.moments.length > 0)
}

export function planV2Summary(plan: PlanV2) {
  const spreads = bookSpreads(plan)
  return {
    beatCount: plan.beats.filter(b => b.text.trim()).length,
    spreadCount: spreadCount(plan),
    cardedCount: spreads.filter(s => BOOK_SPREAD_STATUS_ORDER.indexOf(spreadRow(plan, s).status) >= 1 || isDrafted(plan.spreads[s.key])).length,
  }
}

// ---------------------------------------------------------------------------
// Roster helpers

/** Clubs of a league in final-table order, from its played matches. */
export function leagueClubs(rows: MatchRow[]): string[] {
  return standings(leagueMatches(rows)).map(r => r.team)
}

/** Rebuild the parts for a scope, keeping every league part's club list, order and exclusions, and the honourable mentions. */
export function withScope(plan: PlanV2, scope: PlanV2['scope']): PlanV2 {
  const leagueParts = new Map(plan.parts.filter((p): p is LeaguePart => p.kind === 'league').map(p => [p.league, p]))
  const honourable = plan.parts.find((p): p is HonourablePart => p.kind === 'honourable') ?? { kind: 'honourable' as const, id: 'honourable', teams: [] }
  const countries = [...new Set(scope.leagues.map(l => LEAGUE_COUNTRY[l]).filter(Boolean))]
  const parts: Part[] = [
    { kind: 'intro' },
    ...scope.leagues.map(league => leagueParts.get(league) ?? { kind: 'league' as const, id: `league-${slugId(league)}`, league, order: 'final-position' as const, teams: [], excluded: [] }),
    { kind: 'european', id: 'european', competitions: scope.european },
    { kind: 'domestic', id: 'domestic', countries: countries.map(country => ({ country, competitions: scope.domestic.filter(c => (DOMESTIC_CUPS[country] ?? []).includes(c)) })).filter(c => c.competitions.length) },
    honourable,
    { kind: 'outro' },
  ]
  return { ...plan, scope, parts }
}

/** Fill a league part's clubs from its table (final position), keeping its exclusions. */
export function fillLeaguePart(part: LeaguePart, clubs: string[]): LeaguePart {
  const excluded = new Set(part.excluded.map(e => e.teamId))
  const byPosition = clubs.filter(c => !excluded.has(c))
  if (part.order === 'manual' && part.teams.length) {
    // Manual order survives a data rebuild: keep the known order, append newcomers at their position.
    const known = part.teams.filter(t => byPosition.includes(t))
    return { ...part, teams: [...known, ...byPosition.filter(c => !known.includes(c))] }
  }
  return { ...part, teams: byPosition }
}

const CLUB_NOISE = /\b(fc|cf|sc|ac|as|afc|cfc|ssc|fk|sk|bk|if|club|de|la|le|the)\b/g

/** Loose club-name equality across sources ("Man United" ≈ "Manchester United FC"). */
export function sameClub(a: string, b: string): boolean {
  const norm = (s: string) => slugId(s.toLowerCase().replace(CLUB_NOISE, ' ').replace(/\bman\b/g, 'manchester').replace(/\butd\b/g, 'united')).replace(/-/g, ' ').trim()
  const x = norm(a)
  const y = norm(b)
  if (x === y) return true
  const longer = x.length >= y.length ? x : y
  const shorter = x.length >= y.length ? y : x
  return shorter.length >= 5 && longer.split(' ').includes(shorter)
}

export interface HonourableProposal {
  teamId: string
  reason: string
  competition: string
}

/**
 * Honourable mentions the rule proposes: every club outside the in-scope
 * leagues that won a European competition, reached a European final or
 * reached a Champions League semi-final. An editor confirms each with a reason.
 */
export function proposeHonourable(competition: string, rows: MatchRow[], inScopeClubs: string[]): HonourableProposal[] {
  const out = new Map<string, HonourableProposal>()
  const outside = (team: string) => !inScopeClubs.some(c => sameClub(c, team))
  const propose = (team: string, reason: string) => { if (outside(team) && !out.has(team)) out.set(team, { teamId: team, reason, competition }) }
  const final = rows.filter(m => /^final$/i.test(m.s ?? '')).pop()
  if (final) {
    const winner = final.hg > final.ag ? final.h : final.hg < final.ag ? final.a : null
    if (winner) propose(winner, `Won the ${competition}`)
    for (const t of [final.h, final.a]) propose(t, `Reached the ${competition} final`)
  }
  if (/champions league/i.test(competition)) {
    for (const m of rows.filter(m => /^(sf|semi)/i.test(m.s ?? ''))) for (const t of [m.h, m.a]) propose(t, `${competition} semi-finalist`)
  }
  return [...out.values()]
}

// ---------------------------------------------------------------------------
// Checks that run on the editorial row alone

export interface SpreadIssue {
  check: string
  level: CheckLevel
  message: string
  /** The editor tab (and field) that fixes it. */
  tab: EditorTabId
  field?: string
}

/** Headline at 55 pt, 800, uppercase, in the 420 pt column beside the mark: about 0.62 em a character, so ~12 characters a line. */
export const HEADLINE_CHARS_PER_LINE = 12
export const HEADLINE_LINES = 2

/** How many lines a headline takes at 55 pt in the identity block, breaking at spaces. */
export function headlineLines(headline: string): number {
  const words = headline.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 0
  let lines = 1
  let col = 0
  for (const w of words) {
    const len = w.length
    if (col === 0) { col = len; if (len > HEADLINE_CHARS_PER_LINE) lines += Math.ceil(len / HEADLINE_CHARS_PER_LINE) - 1; continue }
    if (col + 1 + len <= HEADLINE_CHARS_PER_LINE) col += 1 + len
    else { lines++; col = len }
  }
  return lines
}

export const STORY_WORDS = 30
export const PARAGRAPH_WORDS = 40

function inSeason(seasonStart: number, date: string): boolean {
  const months = seasonMonths(seasonStart)
  const m = date.slice(0, 7)
  return m >= months[0] && m <= months[months.length - 1]
}

const srcUrl = (s: string) => /^https?:\/\//.test(s)

/** The checks that need only the row: headline fit, copy length, moments, sources, contrast. */
export function spreadIssues(row: BookSpread, seasonStart: number): SpreadIssue[] {
  const issues: SpreadIssue[] = []
  const e = row.editorial
  const lines = headlineLines(e.headline)
  if (lines > HEADLINE_LINES) issues.push({ check: 'headline-fit', level: 'warn', message: `Headline runs to ${lines} lines at 55 pt; two is the limit.`, tab: 'story', field: 'headline' })
  const words = wordCount(e.story)
  if (words > STORY_WORDS) issues.push({ check: 'copy-length', level: 'warn', message: `Story is ${words} words; cut to ${STORY_WORDS}.`, tab: 'story', field: 'story' })
  for (const [moduleId, note] of Object.entries(e.notes)) {
    if (wordCount(note) > PARAGRAPH_WORDS) issues.push({ check: 'copy-length', level: 'warn', message: `The ${moduleId} note is ${wordCount(note)} words; notes take ${PARAGRAPH_WORDS} at most.`, tab: 'modules', field: moduleId })
  }
  if (row.kind !== 'competition') {
    e.moments.forEach((m, i) => {
      if (!inSeason(seasonStart, m.date)) issues.push({ check: 'moments', level: 'warn', message: `Moment ${i + 1} (${m.date}) is outside the ${seasonLabel(seasonStart)} season.`, tab: 'moments', field: `moment-${i}` })
    })
    const dates = e.moments.map(m => m.date)
    if (new Set(dates).size !== dates.length) issues.push({ check: 'moments', level: 'warn', message: 'Two moments share a date; their leaders would cross.', tab: 'moments' })
  }
  if (row.team) {
    for (const [c, p] of Object.entries(row.team.cupParagraphs)) {
      if (wordCount(p) > PARAGRAPH_WORDS) issues.push({ check: 'copy-length', level: 'warn', message: `The ${c} paragraph is ${wordCount(p)} words; cut to ${PARAGRAPH_WORDS}.`, tab: 'cups', field: c })
    }
    if ((row.team.coach.context.trim() || row.team.coach.assistants.trim()) && !srcUrl(row.team.coach.sourceUrl)) {
      issues.push({ check: 'sourced', level: 'block', message: 'The coach’s context needs a source URL.', tab: 'side', field: 'coach' })
    }
  }
  if (row.league) {
    row.league.awards.forEach((a, i) => {
      if (a.name.trim() && !srcUrl(a.sourceUrl)) issues.push({ check: 'sourced', level: 'block', message: `“${a.name}” needs a source URL.`, tab: 'players', field: `award-${i}` })
    })
  }
  if (row.competition) {
    row.competition.oddities.forEach((o, i) => {
      if (o.text.trim() && !o.source.trim()) issues.push({ check: 'sourced', level: 'block', message: `Oddity ${i + 1} is not tied to the stat that proves it.`, tab: 'oddities', field: `oddity-${i}` })
      if (wordCount(o.text) > PARAGRAPH_WORDS) issues.push({ check: 'copy-length', level: 'warn', message: `Oddity ${i + 1} is ${wordCount(o.text)} words; one line, ${PARAGRAPH_WORDS} at most.`, tab: 'oddities', field: `oddity-${i}` })
    })
  }
  if (row.palette) {
    const p = row.palette
    const pairs: [PaletteRole, PaletteRole, number][] = [['text', 'page1Ground', 7], ['text', 'page2Ground', 7], ['highlight', 'page1Ground', 3]]
    for (const [fg, bg, min] of pairs) {
      if (p[fg] && p[bg] && contrastRatio(p[fg]!, p[bg]!) < min) {
        issues.push({ check: 'contrast', level: 'block', message: `${PALETTE_ROLE_LABELS[fg]} on ${PALETTE_ROLE_LABELS[bg].toLowerCase()} is ${contrastRatio(p[fg]!, p[bg]!).toFixed(1)}:1; it needs ${min}:1.`, tab: 'colour-marks', field: fg })
      }
    }
  }
  return issues
}

/** Blocking issues not covered by an override. */
export function openBlockers(row: BookSpread, seasonStart: number): SpreadIssue[] {
  const overridden = new Set(row.checkOverrides.map(o => o.check))
  return spreadIssues(row, seasonStart).filter(i => i.level === 'block' && !overridden.has(i.check))
}

/** Status the row has earned by its content, never moving it back. */
export function advanceBookStatus(row: BookSpread): BookSpreadStatus {
  const earned: BookSpreadStatus = isDrafted(row) ? 'draft' : 'data'
  return BOOK_SPREAD_STATUS_ORDER[Math.max(BOOK_SPREAD_STATUS_ORDER.indexOf(row.status), BOOK_SPREAD_STATUS_ORDER.indexOf(earned))]
}

export interface BookIssue {
  check: string
  level: CheckLevel
  message: string
  view: SeasonBookView
}

/** Book-level checks: roster complete, honourable reasons, page count, headline uniqueness. `clubsByLeague` is what the match data knows. */
export function bookIssues(plan: PlanV2, clubsByLeague: Map<string, string[]>): BookIssue[] {
  const issues: BookIssue[] = []
  for (const part of plan.parts) {
    if (part.kind !== 'league') continue
    const clubs = clubsByLeague.get(part.league)
    if (!clubs) continue
    const placed = new Set([...part.teams, ...part.excluded.map(e => e.teamId)])
    const missing = clubs.filter(c => !placed.has(c))
    if (missing.length) issues.push({ check: 'roster-complete', level: 'block', message: `${part.league}: ${missing.length} club${missing.length === 1 ? '' : 's'} neither included nor excluded (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}).`, view: 'roster' })
    for (const e of part.excluded) if (!e.reason.trim()) issues.push({ check: 'roster-complete', level: 'block', message: `${e.teamId} is left out of the ${part.league} part without a reason.`, view: 'roster' })
  }
  if (!plan.scope.leagues.length) issues.push({ check: 'roster-complete', level: 'block', message: 'The book has no league yet.', view: 'roster' })
  const hon = plan.parts.find((p): p is HonourablePart => p.kind === 'honourable')
  for (const t of hon?.teams ?? []) if (!t.reason.trim()) issues.push({ check: 'honourable-reason', level: 'block', message: `${t.teamId} needs a reason to be an honourable mention.`, view: 'roster' })
  const pages = pageCount(plan)
  if (pages > KDP_PAGE_LIMIT) issues.push({ check: 'page-count', level: 'block', message: `${pages} pages is over KDP’s ${KDP_PAGE_LIMIT}-page limit for premium colour hardcovers.`, view: 'flatplan' })
  const seen = new Map<string, string>()
  for (const s of bookSpreads(plan)) {
    const h = plan.spreads[s.key]?.editorial.headline.trim().toLowerCase()
    if (!h) continue
    const other = seen.get(h)
    if (other) issues.push({ check: 'headline-unique', level: 'warn', message: `${other} and ${s.label} share the headline “${plan.spreads[s.key]!.editorial.headline}”.`, view: 'spreads' })
    else seen.set(h, s.label)
  }
  return issues
}

// ---------------------------------------------------------------------------
// Colour helpers for the Colour and marks tab

function luminance(h: string): number {
  const n = parseInt(h.slice(1), 16)
  const c = [16, 8, 0].map(s => ((n >> s) & 255) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

/** WCAG contrast ratio between two `#rrggbb` colours. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** The series highlight gold, and the white-gold swap for yellow kits. */
export const SERIES_GOLD = '#E7B94C'
export const WHITE_GOLD = '#F2E2B0'

// ---------------------------------------------------------------------------
// Conversion: a v1 claim-spreads book → a season-spreads book, one way

/** The spread key a beat belongs to, when its teams field names exactly one club. */
export function beatSpreadKey(beat: Beat): SpreadKey | null {
  const teams = beat.teams.split('|').map(t => t.trim()).filter(Boolean)
  return teams.length === 1 ? spreadKeyFor('team', teams[0]) : null
}

/**
 * Convert to season spreads: cover and intro become frame spreads, beats keep
 * their text and gain a spread key when they name one club, and every month
 * spread moves to `legacy` (read-only, never deleted). Scope starts at the
 * five big leagues and the season's European competitions; the Roster fills
 * the clubs from match data.
 */
export function convertToSeasonSpreads(plan: Plan, seasonStart: number): PlanV2 {
  const frame = (chapter: 'cover' | 'intro' | 'outro') => plan.spreads.find(s => s.chapter === chapter) ?? emptySpread(chapter, chapter === 'outro' ? 'table' : chapter)
  const legacy = plan.spreads.filter(s => /^\d{4}-\d{2}$/.test(s.chapter))
  const base: PlanV2 = {
    version: 2,
    scope: { leagues: [], european: [], domestic: [] },
    parts: [],
    frame: { cover: frame('cover'), intro: frame('intro'), outro: frame('outro') },
    beats: plan.beats.map(b => ({ ...b, spreadKey: beatSpreadKey(b) })),
    legacy,
    spreads: {},
  }
  const countries = DEFAULT_LEAGUES.map(l => LEAGUE_COUNTRY[l])
  return withScope(base, {
    leagues: [...DEFAULT_LEAGUES],
    european: europeanCompetitionsFor(seasonStart).slice(0, 2),
    domestic: countries.flatMap(c => DOMESTIC_CUPS[c] ?? []).filter(c => !MINOR_CUPS.has(c)),
  })
}

/** A new season-spreads book: frame spreads in place, the default scope, no clubs until the Roster reads the tables. */
export function starterPlanV2(seasonStart: number): PlanV2 {
  return convertToSeasonSpreads({ beats: [], spreads: [emptySpread('cover', 'cover'), emptySpread('intro', 'intro')] }, seasonStart)
}
