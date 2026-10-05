/**
 * Types for the three Vizmaya story randomizers (the playbook's Desk, Atlas
 * and Epics), their datasets (./data/*.json) and the spins they produce.
 *
 * Pure: no Supabase / Node imports, so admin client components can use them.
 */

export type RandomizerId = 'desk' | 'atlas' | 'epics'

export const RANDOMIZERS: readonly RandomizerId[] = ['desk', 'atlas', 'epics']

export function isRandomizerId(value: unknown): value is RandomizerId {
  return typeof value === 'string' && (RANDOMIZERS as readonly string[]).includes(value)
}

export interface ReelDef {
  key: string
  label: string
  /** Locking this reel also locks these (a sub-industry only makes sense inside its industry). */
  parents?: string[]
  /** Shown only when an option is on (the Atlas pair reel). Never lockable. */
  option?: 'pair'
}

export interface RandomizerMeta {
  id: RandomizerId
  name: string
  /** One line under the name: what it covers and its output format. */
  hint: string
  format: string
  reels: ReelDef[]
  /** The per-randomizer toggle: Atlas pair spin, Epics sequence mode. */
  option: { key: 'pair' | 'sequence'; label: string } | null
  /**
   * Whether the hero insight waits for a human before anything public is
   * built from it (decision D4: gated for Atlas and Epics because of the
   * sensitivity rules, optional for the Desk).
   */
  gated: boolean
}

export const RANDOMIZER_META: Record<RandomizerId, RandomizerMeta> = {
  desk: {
    id: 'desk',
    name: 'Vizmaya Desk',
    hint: 'Industry · editorial',
    format: 'Editorial brief with charts',
    reels: [
      { key: 'industry', label: 'Industry' },
      { key: 'sub', label: 'Sub-industry', parents: ['industry'] },
      { key: 'lens', label: 'Lens' },
      { key: 'fresh', label: 'Freshness' },
    ],
    option: null,
    gated: false,
  },
  atlas: {
    id: 'atlas',
    name: 'Atlas',
    hint: 'Countries · geography',
    format: 'Geography format (route table)',
    reels: [
      { key: 'country', label: 'Country' },
      { key: 'thread', label: 'Cultural thread' },
      { key: 'time', label: 'Time depth' },
      { key: 'frame', label: 'Geography frame' },
      { key: 'lens', label: 'Lens' },
      { key: 'pair', label: 'Pair country', option: 'pair' },
    ],
    option: { key: 'pair', label: 'Pair spin (second country)' },
    gated: true,
  },
  epics: {
    id: 'epics',
    name: 'Epics',
    hint: 'Epics · geography',
    format: 'Geography format, epic variant',
    reels: [
      { key: 'epic', label: 'Epic' },
      { key: 'episode', label: 'Book, canto or episode', parents: ['epic'] },
      { key: 'place', label: 'Place', parents: ['episode', 'epic'] },
      { key: 'lens', label: 'Lens' },
    ],
    option: { key: 'sequence', label: 'Sequence mode (continue the route)' },
    gated: true,
  },
}

/* ---------- Desk ---------- */

export interface DeskHeadline {
  title: string
  url: string
  /** ISO date, YYYY-MM-DD. */
  date: string
}

export interface DeskIndustry {
  id: string
  name: string
}

export interface DeskSubIndustry {
  id: string
  /** DeskIndustry.id */
  industry: string
  name: string
  /** 0 to 100. The dataset value is a seed; desk_heat overrides it once refreshed. */
  heat: number
  /** ISO timestamp of the last refresh; null when the seed was never refreshed. */
  heat_updated: string | null
  top_headlines: DeskHeadline[]
  /** The 3 to 5 numbers worth charting for this segment. */
  key_metrics: string[]
  /** Regulators, filings, trade bodies. */
  primary_sources: string[]
}

export interface NamedOption {
  name: string
  description: string
}

export interface DeskFreshness {
  name: 'Breaking' | 'Developing' | 'Evergreen'
  /** The news window in days; null for Evergreen. */
  days: number | null
  window: string
}

