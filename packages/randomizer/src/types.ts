/**
 * Types for the story randomizers: the six Vizmaya ones (the playbook's
 * Desk, Atlas and Epics, the OCW Desk on MIT OpenCourseWare, the Landmark
 * Desk on prize-winning research and The 100 Desk on Michael Hart's ranking
 * of the most influential persons in history), the
 * Footshorts one (teams, tournaments and their news) and the VizNBA one
 * (franchises, conferences and their news), their datasets (./data/*.json)
 * and the spins they produce.
 *
 * Pure: no Supabase / Node imports, so admin client components can use them.
 */

export type RandomizerId = 'desk' | 'atlas' | 'epics' | 'ocw' | 'landmark' | 'hundred' | 'footshorts' | 'viznba'

export const RANDOMIZERS: readonly RandomizerId[] = ['desk', 'atlas', 'epics', 'ocw', 'landmark', 'hundred', 'footshorts', 'viznba']

export function isRandomizerId(value: unknown): value is RandomizerId {
  return typeof value === 'string' && (RANDOMIZERS as readonly string[]).includes(value)
}

/** The site a randomizer's stories are hosted on (an @vismay/html-stories app slug). */
export type RandomizerApp = 'vizmaya-fyi' | 'footshorts' | 'viznba'

/** The randomizers one site's slot machine shows, in tab order. */
export function randomizersFor(app: RandomizerApp): RandomizerId[] {
  return RANDOMIZERS.filter((r) => RANDOMIZER_META[r].app === app)
}

export interface ReelDef {
  key: string
  label: string
  /** Locking this reel also locks these (a sub-industry only makes sense inside its industry). */
  parents?: string[]
  /** Shown only when an option is on (the Atlas pair reel, the Footshorts and NBA opponents). Never lockable. */
  option?: 'pair'
  /** Filled per spin from a live pool (the OCW course and resource, the Landmark laureate and work), not from the dataset. */
  live?: boolean
}

export interface RandomizerMeta {
  id: RandomizerId
  /** The site its stories go to; a spin's brief and publish only work there. */
  app: RandomizerApp
  name: string
  /** One line under the name: what it covers and its output format. */
  hint: string
  format: string
  reels: ReelDef[]
  /** The per-randomizer toggle: Atlas pair spin, Epics, OCW, Landmark and The 100 sequence mode, Footshorts and NBA head-to-head. */
  option: { key: 'pair' | 'sequence'; label: string } | null
  /**
   * Whether the hero insight waits for a human before anything public is
   * built from it (decision D4: gated for Atlas and Epics because of the
   * sensitivity rules, and for The 100 Desk, whose list runs from the
   * founders of religions to dictators; optional for the Desk, Footshorts and
   * the NBA Desk).
   */
  gated: boolean
}

