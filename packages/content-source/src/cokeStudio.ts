/**
 * Server-side read helpers for the Coke Studio Pakistan corpus epic.
 *
 * Schema: supabase/vizmaya-fyi/migrations/046_coke_studio_epic.sql
 *
 * Tables:
 *   coke_studio_songs           one row per recorded song (Phase 1)
 *   coke_studio_song_languages  per-(song, language) row (Phase 2)
 *   coke_studio_place_mentions  per-place-mention-inside-lyric row (Phase 3)
 *   coke_studio_gazetteer       canonical place lookup
 *
 * Read helpers here mirror the IEA pattern in epics.ts — small, typed,
 * suitable for direct use from RSC landing pages and admin tools alike.
 */

import { createServiceClient } from './supabase'

// Producer-era buckets matching the research plan's table.
export type CokeStudioEra = 'rohail-hyatt-founding' | 'strings' | 'hyatt-return' | 'xulfi'

export function eraForSeason(season: number): CokeStudioEra {
  if (season >= 1 && season <= 6) return 'rohail-hyatt-founding'
  if (season >= 7 && season <= 11) return 'strings'
  if (season === 12 || season === 2020) return 'hyatt-return'
  if (season >= 13 && season <= 15) return 'xulfi'
  // Anything outside the documented seasons (e.g. future seasons) falls
  // through to the latest era; refine when the plan extends.
  return 'xulfi'
}

export interface CokeStudioSong {
  songId: string
  title: string
  titleNative: string | null
  season: number
  episode: number | null
  trackInEpisode: number | null
  releaseDate: string | null
  durationSeconds: number | null
  artists: string[]
  lyricists: string[]
  composers: string[]
  producer: string | null
  youtubeUrl: string | null
  isInstrumental: boolean
  isCover: boolean
  originalArtist: string | null
  notes: string | null
}

function mapSongRow(r: any): CokeStudioSong {
  return {
    songId: r.song_id as string,
    title: r.title as string,
    titleNative: (r.title_native as string | null) ?? null,
    season: r.season as number,
    episode: (r.episode as number | null) ?? null,
    trackInEpisode: (r.track_in_episode as number | null) ?? null,
    releaseDate: (r.release_date as string | null) ?? null,
    durationSeconds: (r.duration_seconds as number | null) ?? null,
    artists: (r.artists as string[] | null) ?? [],
    lyricists: (r.lyricists as string[] | null) ?? [],
    composers: (r.composers as string[] | null) ?? [],
    producer: (r.producer as string | null) ?? null,
    youtubeUrl: (r.youtube_url as string | null) ?? null,
    isInstrumental: Boolean(r.is_instrumental),
    isCover: Boolean(r.is_cover),
    originalArtist: (r.original_artist as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  }
}

/**
 * Returns every song in the corpus, ordered by (season, episode, track).
 * Paginates through Supabase's 1000-row response cap so the full ~330 rows
 * always come back. Safe to call on a landing page — the corpus is bounded.
 */
export async function listCokeStudioSongs(): Promise<CokeStudioSong[]> {
  const sb = createServiceClient()
  const pageSize = 1000
  const out: CokeStudioSong[] = []
  for (let page = 0; page < 10; page++) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data, error } = await sb
      .from('coke_studio_songs')
      .select('*')
      .order('season', { ascending: true })
      .order('episode', { ascending: true, nullsFirst: true })
      .order('track_in_episode', { ascending: true, nullsFirst: true })
      .range(from, to)
    if (error) throw new Error(`listCokeStudioSongs: ${error.message}`)
    const batch = data ?? []
    out.push(...batch.map(mapSongRow))
    if (batch.length < pageSize) break
  }
  return out
}

export async function listCokeStudioSongsBySeason(season: number): Promise<CokeStudioSong[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('coke_studio_songs')
    .select('*')
    .eq('season', season)
    .order('episode', { ascending: true, nullsFirst: true })
    .order('track_in_episode', { ascending: true, nullsFirst: true })
  if (error) throw new Error(`listCokeStudioSongsBySeason(${season}): ${error.message}`)
  return (data ?? []).map(mapSongRow)
}

