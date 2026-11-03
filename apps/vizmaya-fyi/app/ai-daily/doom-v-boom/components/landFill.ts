import type { DcRegionKey } from '@vismay/dc-editions/dcEditionTypes'
import { LAND_MASK } from './landMask'
import { LAND_COUNTRY, LAND_REGION } from './landCountry'

/** Number of dots in the land mask. */
export const DOT_COUNT = LAND_MASK.length / 2

const REGION_OF_CHAR: Record<string, DcRegionKey> = { n: 'na', e: 'ea', u: 'eu', m: 'me', o: 'other' }

/** ISO alpha-2 country of dot i, or null. */
export const dotCountry = (i: number): string | null => {
  const c = LAND_COUNTRY.slice(i * 2, i * 2 + 2)
  return c === '--' ? null : c
}

/** World region of dot i, or null. */
export const dotRegion = (i: number): DcRegionKey | null => REGION_OF_CHAR[LAND_REGION[i]] ?? null

let byCountry: Map<string, number[]> | null = null
let byRegion: Map<DcRegionKey, number[]> | null = null

/** Dot indices per country, built once. */
export function countryDots(code: string): number[] {
  if (!byCountry) {
    byCountry = new Map()
    for (let i = 0; i < DOT_COUNT; i++) {
      const c = dotCountry(i)
      if (!c) continue
      const list = byCountry.get(c)
      if (list) list.push(i)
      else byCountry.set(c, [i])
    }
  }
  return byCountry.get(code) ?? []
}

/** Dot indices per world region, built once. */
export function regionDots(key: DcRegionKey): number[] {
  if (!byRegion) {
    byRegion = new Map()
    for (let i = 0; i < DOT_COUNT; i++) {
      const r = dotRegion(i)
      if (!r) continue
      const list = byRegion.get(r)
      if (list) list.push(i)
      else byRegion.set(r, [i])
    }
  }
  return byRegion.get(key) ?? []
}

/** The dot nearest a lng/lat — stands in for a country too small to own a dot (Singapore, Bahrain). */
export function nearestDot(lng: number, lat: number): number {
  let best = 0
  let bd = Infinity
  for (let i = 0; i < DOT_COUNT; i++) {
    const d = (LAND_MASK[i * 2] / 10 - lng) ** 2 + (LAND_MASK[i * 2 + 1] / 10 - lat) ** 2
    if (d < bd) {
      bd = d
      best = i
    }
  }
  return best
}