export interface DeskDataset {
  industries: DeskIndustry[]
  sub_industries: DeskSubIndustry[]
  lenses: NamedOption[]
  freshness: DeskFreshness[]
}

/** A desk_heat row (migration 088): the live heat for one sub-industry. */
export interface DeskHeatRow {
  subId: string
  heat: number
  heatUpdated: string | null
  topHeadlines: DeskHeadline[]
  /** 'failed' when the last refresh attempt failed; the UI must show it. */
  refreshStatus: 'ok' | 'failed'
  refreshError: string | null
  refreshedBy: string | null
}

/* ---------- Atlas ---------- */

export type PopulationBand = '<1M' | '1-10M' | '10-50M' | '50-100M' | '100M+'

export interface AtlasCountry {
  /** ISO 3166-1 alpha-2, lowercase (the flag-icons code). Kosovo uses xk. */
  iso: string
  name: string
  region: string
  subregion: string
  population_band: PopulationBand
  coastline: boolean
  /** On the extras list (observer, de facto state, territory), not a UN member. */
  extra?: boolean
  /** For extras: what kind, e.g. "UN observer state", "Territory of Denmark". */
  status?: string
  /** Optional curation, filled as research accumulates. */
  colonial_or_imperial_history?: string[]
  languages?: string[]
  major_faiths?: string[]
}

export interface AtlasDataset {
  regions: string[]
  countries: AtlasCountry[]
  threads: string[]
  time_depths: NamedOption[]
  frames: NamedOption[]
  lenses: NamedOption[]
}

/* ---------- Epics ---------- */

export type EpicType =
  | 'Heroic and war'
  | 'Voyage and return'
  | 'Philosophical and spiritual'
  | 'Foundational and creation'
  | 'Moral and social'

/** The playbook's geography status (3.4), mandatory on every place. */
export type GeoStatus = 'Verified' | 'Claimed' | 'Symbolic' | 'Lost'

export const GEO_STATUSES: readonly GeoStatus[] = ['Verified', 'Claimed', 'Symbolic', 'Lost']

export const GEO_STATUS_TEXT: Record<GeoStatus, string> = {
  Verified: 'Archaeology or documentary evidence supports the identification.',
  Claimed: 'A community, state or tourism body promotes the identification, without strong external evidence.',
  Symbolic: 'Scholarship holds that the place is not meant as literal geography.',
  Lost: 'Once identified, now unlocatable.',
}

export interface EpicPlace {
  id: string
  name: string
  /** Modern identification, in words ("Hisarlik, Çanakkale, Türkiye"). */
  modern: string
  /** ISO alpha-2 of the modern country, when there is one. */
  country?: string
  /** Line, verse or canto reference, when known. */
  text_ref?: string
  /** A starting point: research verifies it. */
  status: GeoStatus
}

export interface EpicEpisode {
  id: string
  name: string
  places: EpicPlace[]
}

export interface Epic {
  id: string
  title: string
  tradition: string
  types: EpicType[]
  approx_date_of_composition: string
  language: string
  /** Books, cantos, parvas: how the text divides itself. */
  structure: string
  /** For texts that sit inside another (the Gita inside the Mahabharata). */
  part_of?: string
  /** The status most of its places carry, said up front because it frames the story. */
  geography_status: { dominant: GeoStatus; note: string }
  best_editions_and_translations: string[]
  key_scholarly_sources: string[]
  episodes: EpicEpisode[]
}

export interface EpicsDataset {
  traditions: string[]
  epics: Epic[]
  lenses: NamedOption[]
}

/* ---------- Spins ---------- */

export type RuleKind = 'block' | 'warn' | 'good' | 'info'

/** One rule that fired during a draw, shown in admin and kept in the log. */
export interface RuleFired {
  tag: string
  kind: RuleKind
  text: string
}

export interface ReelValue {
  value: string
  sub?: string
  /** A GeoStatus for the Epics place reel. */
  badge?: GeoStatus
}