export async function getCokeStudioSong(songId: string): Promise<CokeStudioSong | null> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('coke_studio_songs')
    .select('*')
    .eq('song_id', songId)
    .maybeSingle()
  if (error) throw new Error(`getCokeStudioSong(${songId}): ${error.message}`)
  return data ? mapSongRow(data) : null
}

// ---------------------------------------------------------------------------
// Languages.

export interface CokeStudioSongLanguage {
  songId: string
  language: string
  languageFamily: string | null
  script: string | null
  shareEstimate: number | null
  role: string | null
  verseLocations: string[]
  confidence: 'high' | 'medium' | 'low'
  source: string | null
}

function mapLangRow(r: any): CokeStudioSongLanguage {
  return {
    songId: r.song_id as string,
    language: r.language as string,
    languageFamily: (r.language_family as string | null) ?? null,
    script: (r.script as string | null) ?? null,
    shareEstimate: r.share_estimate == null ? null : Number(r.share_estimate),
    role: (r.role as string | null) ?? null,
    verseLocations: (r.verse_locations as string[] | null) ?? [],
    confidence: (r.confidence as 'high' | 'medium' | 'low' | null) ?? 'medium',
    source: (r.source as string | null) ?? null,
  }
}

export async function getCokeStudioLanguagesForSong(songId: string): Promise<CokeStudioSongLanguage[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('coke_studio_song_languages')
    .select('*')
    .eq('song_id', songId)
  if (error) throw new Error(`getCokeStudioLanguagesForSong(${songId}): ${error.message}`)
  return (data ?? []).map(mapLangRow)
}

export interface CokeStudioLanguageRollup {
  language: string
  songCount: number
  totalShare: number
}

/**
 * Aggregates `song_languages` into a (language → song count, sum of share)
 * roll-up. Used by the headline language-distribution chart. Optionally
 * scoped to a season or producer era.
 */
export async function getCokeStudioLanguageRollup(
  opts: { season?: number; era?: CokeStudioEra } = {},
): Promise<CokeStudioLanguageRollup[]> {
  const sb = createServiceClient()
  let query = sb
    .from('coke_studio_song_languages')
    .select('language, share_estimate, song_id, coke_studio_songs!inner(season)')
  if (opts.season != null) {
    query = query.eq('coke_studio_songs.season', opts.season)
  }
  const { data, error } = await query
  if (error) throw new Error(`getCokeStudioLanguageRollup: ${error.message}`)

  const rolled = new Map<string, { songs: Set<string>; share: number }>()
  for (const r of (data ?? []) as any[]) {
    const season = Array.isArray(r.coke_studio_songs)
      ? r.coke_studio_songs[0]?.season
      : r.coke_studio_songs?.season
    if (opts.era && eraForSeason(season as number) !== opts.era) continue
    const lang = r.language as string
    let entry = rolled.get(lang)
    if (!entry) { entry = { songs: new Set(), share: 0 }; rolled.set(lang, entry) }
    entry.songs.add(r.song_id as string)
    if (r.share_estimate != null) entry.share += Number(r.share_estimate)
  }

  return [...rolled.entries()]
    .map(([language, e]) => ({
      language,
      songCount: e.songs.size,
      totalShare: Number(e.share.toFixed(3)),
    }))
    .sort((a, b) => b.songCount - a.songCount)
}

// ---------------------------------------------------------------------------
// Places.

export interface CokeStudioPlaceMention {
  mentionId: string
  songId: string
  placeRaw: string
  placeCanonical: string | null
  languageOfMention: string | null
  lyricContext: string | null
  lyricTranslation: string | null
  contextType: string | null
  verseNumber: number | null
  confidence: 'high' | 'medium' | 'low'
  notes: string | null
}

