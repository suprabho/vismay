/**
 * The three randomizers' datasets (playbook 4: one JSON file per randomizer),
 * typed. Pure, so the admin slot machine can fill its reel strips from them.
 */

import type { AtlasDataset, DeskDataset, Epic, EpicPlace, EpicsDataset } from './types'
import deskJson from './data/desk.json'
import atlasJson from './data/atlas.json'
import epicsJson from './data/epics.json'

export const DESK = deskJson as unknown as DeskDataset
export const ATLAS = atlasJson as unknown as AtlasDataset
export const EPICS = epicsJson as unknown as EpicsDataset

/** Types that count toward the one-in-three quota (playbook 3.2). */
export function isPhilosophical(types: readonly string[] | undefined): boolean {
  return !!types?.some((t) => t === 'Philosophical and spiritual' || t === 'Foundational and creation')
}

/** Every place of an epic in text order, with the episode it sits in: the route sequence mode walks. */
export function epicRoute(epic: Epic): Array<{ episodeId: string; place: EpicPlace }> {
  return epic.episodes.flatMap((ep) => ep.places.map((place) => ({ episodeId: ep.id, place })))
}

/** Values a reel can show, for the spin animation's blur of candidates. */
export function reelPool(randomizer: 'desk' | 'atlas' | 'epics', key: string): string[] {
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
  return []
}
