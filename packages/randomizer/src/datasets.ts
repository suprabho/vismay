/**
 * The randomizers' datasets (playbook 4: one JSON file per randomizer),
 * typed. Pure, so the admin slot machine can fill its reel strips from them.
 * Footshorts' teams aren't here: they come from the live news snapshot
 * (FootshortsNews), so the reel only ever offers clubs with fixtures. The NBA
 * Desk's 30 franchises are fixed, so they are (with their conference and
 * division); the snapshot (ViznbaNews) adds their news and games.
 */

import type {
  AtlasDataset,
  DeskDataset,
  Epic,
  EpicPlace,
  EpicsDataset,
  FootshortsDataset,
  RandomizerId,
  ViznbaDataset,
} from './types'
import deskJson from './data/desk.json'
import atlasJson from './data/atlas.json'
import epicsJson from './data/epics.json'
import footshortsJson from './data/footshorts.json'
import viznbaJson from './data/viznba.json'

export const DESK = deskJson as unknown as DeskDataset
export const ATLAS = atlasJson as unknown as AtlasDataset
export const EPICS = epicsJson as unknown as EpicsDataset
export const FOOTSHORTS = footshortsJson as unknown as FootshortsDataset
export const VIZNBA = viznbaJson as unknown as ViznbaDataset

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
 * `teams` fills the Footshorts team and opponent reels (names from the news snapshot).
 */
export function reelPool(randomizer: RandomizerId, key: string, teams: readonly string[] = []): string[] {
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
  if (randomizer === 'footshorts') {
    if (key === 'competition') return FOOTSHORTS.competitions.map((c) => c.name)
    if (key === 'team' || key === 'pair') return [...teams]
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
