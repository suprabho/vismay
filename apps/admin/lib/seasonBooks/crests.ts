import { CREST_UPLOAD_TYPES, type HistoryCrest } from '@footshorts/shared/historicalCrests'

/**
 * Pure helpers for the Books → Crests viewer (client and server). The crests
 * come from `admin_season_crests` (vizmaya-data/football-seasons Layer 6);
 * an upload always wins over the crest crests.py picked.
 */

/** A crest as the viewer gets it: `image_url` is the upload (signed) or the picked crest's thumbnail. */
export type CrestView = HistoryCrest & { image_url: string | null }

export type CrestStatus = 'uploaded' | 'season' | 'current' | 'missing'
export type CrestFilter = 'all' | 'missing' | 'current' | 'flagged' | 'uploaded'

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

export function matchesCrestFilter(c: HistoryCrest, filter: CrestFilter, query: string): boolean {
  const s = crestStatus(c)
  if (filter === 'missing' && s !== 'missing') return false
  if (filter === 'current' && s !== 'current') return false
  if (filter === 'flagged' && !(c.needs_review && s !== 'uploaded')) return false
  if (filter === 'uploaded' && s !== 'uploaded') return false
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [c.name, c.wiki, c.country, c.top_flight, c.competitions, c.canonical_id].some(v => v.toLowerCase().includes(q))
}

export function crestCounts(list: HistoryCrest[]) {
  const by = (s: CrestStatus) => list.filter(c => crestStatus(c) === s).length
  return {
    total: list.length, uploaded: by('uploaded'), season: by('season'), current: by('current'), missing: by('missing'),
    flagged: list.filter(c => c.needs_review && crestStatus(c) !== 'uploaded').length,
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
  const head = new TextDecoder().decode(bytes.subarray(0, 4096)).replace(/^﻿/, '').trimStart()
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return 'image/svg+xml'
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

/** Storage path for an upload: <season>/<slug>-<hash>.<ext>, re-uploads of other formats replace it. */
export function crestUploadPath(season: string, wiki: string, slug: string, ext: string): string {
  const base = (slug || wiki).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'club'
  return `${season}/${base}-${hash8(wiki)}.${ext}`
}