export interface DeskPicks {
  subId: string
  lens: string
  /** The freshness the spin ended on, after the fallback. */
  fresh: DeskFreshness['name']
  /** The freshness the reel drew, before the fallback. */
  freshDrawn: DeskFreshness['name']
}

export interface AtlasPicks {
  iso: string
  thread: string
  time: string
  frame: string
  lens: string
  pairIso?: string
}

export interface EpicsPicks {
  epicId: string
  episodeId: string
  placeId: string
  lens: string
}

/**
 * What the draw saw, frozen into the spin so the brief and the research stub
 * read the same thing later even if the dataset changes.
 */
export interface DeskSubject {
  randomizer: 'desk'
  industry: DeskIndustry
  sub: DeskSubIndustry
  lens: NamedOption
  freshness: DeskFreshness
  /** The heat score is older than the staleness window (or was never refreshed). */
  heatStale: boolean
  /** The last refresh failed: the spin was forced to Evergreen. */
  refreshFailed: boolean
  /** Days since the newest known development, or null when none is on file. */
  lastDevelopmentDays: number | null
}

export interface AtlasSubject {
  randomizer: 'atlas'
  country: AtlasCountry
  pair: AtlasCountry | null
  thread: string
  time: NamedOption
  frame: NamedOption
  lens: NamedOption
}

export interface EpicsSubject {
  randomizer: 'epics'
  epic: Omit<Epic, 'episodes'> & { place_count: number }
  episode: Omit<EpicEpisode, 'places'> & { places: EpicPlace[] }
  place: EpicPlace
  lens: NamedOption
  /** Continued from the previous spin's place (sequence mode). */
  sequence: boolean
}

export type SpinSubject = DeskSubject | AtlasSubject | EpicsSubject
export type SpinPicks = DeskPicks | AtlasPicks | EpicsPicks

/** Balancing memory the next draw reads back. */
export interface SpinMeta {
  region?: string
  pair?: boolean
  tradition?: string
  types?: EpicType[]
  heat?: number
}

export interface DrawResult {
  randomizer: RandomizerId
  picks: SpinPicks
  subject: SpinSubject
  reels: Record<string, ReelValue>
  /** The single primary reel value the 30-day block keys on (sub-industry, country, epic). */
  primary: string
  /** The full combination the 90-day block keys on. */
  combo: string
  summary: string
  rules: RuleFired[]
  meta: SpinMeta
}

export type SpinStatus = 'spun' | 'rejected' | 'researching' | 'insight_review' | 'approved' | 'published'

export const SPIN_STATUSES: readonly SpinStatus[] = [
  'spun',
  'rejected',
  'researching',
  'insight_review',
  'approved',
  'published',
]

/** One-tap reasons for a re-spin (decision D6), so the weights can be tuned later. */
export const RESPIN_REASONS = ['boring', 'too recent', 'no data', 'too sensitive', 'other'] as const
export type RespinReason = (typeof RESPIN_REASONS)[number]

export interface SpinOptions {
  locks: string[]
  pair?: boolean
  sequence?: boolean
}

/** A logged spin (randomizer_spins). */
export interface SpinRecord extends DrawResult {
  id: string
  /** The rng seed, 8 hex digits. Same seed, same history, same draw. */
  seed: string
  status: SpinStatus
  rejectedReason: string | null
  /** The spin this one replaced with a re-spin. */
  respinOf: string | null
  options: SpinOptions
  researchMd: string | null
  heroInsight: string | null
  /** What a reviewer said when sending the insight back. */
  reviewNote: string | null
  storySlug: string | null
  /** 'admin', 'mcp', 'api'. */
  createdBy: string
  createdAt: string
  updatedAt: string
}

/** The slice of a past spin the draw needs. */
export interface SpinHistoryEntry {
  id?: string
  status: SpinStatus
  primary: string
  combo: string
  meta: SpinMeta
  picks: SpinPicks
  createdAt: string
}
