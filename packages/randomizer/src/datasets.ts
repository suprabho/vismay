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
 * Open Library and Unpaywall).
 */

import type {
  AtlasDataset,
  DeskDataset,
  Epic,
  EpicPlace,
  EpicsDataset,
  FootshortsDataset,
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
import footshortsJson from './data/footshorts.json'
import viznbaJson from './data/viznba.json'

export const DESK = deskJson as unknown as DeskDataset
export const ATLAS = atlasJson as unknown as AtlasDataset
export const EPICS = epicsJson as unknown as EpicsDataset
export const OCW = ocwJson as unknown as OcwDataset
export const LANDMARK = landmarkJson as unknown as LandmarkDataset
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
 * and titles from the spin's pool).
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
