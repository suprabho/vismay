import { CREST_UPLOAD_TYPES, type HistoryCrest } from '@footshorts/shared/historicalCrests'
import { chargesFromText, rimFromText } from '@vismay/club-marks/charges'
import {
  CLUB_MARK_SPEC_VERSION, CREST_FAMILIES, INK, KIT_PATTERNS,
  type Charge, type ClubMarkCheck, type ClubMarkInput, type ClubMarkResult, type ClubMarkRow, type CrestFamily, type KitPattern, type PrintSwatch, type RimBand,
} from '@vismay/club-marks/types'

/**
 * Pure helpers for the Books → Crests viewer (client and server). The crests
 * come from `admin_season_crests` (vizmaya-data/football-seasons Layer 6);
 * an upload always wins over the crest crests.py picked.
 */

/** A club's row in admin_club_marks: its kit, the review overrides, and the generated mark (status null = not generated yet). */
export type ClubMarkView = {
  kit_pattern: string
  kit_c1: string
  kit_c2: string
  kit_confidence: number | null
  kit_source: string
  kit_page: string
  kit_needs_review: boolean
  kit_note: string
  override_family: CrestFamily | null
  override_code: string | null
  override_pattern: KitPattern | null
  override_c1: string | null
  override_c2: string | null
  /** Charges as text ("shape:#a/#b[@scale,rotate,x,y[,sx,sy]][~layer];…"); '' = explicitly none. */
  override_charge: string | null
  /** The rim as text ("#HEX@width;…", "none"); '' = the default ring; null = back to the editorial default. */
  override_rim: string | null
  /** Editorial defaults from data/mark_overrides.csv; the review overrides win. */
  seed_family: CrestFamily | null
  seed_charge: string | null
  /** The editorial field (data/mark_overrides.csv), when the design differs from the kit. */
  seed_pattern: KitPattern | null
  seed_c1: string | null
  seed_c2: string | null
  seed_rim: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  status: 'ok' | 'error' | null
  error_code: string | null
  error_message: string | null
  code: string | null
  crest: CrestFamily | null
  pattern: KitPattern | null
  c1: string | null
  c2: string | null
  ring: string | null
  /** The generated rim as text ('' = the default ring). */
  rim: string | null
  /** The generated charges as text ("shape:#hex[@scale,rotate,x,y];…"). */
  charge: string | null
  league: string | null
  era_from: number | null
  era_to: number | null
  family_confidence: number | null
  checks: ClubMarkCheck[] | null
  /** The kit colours' print-palette snaps, plus the mark's CMYK. */
  print: { c1: PrintSwatch; c2: PrintSwatch | null; cmyk?: ClubMarkResult['print'] } | null
  needs_review: boolean
  review_reasons: string[]
  alt: string | null
  spec_version: string | null
  generated_from: string | null
  generated_by: string | null
  generated_at: string | null
}

/** A crest as the viewer gets it: `image_url` is the upload (signed) or the picked crest's thumbnail; `mark` its club mark. */
export type CrestView = HistoryCrest & { image_url: string | null; mark: ClubMarkView | null }

export type CrestStatus = 'uploaded' | 'season' | 'current' | 'missing'
export type CrestFilter = 'all' | 'missing' | 'current' | 'flagged' | 'uploaded' | 'unmarked' | 'mark-review'
export const CREST_FILTERS: CrestFilter[] = ['all', 'missing', 'current', 'flagged', 'uploaded', 'unmarked', 'mark-review']

export const CREST_LEAGUES = ['Premier League', 'LaLiga', 'Serie A', 'Bundesliga', 'Ligue 1'] as const
export const OPPONENTS = 'Cup opponents'