export const RANDOMIZER_META: Record<RandomizerId, RandomizerMeta> = {
  desk: {
    id: 'desk',
    app: 'vizmaya-fyi',
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
    app: 'vizmaya-fyi',
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
    app: 'vizmaya-fyi',
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
  ocw: {
    id: 'ocw',
    app: 'vizmaya-fyi',
    name: 'OCW Desk',
    hint: 'Fields · courses · resources',
    format: 'Study note with charts',
    // The resource kind is drawn too (OcwPicks.kind) but is not a reel while
    // the dataset holds one kind (Lecture Notes): add kinds to ocw.json and
    // put `{ key: 'kind', label: 'Resource kind' }` back here to spin it.
    reels: [
      { key: 'field', label: 'Field' },
      { key: 'topic', label: 'Topic', parents: ['field'] },
      { key: 'course', label: 'Course', parents: ['topic', 'field'], live: true },
      { key: 'resource', label: 'Resource', parents: ['course', 'topic', 'field'], live: true },
      { key: 'lens', label: 'Lens' },
    ],
    option: { key: 'sequence', label: 'Continue the course (next resource)' },
    gated: false,
  },
  landmark: {
    id: 'landmark',
    app: 'vizmaya-fyi',
    name: 'Landmark Desk',
    hint: 'Prizes · laureates · papers',
    format: 'Landmark paper explainer with charts',
    reels: [
      { key: 'field', label: 'Field' },
      { key: 'prize', label: 'Prize', parents: ['field'] },
      { key: 'era', label: 'Era', parents: ['prize', 'field'] },
      { key: 'laureate', label: 'Laureate', parents: ['era', 'prize', 'field'], live: true },
      { key: 'work', label: 'Work', parents: ['laureate', 'era', 'prize', 'field'], live: true },
      { key: 'lens', label: 'Lens' },
    ],
    option: { key: 'sequence', label: 'Follow the prize (the year before)' },
    gated: false,
  },
  hundred: {
    id: 'hundred',
    app: 'vizmaya-fyi',
    name: 'The 100 Desk',
    hint: "Hart's 100 · influence",
    format: 'Influence profile with charts',
    reels: [
      { key: 'domain', label: 'Domain' },
      { key: 'era', label: 'Era', parents: ['domain'] },
      { key: 'person', label: 'Person', parents: ['era', 'domain'] },
      { key: 'lens', label: 'Lens' },
    ],
    option: { key: 'sequence', label: 'Walk the ranking (next rank)' },
    gated: true,
  },
  footshorts: {
    id: 'footshorts',
    app: 'footshorts',
    name: 'Football Desk',
    hint: 'Teams · tournaments · news',
    format: 'Football explainer with charts',
    reels: [
      { key: 'competition', label: 'Tournament' },
      { key: 'team', label: 'Team', parents: ['competition'] },
      { key: 'angle', label: 'Angle' },
      { key: 'fresh', label: 'Freshness' },
      { key: 'pair', label: 'Opponent', option: 'pair' },
    ],
    option: { key: 'pair', label: 'Head-to-head (draw an opponent)' },
    gated: false,
  },
  viznba: {
    id: 'viznba',
    app: 'viznba',
    name: 'NBA Desk',
    hint: 'Franchises · conferences · news',
    format: 'Basketball explainer with charts',
    reels: [
      { key: 'conference', label: 'Conference' },
      { key: 'team', label: 'Team', parents: ['conference'] },
      { key: 'angle', label: 'Angle' },
      { key: 'fresh', label: 'Freshness' },
      { key: 'pair', label: 'Opponent', option: 'pair' },
    ],
    option: { key: 'pair', label: 'Head-to-head (draw an opponent)' },
    gated: false,
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
  /** A newer segment still finding its shape: the brief asks for a definition first. */
  emerging?: boolean
  /** The geography the segment is about (India, China, Gulf); absent when global. */
  region?: string
  /** A dated fact from seed research, to verify before use. */
  seed_note?: DeskSeedNote
}

export interface DeskSeedNote {
  text: string
  confidence: 'low' | 'medium' | 'high'
  /** ISO date, YYYY-MM-DD, of the research the note came from. */
  researched: string
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

/* ---------- OCW Desk ---------- */

/** A top-level MIT Learn topic ("Science & Math"), the field reel. */
export interface OcwField {
  /** MIT Learn topic id. */
  id: number
  name: string
}

/** A child topic ("Physics"), the topic reel; the API's `topic=` filter takes its name. */
export interface OcwTopic {
  id: number
  /** OcwField.id */
  field: number
  name: string
  /**
   * OCW files of each kind under the topic (by OcwKind.name) at the last
   * taxonomy refresh: the plan skips a topic with none, and a kind with none
   * for the topic. Counts drift; the pool read is what counts on the day.
   */
  files: Record<string, number>
}

/**
 * A resource kind: one of MIT Learn's course features, the
 * `content_feature_type=` filter. The dataset holds Lecture Notes alone for
 * now; the draw, the pool and the brief take any number.
 */
export interface OcwKind {
  name: string
  /** Problem sets, exams and projects: the kinds the one-in-three quota keeps coming. */
  hands_on: boolean
  description: string
}

export interface OcwDataset {
  fields: OcwField[]
  topics: OcwTopic[]
  kinds: OcwKind[]
  lenses: NamedOption[]
}

/** One OCW content file, as the pool keeps it (a content_file_search hit, trimmed). */
export interface OcwFile {
  /** MIT Learn content file id. */
  id: number
  /** The file's path on OCW ("courses/8-03sc-.../resources/mit8_03scf16_lec21/"): the sequence order. */
  key: string
  /** The resource page on ocw.mit.edu. */
  url: string
  title: string
  /** pdf, video, page… */
  contentType: string
  /** The MIME type, when known. */
  fileType: string | null
  /** The feature types the file carries; the pool filters on the drawn kind. */
  kinds: string[]
  /** The YouTube id, for Lecture Videos. */
  youtubeId: string | null
  /** The course: MIT Learn learning resource id, readable id ("8.03SC+fall_2016"), title, OCW slug and number. */
  courseId: number
  courseReadableId: string
  courseTitle: string
  /** "courses/8-03sc-physics-iii-vibrations-and-waves-fall-2016" */
  courseSlug: string
  /** "8.03SC" (the first of the course numbers). */
  courseNumber: string
  departments: string[]
  year: number | null
  semester: string | null
}

/**
 * What the pool knows about the drawn course: from the file's own fields
 * at draw time, enriched by spins.ts with the course record afterwards
 * (instructors, level, feature list), which the brief reads.
 */
export interface OcwCourse {
  id: number
  readableId: string
  number: string
  title: string
  /** The course page on ocw.mit.edu. */
  url: string
  slug: string
  departments: string[]
  year: number | null
  semester: string | null
  /** Filled by the enrichment; empty until then. */
  instructors: string[]
  level: string[]
  courseFeatures: string[]
}

/**
 * What the plan asks the pool for: either a page of one topic's files of one
 * kind, or every file of one kind in one course (sequence mode, and a course
 * or resource lock).
 */
export interface OcwQuery {
  topic: string
  kind: string
  /** Set when the pool is one course's files. */
  courseId: number | null
}

/**
 * The pure first stage of an OCW draw (draw.ts planOcw): the reels the
 * dataset can fill, and where in the live pool to look. spins.ts turns it
 * into an OcwPool, then the draw finishes with the same seed.
 */
export interface OcwPlan {
  field: OcwField
  topic: OcwTopic
  kind: OcwKind
  lens: NamedOption
  /** One rng draw in [0, 1): the pool page's offset is floor(u * count). */
  u: number
  query: OcwQuery
  /** The file to keep (a resource lock), by id. */
  keepFile: number | null
  /** Sequence mode: the previous spin's file, by id, to walk on from in key order. */
  afterFile: number | null
}

/** The live pool one OCW draw reads: a page of files (frozen into the spin's subject). */
export interface OcwPool {
  /** ISO timestamp the pool was read. */
  asOf: string
  query: OcwQuery
  /** Files matching the query on OCW, before paging. */
  count: number
  /** The page's offset into them. */
  offset: number
  files: OcwFile[]
}

export interface OcwPicks {
  /** OcwField.id */
  field: number
  /** OcwTopic.id */
  topic: number
  kind: string
  lens: string
  /** OcwFile.courseId */
  courseId: number
  /** OcwFile.id */
  fileId: number
}

export interface OcwSubject {
  randomizer: 'ocw'
  field: OcwField
  topic: OcwTopic
  kind: OcwKind
  lens: NamedOption
  course: OcwCourse
  file: OcwFile
  /** The course's other files of this kind that the pool saw, in key order: context for the brief, the route for sequence mode. */
  siblings: OcwFile[]
  /** The pool the file came from: its query, size, offset, when it was read, and the courses on the page (titles). */
  pool: Omit<OcwPool, 'files'> & { pageSize: number; courses: string[] }
  /** Continued from the previous spin's resource (sequence mode). */
  sequence: boolean
}

/* ---------- Landmark Desk ---------- */

/**
 * What a prize's citation names: a paper, a book, a specific result or
 * discovery, or a body of work. Only `paper` and `book` prizes name the work
 * itself; for the rest the desk resolves a representative work and says so.
 */
export type LandmarkWorkLevel = 'paper' | 'book' | 'result' | 'body'

export interface LandmarkField {
  id: string
  name: string
}

/** A band of award years, the era reel. */
export interface LandmarkEra {
  id: string
  name: string
  from: number
  to: number
}

/**
 * Where a prize's award list is read from, live: the Nobel Prize API (its
 * category code, the slug nobelprize.org uses, and the prize's Wikidata item
 * for the "for work" qualifiers), or Wikidata (the prize item, with P166 on
 * the laureates and P585 for the year).
 */
export type LandmarkPrizeSource = { kind: 'nobel'; category: string; slug: string; item: string } | { kind: 'wikidata'; item: string }

export interface LandmarkPrize {
  id: string
  /** LandmarkField.id */
  field: string
  name: string
  /** The body that awards it, for the credit line. */
  awarder: string
  source: LandmarkPrizeSource
  /** The official list of laureates. */
  url: string
  /** First year awarded. */
  since: number
  works: LandmarkWorkLevel
  /**
   * The citation or an official document names the work: the Nobels (their
   * scientific background documents), the Gödel Prize (papers) and the book
   * prizes. The one-in-three quota keeps these coming.
   */
  work_level: boolean
  /** One line on what the citation looks like, for the brief. */
  note: string
  /** Awards per era (by LandmarkEra.id) at the last taxonomy refresh: the plan never asks for an empty one. */
  awards: Record<string, number>
  /** Awards whose record names the work (Wikidata P1686), and awards with no date, at the last refresh. */
  named_works: number
  undated: number
}

export interface LandmarkDataset {
  fields: LandmarkField[]
  eras: LandmarkEra[]
  prizes: LandmarkPrize[]
  lenses: NamedOption[]
}

/** A work the award's own record names (Wikidata P1686 "for work") or lists as notable (P800), before the work loader fills it in. */
export interface LandmarkNamedWork {
  /** "wd:Q..." */
  id: string
  title: string
  doi: string | null
  isbn: string | null
  year: number | null
  basis: 'citation' | 'notable'
}

/** One award: one laureate in one year of one prize. The row of the awards pool. */
export interface LandmarkAward {
  /** LandmarkPrize.id */
  prize: string
  year: number
  /** "nobel:973" or "wd:Q193803": the 30-day block keys on it. */
  laureateId: string
  name: string
  /** The laureate's Wikidata item, when known (a Nobel laureate's comes from the laureate record, after the pick). */
  wikidata: string | null
  nobelId: string | null
  /** The official motivation, verbatim. Wikidata has none. */
  motivation: string | null
  /** The Nobel share ("1/2"). */
  share: string | null
  /** The others who shared the prize that year. */
  coLaureates: string[]
  /** Works the award statement itself names. */
  namedWorks: LandmarkNamedWork[]
  /** The laureate's page at the awarder (nobelprize.org) or on Wikidata. */
  url: string
  /** The prize summary and scientific background pages for the year, the Nobel lecture, the Wikipedia article, as known. */
  links: { summary?: string; background?: string; lecture?: string; wikipedia?: string }
  orcid: string | null
  /** OpenAlex author id ("A..."), from Wikidata P10283. */
  openalexId: string | null
  /** Open Library author id ("OL...A"), from Wikidata P648. */
  openLibraryId: string | null
}

export type LandmarkWorkBasis = 'citation' | 'notable' | 'top-cited' | 'book'

/** A paper or book tied to an award, as the work loader resolved it. */
export interface LandmarkWork {
  /** "openalex:W…", "wd:Q…", "doi:…" or "ol:OL…W". */
  id: string
  title: string
  year: number | null
  doi: string | null
  /** The landing page: doi.org, Open Library or Wikidata. */
  url: string
  /** The best free-to-read copy (Unpaywall's best_oa_location, else OpenAlex's oa_url). */
  oaUrl: string | null
  /** gold, hybrid, bronze, green or closed; null when unknown. */
  oaStatus: string | null
  venue: string | null
  /** The first few authors. */
  authors: string[]
  citedBy: number | null
  /** OpenAlex's field-weighted citation impact. */
  fwci: number | null
  topOnePercent: boolean | null
  /** Citations per year, as OpenAlex counts them (recent years only). */
  countsByYear: Array<{ year: number; citations: number }>
  type: string | null
  retracted: boolean
  /**
   * How the work was tied to the award: named in the award record, a
   * notable work on the laureate's record, the laureate's most-cited work
   * before the prize (OpenAlex), or the laureate's book from around the
   * prize year (Open Library).
   */
  basis: LandmarkWorkBasis
  /** True unless the award record names it: the page calls it a representative work, not the prize-winning one. */
  representative: boolean
}

export type LandmarkSourceState = 'ok' | 'failed' | 'skipped' | 'no key' | 'no email'

/** How each source fared when the works were loaded; the admin panel and the brief say so. */
export interface LandmarkSources {
  wikidata: LandmarkSourceState
  openalex: LandmarkSourceState
  openlibrary: LandmarkSourceState
  unpaywall: LandmarkSourceState
  errors: string[]
  /** What a source did that the brief should mention (an author matched by name alone, a book picked by year). */
  notes: string[]
}

/** What the plan asks the awards pool for: every award of one prize in one era. */
export interface LandmarkQuery {
  prize: string
  era: string
}

/**
 * The pure first stage of a Landmark draw (draw.ts planLandmark): the reels
 * the dataset can fill and the awards to read; then, run again with the
 * awards, the laureate whose works to load. spins.ts turns it into a
 * LandmarkPool, and the draw finishes with the same seed.
 */
export interface LandmarkPlan {
  field: LandmarkField
  prize: LandmarkPrize
  era: LandmarkEra
  lens: NamedOption
  /** One rng draw in [0, 1), kept so the plan's rng sequence is fixed before the laureate pick. */
  u: number
  query: LandmarkQuery
  /** The laureate to keep (a laureate or work lock), by LandmarkAward.laureateId. */
  keepLaureate: string | null
  /** The work to keep (a work lock), by LandmarkWork.id. */
  keepWork: string | null
  /** Sequence mode: the previous spin's prize year, to walk back from. */
  beforeYear: number | null
  /** Stage two, once the awards are known: the award whose works to load. */
  award: LandmarkAward | null
}

/** The live pool one Landmark draw reads (frozen, less the awards, into the spin's subject). */
export interface LandmarkPool {
  /** ISO timestamp the awards were read. */
  asOf: string
  query: LandmarkQuery
  /** Every award of the prize in the era, oldest first, then by name. */
  awards: LandmarkAward[]
  /** The works loaded for the planned laureate; null before stage two. */
  works: { laureateId: string; items: LandmarkWork[]; sources: LandmarkSources } | null
}

export interface LandmarkPicks {
  /** LandmarkField.id */
  field: string
  /** LandmarkPrize.id */
  prize: string
  /** LandmarkEra.id */
  era: string
  lens: string
  /** LandmarkAward.laureateId */
  laureateId: string
  year: number
  /** LandmarkWork.id, or null when no work could be resolved. */
  workId: string | null
}

export interface LandmarkSubject {
  randomizer: 'landmark'
  field: LandmarkField
  prize: LandmarkPrize
  era: LandmarkEra
  lens: NamedOption
  award: LandmarkAward
  /** The headline work, or null when none could be resolved (the brief then says to reconstruct it). */
  work: LandmarkWork | null
  /** The other candidates the loader found, best first: related reading, and the route for a work lock. */
  related: LandmarkWork[]
  /** The pool the award came from: its query, size, the laureates in it (names), when it was read, and how the sources fared. */
  pool: { asOf: string; query: LandmarkQuery; count: number; laureates: string[]; sources: LandmarkSources }
  /** Continued from the previous spin's prize, the year before (sequence mode). */
  sequence: boolean
}

/* ---------- The 100 Desk ---------- */

/**
 * What the brief must handle up front for one person: a life whose
 * historicity is debated, a person most of the faithful hold should not be
 * depicted, one entry for two people (the Wright brothers), a contested
 * authorship (Hart credits Shakespeare's works to Edward de Vere), or an
 * influence that came with mass death on the record.
 */
export type HundredFlag = 'legendary' | 'no-portrait' | 'duo' | 'authorship' | 'harm'

/** The book the ranking comes from, for the credit line. */
export interface HundredBook {
  title: string
  author: string
  edition: string
  publisher: string
  year: number
  first_edition: number
  /** What the ranking measures and how the edition differs from the first, for the brief. */
  note: string
}

export interface HundredDomain {
  id: string
  name: string
}

/** A band of years (negative is BCE) the act Hart ranks a person for falls in, the era reel. */
export interface HundredEra {
  id: string
  name: string
  from: number | null
  to: number | null
}

/** One entry of Hart's ranking, as the dataset places it. */
export interface HundredPerson {
  /** Hart's rank, 1 to 100. */
  rank: number
  id: string
  name: string
  /** The name as Hart printed it ("Ts'ai Lun", "Asoka"). */
  hart_name: string
  /** The English Wikipedia title. */
  wiki: string
  /** The Wikidata item ("Q935"). */
  wikidata: string
  /** HundredDomain.id: what the person is ranked for. */
  domain: string
  /** HundredEra.id: when the act Hart ranks them for happened. */
  era: string
  /** Where they were based. */
  region: string
  /** Earliest birth and death years on Wikidata, astronomical (0 is 1 BCE, -383 is 384 BCE); null when not on record. */
  born: number | null
  died: number | null
  flags: HundredFlag[]
  /** What the brief must say up front, when anything. */
  note?: string
}

export interface HundredDataset {
  book: HundredBook
  domains: HundredDomain[]
  eras: HundredEra[]
  regions: string[]
  people: HundredPerson[]
  lenses: NamedOption[]
}

/** A birth or death as Wikidata records it: the date at its own precision, and the place with its coordinates. */
export interface HundredLifeEvent {
  /** "4 January 1643", "c. 5th century BCE": formatted at the precision Wikidata gives. */
  date: string | null
  /** Astronomical year, as above. */
  year: number | null
  place: string | null
  lat: number | null
  lon: number | null
}

export type HundredSourceState = 'ok' | 'failed' | 'skipped'

/**
 * What a spin reads live about the person it drew (hundredPool.ts), after
 * the draw: Wikidata (description, birth and death with places and
 * coordinates, portrait, sitelinks), the English Wikipedia summary, and a
 * year of monthly pageviews. Never blocks a spin: a source that fails is
 * recorded and the brief says to look it up.
 */
export interface HundredProfile {
  /** ISO timestamp the profile was read. */
  asOf: string
  wikidataUrl: string
  wikipediaUrl: string
  /** Wikidata's one-line description. */
  description: string | null
  /** The Wikipedia summary's first paragraph (CC BY-SA: context for the agent, never pasted onto the page). */
  extract: string | null
  born: HundredLifeEvent | null
  died: HundredLifeEvent | null
  /** The portrait (Wikimedia Commons, Special:FilePath) and its file page for the licence; null when withheld or missing. */
  image: string | null
  imagePage: string | null
  /** Wikipedia editions with an article on the person: a rough measure of reach. */
  sitelinks: number | null
  /** English Wikipedia views by month (user agents only), oldest first. */
  pageviews: Array<{ month: string; views: number }>
  sources: { wikidata: HundredSourceState; wikipedia: HundredSourceState; pageviews: HundredSourceState; errors: string[]; notes: string[] }
}

export interface HundredPicks {
  /** HundredDomain.id */
  domain: string
  /** HundredEra.id */
  era: string
  /** HundredPerson.rank */
  rank: number
  lens: string
}

export interface HundredSubject {
  randomizer: 'hundred'
  book: HundredBook
  domain: HundredDomain
  era: HundredEra
  person: HundredPerson
  lens: NamedOption
  /** The people ranked just above and below: the comparison the rank invites. */
  neighbours: { above: HundredPerson | null; below: HundredPerson | null }
  /** Read after the draw (spins.ts); null on a spin replayed without the network. */
  profile: HundredProfile | null
  /** The next rank after the previous spin's (sequence mode). */
  sequence: boolean
}

/* ---------- Footshorts ---------- */

export type FootshortsCompetitionKind = 'domestic' | 'continental' | 'international'

export interface FootshortsCompetition {
  /** fixtures.competition_slug, the key the draw and the match tables use. */
  slug: string
  name: string
  kind: FootshortsCompetitionKind
  /** Country, or Europe / World for the continental and international ones. */
  country: string
  /** The league entity's slug(s) in `entities`, for its tagged news (the World Cup has two in the wild). */
  entity_slugs: string[]
}

export interface FootshortsFreshness {
  name: 'Matchday' | 'Running story' | 'Evergreen'
  /** The news window in days; null for Evergreen. */
  days: number | null
  window: string
}

export interface FootshortsDataset {
  competitions: FootshortsCompetition[]
  angles: NamedOption[]
  freshness: FootshortsFreshness[]
}

/** A tagged footshorts article, as the news snapshot keeps it. */
export interface FootshortsHeadline {
  title: string
  url: string
  publisher: string
  /** ISO date, YYYY-MM-DD. */
  date: string
}

/** One fixture a team played or will play, as the spin snapshots it. */
export interface FootshortsFixtureRef {
  /** fixtures.id: the brief appends its match context. */
  id: string
  competition: string
  kickoff: string
  /** football-data.org status: FINISHED, SCHEDULED, TIMED, IN_PLAY, POSTPONED… */
  status: string
  homeId: string | null
  awayId: string | null
  home: string
  away: string
  homeScore: number | null
  awayScore: number | null
}

/**
 * One team in the live news snapshot (spins.ts loadFootshortsNews): its
 * entity, the competitions it has fixtures in, and its news heat.
 */
export interface FootshortsTeamNews {
  /** entities.id */
  id: string
  /** entities.slug */
  slug: string
  name: string
  country: string | null
  crestUrl: string | null
  /** Competition slugs (dataset keys) the team has fixtures in, in the window. */
  competitions: string[]
  /** 0 to 100, relative to the busiest team in the snapshot. */
  heat: number
  /** Distinct stories (cluster leads) tagged with the team in the news window. */
  articles: number
  /** Newest first, up to 3. */
  headlines: FootshortsHeadline[]
  /** The last finished fixtures (newest first) and the next ones (soonest first), across competitions. */
  recent: FootshortsFixtureRef[]
  upcoming: FootshortsFixtureRef[]
}

export interface FootshortsCompetitionNews {
  slug: string
  /** 0 to 100, relative to the busiest competition. */
  heat: number
  /** Distinct stories tagged with the competition or any of its teams. */
  articles: number
  headlines: FootshortsHeadline[]
  /** Teams with fixtures in it, in the window. */
  teams: number
}

/** The live news the Footshorts draw reads (the Desk's heat, computed from the footshorts feed). */
export interface FootshortsNews {
  /** ISO timestamp the snapshot was read. */
  asOf: string
  /** The news window heat is counted over, in days. */
  windowDays: number
  competitions: FootshortsCompetitionNews[]
  teams: FootshortsTeamNews[]
}

/* ---------- VizNBA ---------- */

export type ViznbaConferenceSlug = 'east' | 'west'

export interface ViznbaConference {
  slug: ViznbaConferenceSlug
  name: string
  divisions: string[]
}

/** One franchise as the dataset fixes it (viznba_teams carries the rest). */
export interface ViznbaTeam {
  /** viznba_teams.team_id: ESPN's abbreviation lowercased ("lal", "gs", "utah"). */
  id: string
  /** ESPN team id: scoreboards and game summaries key on it. */
  espn_id: string
  /** The NBA abbreviation ("GSW"), as the league writes it. */
  abbreviation: string
  name: string
  conference: ViznbaConferenceSlug
  division: string
  /** Team colour, hex. */
  color: string
}

export interface ViznbaFreshness {
  name: 'Last night' | 'This week' | 'Evergreen'
  /** The news window in days; null for Evergreen. */
  days: number | null
  window: string
}

export interface ViznbaDataset {
  conferences: ViznbaConference[]
  teams: ViznbaTeam[]
  angles: NamedOption[]
  freshness: ViznbaFreshness[]
}

/** A tagged VizNBA article, as the news snapshot keeps it. */
export interface ViznbaHeadline {
  title: string
  url: string
  publisher: string
  /** ISO date, YYYY-MM-DD. */
  date: string
  /** The worker's topic: game, transaction, injury, draft, front_office, league, analysis, off_court. */
  topic: string | null
}

/** One game a team played or will play, from ESPN's scoreboard. */
export interface ViznbaGameRef {
  /** ESPN event id: the brief appends that game's box score. */
  id: string
  /** ISO timestamp of the tip-off. */
  date: string
  /** ESPN's state: pre, in or post. */
  state: 'pre' | 'in' | 'post'
  /** Preseason, Regular Season, Play-In, Postseason… as ESPN labels it. */
  season: string | null
  homeId: string | null
  awayId: string | null
  home: string
  away: string
  homeScore: number | null
  awayScore: number | null
}

/** A player or coach whose stories put the team in the news. */
export interface ViznbaPersonNews {
  id: string
  name: string
  kind: 'player' | 'coach'
  articles: number
}

/** One franchise in the live news snapshot (spins.ts loadViznbaNews). */
export interface ViznbaTeamNews {
  /** viznba_teams.team_id */
  id: string
  espnId: string
  abbreviation: string
  name: string
  conference: ViznbaConferenceSlug
  division: string
  logoUrl: string | null
  color: string
  /** 0 to 100, relative to the busiest franchise in the snapshot. */
  heat: number
  /** Distinct stories tagged with the team, or a player or coach on it, in the news window. */
  articles: number
  /** Newest first, up to 3. */
  headlines: ViznbaHeadline[]
  /** The most-tagged people on the roster, up to 3. */
  people: ViznbaPersonNews[]
  /** The last finished games (newest first) and the next ones (soonest first). */
  recent: ViznbaGameRef[]
  upcoming: ViznbaGameRef[]
}

export interface ViznbaConferenceNews {
  slug: ViznbaConferenceSlug
  /** 0 to 100, relative to the busier conference. */
  heat: number
  /** Distinct stories tagged with any of its teams. */
  articles: number
  headlines: ViznbaHeadline[]
}

/** The live news the NBA Desk draws from, read from the viznba_ tables and ESPN's scoreboard. */
export interface ViznbaNews {
  /** ISO timestamp the snapshot was read. */
  asOf: string
  /** The news window heat is counted over, in days. */
  windowDays: number
  conferences: ViznbaConferenceNews[]
  teams: ViznbaTeamNews[]
  /** The schedule read from ESPN; when it failed, the draw runs on the news alone and says so. */
  schedule: { ok: boolean; games: number; error: string | null }
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

export interface ViznbaPicks {
  conference: ViznbaConferenceSlug
  /** viznba_teams.team_id */
  team: string
  angle: string
  fresh: ViznbaFreshness['name']
  freshDrawn: ViznbaFreshness['name']
  /** viznba_teams.team_id of the head-to-head opponent. */
  opponent?: string
}

export interface FootshortsPicks {
  competition: string
  /** entities.slug of the team. */
  team: string
  angle: string
  fresh: FootshortsFreshness['name']
  freshDrawn: FootshortsFreshness['name']
  /** entities.slug of the head-to-head opponent. */
  opponent?: string
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

export interface FootshortsSubject {
  randomizer: 'footshorts'
  competition: FootshortsCompetition & { heat: number; articles: number }
  team: FootshortsTeamNews
  opponent: FootshortsTeamNews | null
  angle: NamedOption
  freshness: FootshortsFreshness
  /** Days since the team's newest tagged story, or null when none is on file. */
  lastDevelopmentDays: number | null
  /** When the news snapshot was read, and its window. */
  newsAsOf: string
  newsWindowDays: number
  /**
   * The fixtures the brief appends match context for: the team's (or the
   * head-to-head's) recent results and next match, ids from `fixtures`.
   */
  fixtureIds: string[]
}

export interface ViznbaSubject {
  randomizer: 'viznba'
  conference: ViznbaConference & { heat: number; articles: number }
  team: ViznbaTeamNews
  opponent: ViznbaTeamNews | null
  angle: NamedOption
  freshness: ViznbaFreshness
  /** Days since the team's newest tagged story, or null when none is on file. */
  lastDevelopmentDays: number | null
  /** When the news snapshot was read, and its window. */
  newsAsOf: string
  newsWindowDays: number
  /**
   * The games the brief appends box scores for: the team's (or the
   * head-to-head's) recent results and next game, ESPN event ids.
   */
  gameIds: string[]
}

export type SpinSubject = DeskSubject | AtlasSubject | EpicsSubject | OcwSubject | LandmarkSubject | HundredSubject | FootshortsSubject | ViznbaSubject
export type SpinPicks = DeskPicks | AtlasPicks | EpicsPicks | OcwPicks | LandmarkPicks | HundredPicks | FootshortsPicks | ViznbaPicks

/** Balancing memory the next draw reads back. */
export interface SpinMeta {
  region?: string
  /** Footshorts: the competition slug, for the same-tournament-twice rule. */
  competition?: string
  /** NBA Desk: the conference, for the same-conference-twice rule. */
  conference?: string
  pair?: boolean
  tradition?: string
  types?: EpicType[]
  heat?: number
  /** OCW Desk: the field and topic ids and the kind, for the field re-draw, the topic block and the hands-on quota. */
  field?: number
  topic?: number
  kind?: string
  /** Landmark Desk: the field and prize ids and whether the prize names the work, for the field re-draw, the prize block and the work-level quota. */
  fieldId?: string
  prize?: string
  workLevel?: boolean
  /** The 100 Desk: the domain, for the same-domain-twice rule, and the rank, for walking the ranking. */
  domain?: string
  rank?: number
}

export interface DrawResult {
  randomizer: RandomizerId
  picks: SpinPicks
  subject: SpinSubject
  reels: Record<string, ReelValue>
  /** The single primary reel value the 30-day block keys on (sub-industry, country, epic, team, course, laureate, person). */
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