function mapPlaceRow(r: any): CokeStudioPlaceMention {
  return {
    mentionId: r.mention_id as string,
    songId: r.song_id as string,
    placeRaw: r.place_raw as string,
    placeCanonical: (r.place_canonical as string | null) ?? null,
    languageOfMention: (r.language_of_mention as string | null) ?? null,
    lyricContext: (r.lyric_context as string | null) ?? null,
    lyricTranslation: (r.lyric_translation as string | null) ?? null,
    contextType: (r.context_type as string | null) ?? null,
    verseNumber: (r.verse_number as number | null) ?? null,
    confidence: (r.confidence as 'high' | 'medium' | 'low' | null) ?? 'medium',
    notes: (r.notes as string | null) ?? null,
  }
}

export async function getCokeStudioMentionsForSong(songId: string): Promise<CokeStudioPlaceMention[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('coke_studio_place_mentions')
    .select('*')
    .eq('song_id', songId)
    .order('verse_number', { ascending: true, nullsFirst: true })
  if (error) throw new Error(`getCokeStudioMentionsForSong(${songId}): ${error.message}`)
  return (data ?? []).map(mapPlaceRow)
}

export interface CokeStudioGazetteerEntry {
  placeCanonical: string
  placeType: 'city' | 'region' | 'country' | 'empire' | 'river' | 'shrine' | 'mountain' | 'mythic'
  modernCountry: string | null
  historicalPolity: string | null
  lat: number | null
  lon: number | null
  aliases: string[]
  notes: string | null
}

function mapGazRow(r: any): CokeStudioGazetteerEntry {
  return {
    placeCanonical: r.place_canonical as string,
    placeType: r.place_type as CokeStudioGazetteerEntry['placeType'],
    modernCountry: (r.modern_country as string | null) ?? null,
    historicalPolity: (r.historical_polity as string | null) ?? null,
    lat: r.lat as number | null,
    lon: r.lon as number | null,
    aliases: (r.aliases as string[] | null) ?? [],
    notes: (r.notes as string | null) ?? null,
  }
}

export async function getCokeStudioGazetteer(): Promise<CokeStudioGazetteerEntry[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('coke_studio_gazetteer')
    .select('*')
    .order('place_canonical', { ascending: true })
  if (error) throw new Error(`getCokeStudioGazetteer: ${error.message}`)
  return (data ?? []).map(mapGazRow)
}

export interface CokeStudioPlaceRollup extends CokeStudioGazetteerEntry {
  mentionCount: number
  songCount: number
  contextTypes: string[]
}

/**
 * Joins `place_mentions` with the gazetteer and rolls up per canonical
 * place: how many mentions, how many distinct songs, and which context
 * types were tagged. Drives the headline map's pin sizing/colouring.
 */
export async function getCokeStudioPlaceRollup(): Promise<CokeStudioPlaceRollup[]> {
  const sb = createServiceClient()
  const [mentionsR, gazR] = await Promise.all([
    sb.from('coke_studio_place_mentions').select('song_id, place_canonical, context_type'),
    sb.from('coke_studio_gazetteer').select('*'),
  ])
  if (mentionsR.error) throw new Error(`getCokeStudioPlaceRollup mentions: ${mentionsR.error.message}`)
  if (gazR.error) throw new Error(`getCokeStudioPlaceRollup gazetteer: ${gazR.error.message}`)

  const byPlace = new Map<
    string,
    { mentions: number; songs: Set<string>; contexts: Set<string> }
  >()
  for (const m of (mentionsR.data ?? []) as any[]) {
    const key = m.place_canonical as string | null
    if (!key) continue
    let entry = byPlace.get(key)
    if (!entry) { entry = { mentions: 0, songs: new Set(), contexts: new Set() }; byPlace.set(key, entry) }
    entry.mentions += 1
    entry.songs.add(m.song_id as string)
    if (m.context_type) entry.contexts.add(m.context_type as string)
  }

  return (gazR.data ?? [])
    .map(mapGazRow)
    .map((g) => {
      const stats = byPlace.get(g.placeCanonical)
      return {
        ...g,
        mentionCount: stats?.mentions ?? 0,
        songCount: stats?.songs.size ?? 0,
        contextTypes: stats ? [...stats.contexts].sort() : [],
      }
    })
    .filter((g) => g.mentionCount > 0)
    .sort((a, b) => b.mentionCount - a.mentionCount)
}