export const CREST_STATUS_META: Record<CrestStatus, { label: string; className: string }> = {
  uploaded: { label: 'Uploaded', className: 'border-sky-400/40 bg-sky-400/10 text-sky-300' },
  season: { label: 'Season crest', className: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' },
  current: { label: 'Current only', className: 'border-rose-400/40 bg-rose-400/10 text-rose-300' },
  missing: { label: 'Missing', className: 'border-rose-400/60 bg-rose-400/15 text-rose-200' },
}

export function crestStatus(c: Pick<HistoryCrest, 'upload_path' | 'file_url' | 'era'>): CrestStatus {
  if (c.upload_path) return 'uploaded'
  if (!c.file_url) return 'missing'
  return c.era === 'season' ? 'season' : 'current'
}

/** Still wants a hand: nothing to show, only today's crest, or the pick was flagged. */
export function crestNeedsWork(c: HistoryCrest): boolean {
  const s = crestStatus(c)
  return s === 'missing' || s === 'current' || (s === 'season' && c.needs_review)
}

/** What a crest is built from: the upload (re-uploads change `uploaded_at`) or the picked file. */
export function crestSourceRef(c: Pick<HistoryCrest, 'upload_path' | 'uploaded_at' | 'file_url'>): string | null {
  if (c.upload_path) return `upload:${c.upload_path}@${c.uploaded_at ?? ''}`
  return c.file_url || null
}

// ── Club marks ─────────────────────────────────────────────────────────────

const HEX = /^#?[0-9a-f]{6}$/i
export const isHex = (v: string | null | undefined): v is string => !!v && HEX.test(v)
const asHex = (v: string) => (v.startsWith('#') ? v : `#${v}`).toUpperCase()

/** League code for the mark: the five top flights, else the club's country (FIFA-style, as on the spreads). */
const LEAGUE_CODES: Record<string, string> = {
  'Premier League': 'ENG', LaLiga: 'ESP', 'Serie A': 'ITA', Bundesliga: 'GER', 'Ligue 1': 'FRA',
}
const COUNTRY_CODES: Record<string, string> = {
  Spain: 'ESP', Italy: 'ITA', Germany: 'GER', France: 'FRA', 'Czech Republic': 'CZE', Greece: 'GRE', Netherlands: 'NED',
  Turkey: 'TUR', Austria: 'AUT', Belgium: 'BEL', Switzerland: 'SUI', Ukraine: 'UKR', Russia: 'RUS', Slovakia: 'SVK',
  Croatia: 'CRO', Finland: 'FIN', Romania: 'ROU', Sweden: 'SWE', Denmark: 'DEN', Bulgaria: 'BUL', Portugal: 'POR',
  'North Macedonia': 'MKD', Norway: 'NOR', Monaco: 'FRA', Cyprus: 'CYP', Poland: 'POL', Moldova: 'MDA', Georgia: 'GEO',
  Serbia: 'SRB', Hungary: 'HUN', Israel: 'ISR', Slovenia: 'SVN', Wales: 'WAL', Scotland: 'SCO', England: 'ENG',
}
export function leagueCode(c: Pick<HistoryCrest, 'top_flight' | 'country' | 'competitions'>): string {
  if (LEAGUE_CODES[c.top_flight]) return LEAGUE_CODES[c.top_flight]!
  // UK clubs: English cup entrants are ENG; the rest (Celtic, Rangers, Hearts …) play in Scotland.
  if (c.country === 'United Kingdom') return /FA Cup|League Cup/.test(c.competitions) ? 'ENG' : 'SCO'
  return COUNTRY_CODES[c.country] ?? ''
}

/** Crest era as season start years: "1989–2004" → 1989–2004, "…–present" → to null; undated → just this season. */
export function crestEra(c: Pick<HistoryCrest, 'era_label' | 'season'>): { from: number; to: number | null } {
  const start = Number(c.season.slice(0, 4))
  const m = c.era_label.match(/^(\d{4})\s*[–-]\s*(\d{4}|present)$/)
  if (!m) return { from: start, to: start }
  return { from: Number(m[1]), to: m[2] === 'present' ? null : Number(m[2]) }
}

/** The kit toClubMark gets: review overrides win over data/kits.csv ('' = explicitly none). Null when there is no usable kit. */
export function markKit(m: ClubMarkView | null): NonNullable<ClubMarkInput['kit']> | null {
  if (!m) return null
  // Review overrides win, then the editorial design (data/mark_overrides.csv), then data/kits.csv.
  const seeded = !!(m.seed_pattern || m.seed_c1)
  const pattern = (m.override_pattern ?? m.seed_pattern ?? m.kit_pattern) as KitPattern
  const c1 = m.override_c1 ?? m.seed_c1 ?? m.kit_c1
  const c2 = m.override_c2 !== null ? m.override_c2 : seeded ? m.seed_c2 : m.kit_c2
  if (!KIT_PATTERNS.includes(pattern) || !isHex(c1)) return null
  return { pattern, c1: asHex(c1), c2: isHex(c2) ? asHex(c2) : null }
}

/** The family set by hand: the review override, else the editorial default. Null = classify the crest. */
export const markFamily = (m: ClubMarkView | null): CrestFamily | null => m?.override_family ?? m?.seed_family ?? null
/** The rim: the review override, else the editorial default; undefined = the default ring + gap, [] = none. */
export const markRim = (m: ClubMarkView | null): RimBand[] | undefined => rimFromText(m?.override_rim != null ? m.override_rim : m?.seed_rim ?? '')
/** The charges: the review override ('' = none), else the editorial default. */
export const markCharges = (m: ClubMarkView | null): Charge[] =>
  chargesFromText(m?.override_charge != null ? m.override_charge : m?.seed_charge ?? '')

/** Everything a mark is generated from; a different fingerprint means the stored mark is stale. */
export function markFingerprint(c: HistoryCrest & { mark: ClubMarkView | null }): string {
  const m = c.mark
  return JSON.stringify([CLUB_MARK_SPEC_VERSION, crestSourceRef(c), markKit(m), markFamily(m), m?.override_code ?? null, markRim(m) ?? null, markCharges(m), leagueCode(c), crestEra(c)])
}

/** The stored mark as a row the renderer takes, or null when it is missing or malformed. */
export function markRow(m: ClubMarkView | null): ClubMarkRow | null {
  if (!m || m.status !== 'ok' || !m.code || !m.crest || !m.pattern || !isHex(m.c1)) return null
  if (!CREST_FAMILIES.includes(m.crest) || !KIT_PATTERNS.includes(m.pattern)) return null
  return {
    code: m.code, crest: m.crest, pattern: m.pattern, c1: asHex(m.c1), c2: isHex(m.c2) ? asHex(m.c2) : null,
    league: m.league ?? '', from: m.era_from ?? 0, to: m.era_to,
    ring: isHex(m.ring) ? asHex(m.ring) : INK, ...(rimFromText(m.rim) ? { rim: rimFromText(m.rim) } : {}), charges: chargesFromText(m.charge),
  }
}

/** `none` not generated, `stale` its inputs changed, `review` generated but flagged (or its code is taken), `nokit` nothing to fill it with. */
export type MarkState = 'ok' | 'review' | 'error' | 'stale' | 'none' | 'nokit'

export function markState(c: CrestView, duplicateCodes?: Set<string>): MarkState {
  const m = c.mark
  if (!m?.status) return markKit(m) ? 'none' : 'nokit'
  if (m.generated_from !== markFingerprint(c)) return 'stale'
  if (m.status === 'error') return 'error'
  if (m.needs_review || (m.code && duplicateCodes?.has(m.code) && !m.override_code)) return 'review'
  return 'ok'
}

/** Codes held by more than one generated mark in the season. */
export function duplicateCodes(list: CrestView[]): Set<string> {
  const seen = new Map<string, number>()
  for (const c of list) if (c.mark?.status === 'ok' && c.mark.code) seen.set(c.mark.code, (seen.get(c.mark.code) ?? 0) + 1)
  return new Set([...seen].filter(([, n]) => n > 1).map(([code]) => code))
}

/** Needs a (re)generation run. */
export const needsMark = (c: CrestView) => ['none', 'stale'].includes(markState(c))

export function matchesCrestFilter(c: CrestView, filter: CrestFilter, query: string, dupes?: Set<string>): boolean {
  const s = crestStatus(c)
  if (filter === 'unmarked' && !['none', 'stale', 'nokit'].includes(markState(c, dupes))) return false
  if (filter === 'mark-review' && !['review', 'error'].includes(markState(c, dupes))) return false
  if (filter === 'missing' && s !== 'missing') return false
  if (filter === 'current' && s !== 'current') return false
  if (filter === 'flagged' && !(c.needs_review && s !== 'uploaded')) return false
  if (filter === 'uploaded' && s !== 'uploaded') return false
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [c.name, c.wiki, c.country, c.top_flight, c.competitions, c.canonical_id].some(v => v.toLowerCase().includes(q))
}

export function crestCounts(list: CrestView[]) {
  const by = (s: CrestStatus) => list.filter(c => crestStatus(c) === s).length
  const dupes = duplicateCodes(list)
  const marks = list.map(c => markState(c, dupes))
  return {
    total: list.length, uploaded: by('uploaded'), season: by('season'), current: by('current'), missing: by('missing'),
    flagged: list.filter(c => c.needs_review && crestStatus(c) !== 'uploaded').length,
    unmarked: marks.filter(m => m === 'none' || m === 'stale' || m === 'nokit').length,
    'mark-review': marks.filter(m => m === 'review' || m === 'error').length,
    marked: marks.filter(m => m === 'ok' || m === 'review').length,
    toGenerate: marks.filter(m => m === 'none' || m === 'stale').length,
  }
}

/** Top flights in league order, then every cup opponent; clubs by name within a group. */
export function groupCrests<T extends HistoryCrest>(list: T[]): { group: string; crests: T[] }[] {
  const order = [...CREST_LEAGUES, OPPONENTS] as string[]
  const groups = new Map<string, T[]>(order.map(g => [g, []]))
  for (const c of list) groups.get((CREST_LEAGUES as readonly string[]).includes(c.top_flight) ? c.top_flight : OPPONENTS)!.push(c)
  return order.map(group => ({ group, crests: groups.get(group)!.sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter(g => g.crests.length)
}

/** Season label "2003-04" ↔ start year. */
export function isCrestSeason(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}$/.test(s)
}

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x)

/**
 * What the bytes really are (never trust the browser's type): PNG, JPEG, GIF,
 * WebP by magic number, SVG by its root element. Null for anything else.
 */
export function sniffCrestType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif'
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'
  // SVG: the first element is <svg>, after any XML declaration, comments, or a DOCTYPE with an entity subset (Illustrator).
  const head = new TextDecoder().decode(bytes.subarray(0, 16384)).replace(/^\uFEFF/, '').trimStart()
  const rest = head.replace(/^<\?xml[^>]*\?>/, '').replace(/<!--[\s\S]*?-->/g, '').trimStart()
    .replace(/^<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/i, '').replace(/<!--[\s\S]*?-->/g, '').trimStart()
  if (/^<svg[\s>]/i.test(rest)) return 'image/svg+xml'
  return null
}

/** SVGs can carry script; a crest has no business doing so. True when it must be refused. */
export function unsafeSvg(text: string): boolean {
  return /<script|<foreignObject|\bon[a-z]+\s*=|javascript:|<iframe|<embed|<object|xlink:href\s*=\s*["']\s*(?!#|data:image)/i.test(text)
}

export function crestExtension(type: string): string | null {
  return CREST_UPLOAD_TYPES[type] ?? null
}

/** FNV-1a, so two clubs that slugify alike ("Real Unión" / "Real Union") never share a file. */
function hash8(s: string): string {
  let h = 0x811c9dc5
  for (const ch of new TextEncoder().encode(s)) { h ^= ch; h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}

const fileBase = (season: string, wiki: string, slug: string) => {
  const base = (slug || wiki).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'club'
  return `${season}/${base}-${hash8(wiki)}`
}

/** Storage path for an upload: <season>/<slug>-<hash>.<ext>, re-uploads of other formats replace it. */
export function crestUploadPath(season: string, wiki: string, slug: string, ext: string): string {
  return `${fileBase(season, wiki, slug)}.${ext}`
}
