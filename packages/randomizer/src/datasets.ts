/**
 * The randomizers' datasets (playbook 4: one JSON file per randomizer),
 * typed. Pure, so the admin slot machine can fill its reel strips from them.
 * Footshorts' teams aren't here: they come from the live news snapshot
 * (FootshortsNews), so the reel only ever offers clubs with fixtures. The NBA
 * Desk's 30 franchises are fixed, so they are (with their conference and
 * division); the snapshot (ViznbaNews) adds their news and games. The OCW
 * Desk's fields, topics, kinds and lenses are here (ocw.json, refreshed by
 * scripts/randomizer/ocw-taxonomy.mts); its courses and resources come from
 * the live pool a spin reads (OcwPool). The Landmark Desk's fields, prizes,
 * eras and lenses are here too (landmark.json, refreshed by
 * scripts/randomizer/landmark-taxonomy.mts); its laureates and works come
 * from the live pool (LandmarkPool: the Nobel Prize API, Wikidata, OpenAlex,
 * Open Library and Unpaywall). The 100 Desk's whole ranking is here
 * (hundred.json, refreshed by scripts/randomizer/hundred-taxonomy.mts); only
 * the drawn person's profile is read live (HundredProfile: Wikidata,
 * Wikipedia and its pageviews). The Evidence Desk's whole collection is here
 * too (evidence.json, parsed from the annotated research collection in
 * scripts/randomizer/sources/ by scripts/randomizer/evidence-taxonomy.mts);
 * only the drawn study's citation record is read live (EvidenceRecord:
 * OpenAlex and Unpaywall). The Frontier Desk's areas, windows and lenses
 * are here (frontier.json); its papers are read live from AI Daily's
 * dc_papers table at spin time (spins.ts loadFrontierPool), and the drawn
 * paper's record from arXiv and OpenAlex after the draw (frontierPool.ts).
 * The Curious Desk's eras, regions, themes, grades and lenses are here
 * (curious.json; the era, region and theme ids match packages/curious-pipeline's
 * taxonomy.ts); its claims are read live from the curious_claim_pool view at
 * spin time (spins.ts loadCuriousPool), and the drawn claim's record from
 * Crossref, Google Books, Wikidata and the Wayback Machine after the draw
 * (curiousPool.ts).
 */

import type {
  AtlasDataset,
  CuriousClaim,
  CuriousDataset,
  CuriousEra,
  CuriousTheme,
  DeskDataset,
  Epic,
  EpicPlace,
  EpicsDataset,
  EvidenceDataset,
  EvidenceStudy,
  FootshortsDataset,
  FrontierDataset,
  FrontierPaper,
  FrontierWindow,
  HundredDataset,
  HundredPerson,
  LandmarkDataset,
  LandmarkPrize,
  OcwDataset,
  OcwKind,
  RandomizerId,
  ViznbaDataset,
} from './types'
import deskJson from './data/desk.json'
import atlasJson from './data/atlas.json'
import epicsJson from './data/epics.json'
import ocwJson from './data/ocw.json'
import landmarkJson from './data/landmark.json'
import hundredJson from './data/hundred.json'
import evidenceJson from './data/evidence.json'
import frontierJson from './data/frontier.json'
import curiousJson from './data/curious.json'
import footshortsJson from './data/footshorts.json'
import viznbaJson from './data/viznba.json'

export const DESK = deskJson as unknown as DeskDataset
export const ATLAS = atlasJson as unknown as AtlasDataset
export const EPICS = epicsJson as unknown as EpicsDataset
export const OCW = ocwJson as unknown as OcwDataset
export const LANDMARK = landmarkJson as unknown as LandmarkDataset
export const HUNDRED = hundredJson as unknown as HundredDataset
export const EVIDENCE = evidenceJson as unknown as EvidenceDataset
export const FRONTIER = frontierJson as unknown as FrontierDataset
export const CURIOUS = curiousJson as unknown as CuriousDataset
export const FOOTSHORTS = footshortsJson as unknown as FootshortsDataset
export const VIZNBA = viznbaJson as unknown as ViznbaDataset

/** Kinds that count toward the OCW Desk's one-in-three hands-on quota. */
export function isHandsOn(kind: Pick<OcwKind, 'hands_on'> | string | undefined, data: OcwDataset = OCW): boolean {
  const k = typeof kind === 'string' ? data.kinds.find((x) => x.name === kind) : kind
  return !!k?.hands_on
}

