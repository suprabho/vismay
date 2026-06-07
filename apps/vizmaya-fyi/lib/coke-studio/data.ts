// Server-side reads for the /coke-studio epic landing + detail sheet.
//
// Schema lives in supabase/vizmaya-fyi/migrations/046_coke_studio_epic.sql. The data was
// produced by scripts/coke-studio/{import,fetch-lyrics,extract-places}.ts.
// docs/coke-studio-pipeline.md explains the end-to-end flow.
//
// One nit worth flagging: the gazetteer stores coordinates as (lat, lon) but
// the rest of the vizmaya epic landings expect (lat, lng). We rename at the
// boundary here so callers don't have to keep track of which dialect they're
// holding.

import { createServiceClient } from '@vismay/content-source/supabase'

// PostgREST defaults to 1000 rows per response on Supabase. Both place-mention
// and gazetteer counts sit well below that today, but we page through anyway —
// extract-places.ts can land more rows on every re-run, and we'd rather find
// out about the cap from the page loop than from a silently truncated map.
const PAGE_SIZE = 1000

export interface CokeStudioPlaceSummary {
  canonical: string
  type: string
  modernCountry: string | null
  historicalPolity: string | null
  lat: number
  lng: number
  mentionCount: number
  songCount: number
}

export interface CokeStudioSongMention {
  mentionId: string
  songId: string
  songTitle: string
  songTitleNative: string | null
  season: number
  episode: number | null
  trackInEpisode: number
  artists: string | null
  youtubeUrl: string | null
  releaseDate: string | null
  durationSeconds: number | null
  lyricContext: string | null
  lyricTranslation: string | null
  contextType: string | null
  languageOfMention: string | null
  confidence: 'low' | 'medium' | 'high'
  verseNumber: number | null
}

export interface CokeStudioPlaceProfile {
  canonical: string
  type: string
  modernCountry: string | null
  historicalPolity: string | null
  aliases: string | null
  notes: string | null
  lat: number
  lng: number
  mentionCount: number
  songCount: number
  // Tally of context_type values across this place's mentions, sorted desc.
  // Used to populate the "What it means" tile (beloved, shrine, journey, …).
  contextBreakdown: { type: string; count: number }[]
  // All mentions, grouped server-side: same song appears once per mention but
  // mentions are pre-sorted by season → episode → track so the client can
  // walk through linearly and group by song with no extra sort.
  mentions: CokeStudioSongMention[]
}

export interface CokeStudioCorpusStats {
  songCount: number
  placeCount: number
  mentionCount: number
  seasonCount: number
}

// ─── List query (landing) ──────────────────────────────────────────────────

async function pageAllGazetteer() {
  const sb = createServiceClient()
  const rows: {
    place_canonical: string
    place_type: string
    modern_country: string | null
    historical_polity: string | null
    lat: number
    lon: number
  }[] = []
  for (let page = 0; page < 50; page++) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, error } = await sb
      .from('coke_studio_gazetteer')
      .select('place_canonical, place_type, modern_country, historical_polity, lat, lon')
      .order('place_canonical', { ascending: true })
      .range(from, to)
    if (error) throw new Error(`pageAllGazetteer: ${error.message}`)
    const batch = (data ?? []) as typeof rows
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }
  return rows
}

async function pageAllMentionKeys() {
  const sb = createServiceClient()
  const rows: { place_canonical: string; song_id: string }[] = []
  for (let page = 0; page < 200; page++) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, error } = await sb
      .from('coke_studio_place_mentions')
      .select('place_canonical, song_id')
      .order('place_canonical', { ascending: true })
      .order('song_id', { ascending: true })
      .range(from, to)
    if (error) throw new Error(`pageAllMentionKeys: ${error.message}`)
    const batch = (data ?? []) as typeof rows
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }
  return rows
}

/**
 * Every gazetteer place with its mention count and the count of distinct songs
 * that mention it. Sorted by mention count desc so the densest places come
 * first when the caller walks the list.
 */
