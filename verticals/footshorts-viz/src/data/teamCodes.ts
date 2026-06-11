import { findTeam, slugify } from './teams'

/**
 * National-team → FIFA 3-letter code (KOR, CZE, RSA…). FIFA codes are mostly
 * ISO 3166-1 alpha-3 with the usual football exceptions, and are NOT derivable
 * from the name (Germany→GER, Netherlands→NED, South Korea→KOR), so they need
 * an explicit table.
 *
 * Keyed by slugified name so it matches whatever the fixture row carries. The
 * canonical set mirrors apps/vizmaya-fyi/scripts/fifa-wc26/import.ts; extra
 * aliases below cover the names football-data.org emits (which differ from the
 * FIFA source: "Korea Republic" not "South Korea", "Turkey" not "Türkiye", …).
 */
const FIFA_CODES: Record<string, string> = {
  'united-states': 'USA',
  usa: 'USA',
  mexico: 'MEX',
  canada: 'CAN',
  england: 'ENG',
  france: 'FRA',
  spain: 'ESP',
  portugal: 'POR',
  germany: 'GER',
  netherlands: 'NED',
  belgium: 'BEL',
  croatia: 'CRO',
  turkiye: 'TUR',
  turkey: 'TUR',
  switzerland: 'SUI',
  norway: 'NOR',
  sweden: 'SWE',
  austria: 'AUT',
  czechia: 'CZE',
  'czech-republic': 'CZE',
  scotland: 'SCO',
  'bosnia-herz': 'BIH',
  'bosnia-herzegovina': 'BIH',
  'bosnia-and-herzegovina': 'BIH',
  argentina: 'ARG',
  brazil: 'BRA',
  colombia: 'COL',
  uruguay: 'URU',
  ecuador: 'ECU',
  paraguay: 'PAR',
  morocco: 'MAR',
  senegal: 'SEN',
  'ivory-coast': 'CIV',
  'cote-d-ivoire': 'CIV',
  algeria: 'ALG',
  ghana: 'GHA',
  egypt: 'EGY',
  tunisia: 'TUN',
  'south-africa': 'RSA',
  'cape-verde': 'CPV',
  japan: 'JPN',
  'south-korea': 'KOR',
  'korea-republic': 'KOR',
  iran: 'IRN',
  'ir-iran': 'IRN',
  australia: 'AUS',
  'saudi-arabia': 'KSA',
  qatar: 'QAT',
  uzbekistan: 'UZB',
  jordan: 'JOR',
  panama: 'PAN',
  haiti: 'HAI',
  curacao: 'CUW',
  'new-zealand': 'NZL',
  'dr-congo': 'COD',
  'congo-dr': 'COD',
  iraq: 'IRQ',
}

// Derive a 3-letter code from a display name when nothing else matches: the
// first three letters, uppercased ("Czechia"→"CZE"). Imperfect for multi-word
// names but a sane last resort that keeps the cell to three characters.
function deriveCode(name: string): string {
  const letters = name.replace(/[^A-Za-z]/g, '')
  if (letters.length === 0) return name.slice(0, 3).toUpperCase()
  return letters.slice(0, 3).toUpperCase()
}

/**
 * 3-letter team code for a bracket/compact cell. Prefers the FIFA code for
 * national teams, then a bundled club monogram (AFC, MCI, RMA…), then a derived
 * abbreviation. `fallbackName` covers fixture rows that carry a raw team name
 * but no slug.
 */
export function teamCode(
  slugOrName: string | null | undefined,
  fallbackName?: string | null,
): string {
  const raw = slugOrName ?? fallbackName ?? ''
  const key = slugify(raw)
  if (FIFA_CODES[key]) return FIFA_CODES[key]!

  const team = findTeam(raw)
  if (team?.monogram) return team.monogram.toUpperCase().slice(0, 3)

  return deriveCode(team?.name ?? fallbackName ?? raw)
}
