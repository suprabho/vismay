/**
 * Wikidata for entity reconciliation: a QID per named entity, life dates
 * for people, a date for works and events, a country for places, and the
 * living-private-person signal (a human with no death date and few
 * sitelinks) the personal-data policy keys off. CC0.
 */

import { assertAllowed } from '../policy'
import { getJsonOrNull, type Limiter } from '../http'
import type { CuriousEnv, EntityKind } from '../types'

export const WIKIDATA_RULES = {
  api: 'https://www.wikidata.org/w/api.php',
  /** A human with at most this many Wikipedia editions and no death date is treated as a private person. */
  privateSitelinks: 2,
  version: 'curious-wikidata-v1-2026-11',
} as const

export interface WikidataEntity {
  qid: string
  label: string | null
  description: string | null
  isHuman: boolean
  birthYear: number | null
  deathYear: number | null
  /** P571 inception / P577 publication / P585 point in time, the earliest. */
  year: number | null
  countryCode: string | null
  sitelinks: number
  isLivingPrivate: boolean
}

interface WbSearch {
  search?: Array<{ id: string; label?: string; description?: string }>
}
interface WbEntities {
  entities?: Record<
    string,
    {
      labels?: Record<string, { value: string }>
      descriptions?: Record<string, { value: string }>
      claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>>
      sitelinks?: Record<string, unknown>
    }
  >
}

const timeYear = (v: unknown): number | null => {
  const t = (v as { time?: string } | undefined)?.time
  if (!t) return null
  const m = /^([+-])(\d+)-/.exec(t)
  return m ? Number(m[2]) * (m[1] === '-' ? -1 : 1) : null
}
const itemId = (v: unknown): string | null => (v as { id?: string } | undefined)?.id ?? null

const COUNTRY_QID: Record<string, string> = {
  Q30: 'US', Q145: 'GB', Q142: 'FR', Q183: 'DE', Q38: 'IT', Q29: 'ES', Q159: 'RU', Q15180: 'RU', Q668: 'IN', Q148: 'CN', Q17: 'JP', Q16: 'CA', Q408: 'AU', Q155: 'BR', Q96: 'MX', Q20: 'NO', Q34: 'SE', Q35: 'DK', Q55: 'NL', Q31: 'BE', Q39: 'CH', Q40: 'AT', Q36: 'PL', Q43: 'TR', Q79: 'EG', Q258: 'ZA', Q843: 'PK', Q902: 'BD', Q884: 'KR', Q423: 'KP', Q41: 'GR', Q45: 'PT', Q27: 'IE', Q33: 'FI', Q212: 'UA', Q794: 'IR', Q796: 'IQ', Q801: 'IL', Q851: 'SA', Q334: 'SG', Q252: 'ID', Q869: 'TH', Q881: 'VN', Q928: 'PH', Q414: 'AR', Q298: 'CL', Q739: 'CO', Q419: 'PE', Q77: 'UY', Q717: 'VE', Q1033: 'NG', Q114: 'KE', Q1028: 'MA', Q262: 'DZ', Q948: 'TN', Q1016: 'LY', Q115: 'ET', Q664: 'NZ', Q213: 'CZ', Q28: 'HU', Q218: 'RO', Q219: 'BG', Q224: 'HR', Q215: 'SI', Q214: 'SK', Q211: 'LV', Q37: 'LT', Q191: 'EE', Q189: 'IS', Q233: 'MT', Q229: 'CY', Q232: 'KZ', Q265: 'UZ', Q230: 'GE', Q399: 'AM', Q227: 'AZ', Q836: 'MM', Q854: 'LK', Q837: 'NP', Q917: 'BT', Q889: 'AF', Q865: 'TW', Q8646: 'HK', Q241: 'CU', Q766: 'JM', Q786: 'DO', Q790: 'HT', Q774: 'GT', Q792: 'SV', Q783: 'HN', Q811: 'NI', Q800: 'CR', Q804: 'PA', Q750: 'BO', Q733: 'PY', Q736: 'EC',
}

export function entityFromWikidata(qid: string, e: NonNullable<WbEntities['entities']>[string]): WikidataEntity {
  const claims = e.claims ?? {}
  const val = (p: string) => claims[p]?.[0]?.mainsnak?.datavalue?.value
  const instanceOf = (claims.P31 ?? []).map((c) => itemId(c.mainsnak?.datavalue?.value)).filter(Boolean)
  const isHuman = instanceOf.includes('Q5')
  const birthYear = timeYear(val('P569'))
  const deathYear = timeYear(val('P570'))
  const years = [timeYear(val('P571')), timeYear(val('P577')), timeYear(val('P585')), timeYear(val('P580'))].filter((y): y is number => y != null)
  const country = itemId(val('P17')) ?? itemId(val('P27'))
  const sitelinks = Object.keys(e.sitelinks ?? {}).filter((k) => k.endsWith('wiki')).length
  return {
    qid,
    label: e.labels?.en?.value ?? Object.values(e.labels ?? {})[0]?.value ?? null,
    description: e.descriptions?.en?.value ?? null,
    isHuman,
    birthYear,
    deathYear,
    year: years.length ? Math.min(...years) : null,
    countryCode: country ? COUNTRY_QID[country] ?? null : null,
    sitelinks,
    isLivingPrivate: isHuman && deathYear == null && sitelinks <= WIKIDATA_RULES.privateSitelinks,
  }
}

export interface WikidataOptions {
  fetch?: typeof fetch
  env?: CuriousEnv
  limiter?: Limiter
  now?: Date
  language?: string
}

/** Resolve names to entities; a name with no search hit is left out. */
export async function resolveEntities(names: Array<{ name: string; kind: EntityKind }>, opts: WikidataOptions = {}): Promise<Map<string, WikidataEntity>> {
  assertAllowed('wikidata', { method: 'api', now: opts.now })
  const out = new Map<string, WikidataEntity>()
  const found: Array<{ name: string; qid: string }> = []
  for (const n of names.slice(0, 6)) {
    const p = new URLSearchParams({ action: 'wbsearchentities', search: n.name, language: opts.language ?? 'en', format: 'json', limit: '3', type: 'item' })
    const res = await getJsonOrNull<WbSearch>(`${WIKIDATA_RULES.api}?${p.toString()}`, { fetch: opts.fetch, limiter: opts.limiter, label: 'Wikidata' })
    const hit = res?.search?.[0]
    if (hit) found.push({ name: n.name, qid: hit.id })
  }
  if (!found.length) return out
  const p = new URLSearchParams({ action: 'wbgetentities', ids: found.map((f) => f.qid).join('|'), props: 'labels|descriptions|claims|sitelinks', languages: 'en', format: 'json' })
  const res = await getJsonOrNull<WbEntities>(`${WIKIDATA_RULES.api}?${p.toString()}`, { fetch: opts.fetch, limiter: opts.limiter, label: 'Wikidata' })
  for (const f of found) {
    const e = res?.entities?.[f.qid]
    if (e) out.set(f.name, entityFromWikidata(f.qid, e))
  }
  return out
}