export async function listCokeStudioPlaces(): Promise<CokeStudioPlaceSummary[]> {
  const [gazRows, mentionRows] = await Promise.all([
    pageAllGazetteer(),
    pageAllMentionKeys(),
  ])

  const counts = new Map<string, { mentions: number; songs: Set<string> }>()
  for (const m of mentionRows) {
    let entry = counts.get(m.place_canonical)
    if (!entry) {
      entry = { mentions: 0, songs: new Set() }
      counts.set(m.place_canonical, entry)
    }
    entry.mentions++
    entry.songs.add(m.song_id)
  }

  return gazRows
    .map((g) => {
      const c = counts.get(g.place_canonical)
      return {
        canonical: g.place_canonical,
        type: g.place_type,
        modernCountry: g.modern_country,
        historicalPolity: g.historical_polity,
        lat: g.lat,
        lng: g.lon,
        mentionCount: c?.mentions ?? 0,
        songCount: c?.songs.size ?? 0,
      }
    })
    .sort((a, b) => b.mentionCount - a.mentionCount || a.canonical.localeCompare(b.canonical))
}

// ─── Profile query (detail sheet) ──────────────────────────────────────────

interface RawMentionJoin {
  mention_id: string
  song_id: string
  lyric_context: string | null
  lyric_translation: string | null
  context_type: string | null
  language_of_mention: string | null
  verse_number: number | null
  confidence: 'low' | 'medium' | 'high'
  // The PostgREST embed shape — usually an object, sometimes an array when
  // the FK relationship is ambiguous. Normalise on the consumer side.
  coke_studio_songs:
    | {
        title: string
        title_native: string | null
        season: number
        episode: number | null
        track_in_episode: number
        artists: string | null
        youtube_url: string | null
        release_date: string | null
        duration_seconds: number | null
      }
    | null
    | Array<{
        title: string
        title_native: string | null
        season: number
        episode: number | null
        track_in_episode: number
        artists: string | null
        youtube_url: string | null
        release_date: string | null
        duration_seconds: number | null
      }>
}

/**
 * Full per-place profile: gazetteer row + every mention joined to its song.
 *
 * Returns null when the canonical isn't in the gazetteer at all. Returns a
 * profile with `mentions: []` when the place exists but nothing references it
 * yet (rare — usually means the extractor hasn't been re-run since the
 * gazetteer row was added by hand).
 */