/** Prizes that count toward the Landmark Desk's one-in-three work-level quota: their citation or an official document names the work. */
export function isWorkLevel(prize: Pick<LandmarkPrize, 'work_level'> | string | undefined, data: LandmarkDataset = LANDMARK): boolean {
  const p = typeof prize === 'string' ? data.prizes.find((x) => x.id === prize) : prize
  return !!p?.work_level
}

/** A prize has awards in an era (at the last taxonomy refresh): the plan only draws stocked pairs. */
export function landmarkStocked(prize: Pick<LandmarkPrize, 'awards'>, era?: string): boolean {
  return era ? (prize.awards[era] ?? 0) > 0 : Object.values(prize.awards).some((n) => n > 0)
}

/** The domain and era pairs with people in them: the draw only offers an era its domain has. */
export function hundredEras(domain: string, data: HundredDataset = HUNDRED): HundredDataset['eras'] {
  return data.eras.filter((e) => data.people.some((p) => p.domain === domain && p.era === e.id))
}

/** One person by Hart's rank. */
export function hundredByRank(rank: number, data: HundredDataset = HUNDRED): HundredPerson | undefined {
  return data.people.find((p) => p.rank === rank)
}

/** The designs a theme has studies of: the draw only offers a design its theme has. */
export function evidenceDesigns(theme: string, data: EvidenceDataset = EVIDENCE): EvidenceDataset['designs'] {
  return data.designs.filter((d) => data.studies.some((s) => s.theme === theme && s.design === d.id))
}

/** One study by its number in the collection ("#14"). */
export function evidenceByNumber(n: number, data: EvidenceDataset = EVIDENCE): EvidenceStudy | undefined {
  return data.studies.find((s) => s.n === n)
}

/** A paper's age in whole days at `now` (never negative). */
export function frontierAgeDays(paper: Pick<FrontierPaper, 'publishedAt'>, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(paper.publishedAt)) / 864e5))
}

/** The window a paper falls in at `now`: This week, This month or the back catalogue. */
export function frontierWindowOf(paper: Pick<FrontierPaper, 'publishedAt'>, now: number, data: FrontierDataset = FRONTIER): FrontierWindow {
  const age = frontierAgeDays(paper, now)
  return data.windows.find((w) => age >= w.min_days && (w.max_days === null || age < w.max_days)) ?? data.windows[data.windows.length - 1]!
}

/** The era a year falls in (astronomical years), or the undated era. */
export function curiousEraOf(year: number | null | undefined, data: CuriousDataset = CURIOUS): CuriousEra {
  const undated = data.eras.find((e) => e.id === 'undated') ?? data.eras[data.eras.length - 1]!
  if (year == null || !Number.isFinite(year)) return undated
  return data.eras.find((e) => e.id !== 'undated' && (e.from == null || year >= e.from) && (e.to == null || year <= e.to)) ?? undated
}

export function curiousEra(id: string, data: CuriousDataset = CURIOUS): CuriousEra | undefined {
  return data.eras.find((e) => e.id === id)
}

export function curiousTheme(id: string | null, data: CuriousDataset = CURIOUS): CuriousTheme | undefined {
  return id ? data.themes.find((t) => t.id === id) : undefined
}

/** "Grade B" or "ungraded", for reels and labels. */
export function curiousGradeLabel(claim: Pick<CuriousClaim, 'grade'>): string {
  return claim.grade ? `Grade ${claim.grade}` : 'ungraded'
}

/** Types that count toward the one-in-three quota (playbook 3.2). */
export function isPhilosophical(types: readonly string[] | undefined): boolean {
  return !!types?.some((t) => t === 'Philosophical and spiritual' || t === 'Foundational and creation')
}

/** Every place of an epic in text order, with the episode it sits in: the route sequence mode walks. */
export function epicRoute(epic: Epic): Array<{ episodeId: string; place: EpicPlace }> {
  return epic.episodes.flatMap((ep) => ep.places.map((place) => ({ episodeId: ep.id, place })))
}

/**
 * Values a reel can show, for the spin animation's blur of candidates.
 * `live` fills the reels no dataset has: the Footshorts team and opponent
 * reels (names from the news snapshot), the OCW course and resource reels
 * (names from the spin's pool), the Landmark laureate and work reels (names
 * and titles from the spin's pool), the Frontier paper reel (titles from
 * the spin's pool).
 */