export async function getCokeStudioPlace(
  canonical: string,
): Promise<CokeStudioPlaceProfile | null> {
  const sb = createServiceClient()

  const [gazR, mentionR] = await Promise.all([
    sb
      .from('coke_studio_gazetteer')
      .select(
        'place_canonical, place_type, modern_country, historical_polity, lat, lon, aliases, notes',
      )
      .eq('place_canonical', canonical)
      .maybeSingle(),
    sb
      .from('coke_studio_place_mentions')
      .select(
        `mention_id, song_id, lyric_context, lyric_translation, context_type,
         language_of_mention, verse_number, confidence,
         coke_studio_songs!inner(title, title_native, season, episode, track_in_episode,
           artists, youtube_url, release_date, duration_seconds)`,
      )
      .eq('place_canonical', canonical),
  ])

  if (gazR.error) throw new Error(`getCokeStudioPlace gaz ${canonical}: ${gazR.error.message}`)
  if (!gazR.data) return null
  if (mentionR.error)
    throw new Error(`getCokeStudioPlace mentions ${canonical}: ${mentionR.error.message}`)

  const rawMentions = (mentionR.data ?? []) as RawMentionJoin[]
  const mentions: CokeStudioSongMention[] = rawMentions
    .map((r) => {
      const song = Array.isArray(r.coke_studio_songs)
        ? r.coke_studio_songs[0]
        : r.coke_studio_songs
      if (!song) return null
      return {
        mentionId: r.mention_id,
        songId: r.song_id,
        songTitle: song.title,
        songTitleNative: song.title_native,
        season: song.season,
        episode: song.episode,
        trackInEpisode: song.track_in_episode,
        artists: song.artists,
        youtubeUrl: song.youtube_url,
        releaseDate: song.release_date,
        durationSeconds: song.duration_seconds,
        lyricContext: r.lyric_context,
        lyricTranslation: r.lyric_translation,
        contextType: r.context_type,
        languageOfMention: r.language_of_mention,
        confidence: r.confidence,
        verseNumber: r.verse_number,
      } satisfies CokeStudioSongMention
    })
    .filter((x): x is CokeStudioSongMention => x !== null)
    // Sort by song first (season → episode → track) then by verse within song.
    // The detail sheet groups by song after this lands, so all mentions of one
    // song are guaranteed contiguous in the array.
    .sort((a, b) => {
      if (a.songId !== b.songId) {
        if (a.season !== b.season) return a.season - b.season
        const aep = a.episode ?? 0
        const bep = b.episode ?? 0
        if (aep !== bep) return aep - bep
        return a.trackInEpisode - b.trackInEpisode
      }
      const av = a.verseNumber ?? 0
      const bv = b.verseNumber ?? 0
      return av - bv
    })

  const contextCounts = new Map<string, number>()
  const songSet = new Set<string>()
  for (const m of mentions) {
    songSet.add(m.songId)
    const ct = m.contextType ?? 'other'
    contextCounts.set(ct, (contextCounts.get(ct) ?? 0) + 1)
  }

  return {
    canonical: gazR.data.place_canonical as string,
    type: gazR.data.place_type as string,
    modernCountry: (gazR.data.modern_country as string | null) ?? null,
    historicalPolity: (gazR.data.historical_polity as string | null) ?? null,
    aliases: (gazR.data.aliases as string | null) ?? null,
    notes: (gazR.data.notes as string | null) ?? null,
    lat: gazR.data.lat as number,
    lng: gazR.data.lon as number,
    mentionCount: mentions.length,
    songCount: songSet.size,
    contextBreakdown: [...contextCounts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
    mentions,
  }
}

// ─── Corpus stats (landing header) ─────────────────────────────────────────

/**
 * Top-line counts for the landing header — total songs in the corpus, total
 * gazetteer places, total place mentions, distinct seasons covered.
 *
 * Implemented with `count: 'exact', head: true` so each call is one bare COUNT
 * round-trip; the seasons count is the one piece we can't get from COUNT and
 * uses a tiny SELECT DISTINCT.
 */
export async function getCokeStudioCorpusStats(): Promise<CokeStudioCorpusStats> {
  const sb = createServiceClient()

  const [songsR, placesR, mentionsR, seasonsR] = await Promise.all([
    sb.from('coke_studio_songs').select('*', { count: 'exact', head: true }),
    sb.from('coke_studio_gazetteer').select('*', { count: 'exact', head: true }),
    sb.from('coke_studio_place_mentions').select('*', { count: 'exact', head: true }),
    sb.from('coke_studio_songs').select('season').order('season', { ascending: true }),
  ])

  if (songsR.error) throw new Error(`corpusStats songs: ${songsR.error.message}`)
  if (placesR.error) throw new Error(`corpusStats places: ${placesR.error.message}`)
  if (mentionsR.error) throw new Error(`corpusStats mentions: ${mentionsR.error.message}`)
  if (seasonsR.error) throw new Error(`corpusStats seasons: ${seasonsR.error.message}`)

  const seasons = new Set<number>()
  for (const r of (seasonsR.data ?? []) as { season: number }[]) seasons.add(r.season)

  return {
    songCount: songsR.count ?? 0,
    placeCount: placesR.count ?? 0,
    mentionCount: mentionsR.count ?? 0,
    seasonCount: seasons.size,
  }
}