export function reelPool(randomizer: RandomizerId, key: string, live: readonly string[] = []): string[] {
  if (randomizer === 'desk') {
    if (key === 'industry') return DESK.industries.map((i) => i.name)
    if (key === 'sub') return DESK.sub_industries.map((s) => s.name)
    if (key === 'lens') return DESK.lenses.map((l) => l.name)
    if (key === 'fresh') return DESK.freshness.map((f) => f.name)
  }
  if (randomizer === 'atlas') {
    if (key === 'country' || key === 'pair') return ATLAS.countries.map((c) => c.name)
    if (key === 'thread') return ATLAS.threads
    if (key === 'time') return ATLAS.time_depths.map((t) => t.name)
    if (key === 'frame') return ATLAS.frames.map((f) => f.name)
    if (key === 'lens') return ATLAS.lenses.map((l) => l.name)
  }
  if (randomizer === 'epics') {
    if (key === 'epic') return EPICS.epics.map((e) => e.title)
    if (key === 'episode') return EPICS.epics.flatMap((e) => e.episodes.map((ep) => ep.name))
    if (key === 'place') return EPICS.epics.flatMap((e) => epicRoute(e).map((r) => r.place.name))
    if (key === 'lens') return EPICS.lenses.map((l) => l.name)
  }
  if (randomizer === 'ocw') {
    if (key === 'field') return OCW.fields.map((f) => f.name)
    if (key === 'topic') return OCW.topics.map((t) => t.name)
    if (key === 'kind') return OCW.kinds.map((k) => k.name)
    if (key === 'course' || key === 'resource') return [...live]
    if (key === 'lens') return OCW.lenses.map((l) => l.name)
  }
  if (randomizer === 'landmark') {
    if (key === 'field') return LANDMARK.fields.map((f) => f.name)
    if (key === 'prize') return LANDMARK.prizes.map((p) => p.name)
    if (key === 'era') return LANDMARK.eras.map((e) => e.name)
    if (key === 'laureate' || key === 'work') return [...live]
    if (key === 'lens') return LANDMARK.lenses.map((l) => l.name)
  }
  if (randomizer === 'hundred') {
    if (key === 'domain') return HUNDRED.domains.map((d) => d.name)
    if (key === 'era') return HUNDRED.eras.map((e) => e.name)
    if (key === 'person') return HUNDRED.people.map((p) => p.name)
    if (key === 'lens') return HUNDRED.lenses.map((l) => l.name)
  }
  if (randomizer === 'evidence') {
    if (key === 'theme') return EVIDENCE.themes.map((t) => t.name)
    if (key === 'design') return EVIDENCE.designs.map((d) => d.name)
    if (key === 'study') return EVIDENCE.studies.map((s) => s.label)
    if (key === 'lens') return EVIDENCE.lenses.map((l) => l.name)
  }
  if (randomizer === 'frontier') {
    if (key === 'area') return FRONTIER.areas.map((a) => a.name)
    if (key === 'window') return FRONTIER.windows.map((w) => w.name)
    if (key === 'paper') return [...live]
    if (key === 'lens') return FRONTIER.lenses.map((l) => l.name)
  }
  if (randomizer === 'curious') {
    if (key === 'era') return CURIOUS.eras.map((e) => e.name)
    if (key === 'theme') return CURIOUS.themes.map((t) => t.name)
    if (key === 'claim') return [...live]
    if (key === 'lens') return CURIOUS.lenses.map((l) => l.name)
  }
  if (randomizer === 'footshorts') {
    if (key === 'competition') return FOOTSHORTS.competitions.map((c) => c.name)
    if (key === 'team' || key === 'pair') return [...live]
    if (key === 'angle') return FOOTSHORTS.angles.map((a) => a.name)
    if (key === 'fresh') return FOOTSHORTS.freshness.map((f) => f.name)
  }
  if (randomizer === 'viznba') {
    if (key === 'conference') return VIZNBA.conferences.map((c) => c.name)
    if (key === 'team' || key === 'pair') return VIZNBA.teams.map((t) => t.name)
    if (key === 'angle') return VIZNBA.angles.map((a) => a.name)
    if (key === 'fresh') return VIZNBA.freshness.map((f) => f.name)
  }
  return []
}
