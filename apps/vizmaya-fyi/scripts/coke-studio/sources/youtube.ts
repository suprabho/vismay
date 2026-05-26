/**
 * YouTube source: scrape the official Coke Studio uploads for lyrics + URL.
 *
 * Coke Studio Pakistan's own YouTube channel publishes every track with full
 * lyrics in the video description, usually in both the native script and a
 * Roman transliteration with an English translation. Highest-coverage and
 * most-authoritative single source we have.
 *
 * Side effect: when this source wins, the orchestrator backfills
 * coke_studio_songs.youtube_url and .duration_seconds from the same call —
 * killing two birds.
 *
 * Strategy: scrape https://www.youtube.com/results?search_query=... for the
 * first video that matches (title, artist, "coke studio"), then fetch the
 * watch page and pull `videoDetails.shortDescription` from the
 * ytInitialPlayerResponse JSON blob. No YouTube Data API key needed (which
 * matters: the API's 10k-unit/day quota only buys 100 searches; we have 352
 * songs).
 *
 * Bot-detection: YouTube tolerates a polite-UA + low-rate scrape from a
 * single IP for one-off jobs. If we start hitting CAPTCHA pages, the fix is
 * either residential-proxy rotation or falling back to the Data API.
 */

import { detectScript, fetchText, matchScore } from './utils.js'
import type { LyricsCandidate, LyricsSource, SongRow } from './types.js'

const SEARCH_URL = 'https://www.youtube.com/results'
const WATCH_URL = 'https://www.youtube.com/watch'

// `sp=EgIQAQ%253D%253D` filters search results to videos only (excludes
// channels, playlists, etc) — fewer false positives.
const VIDEOS_ONLY_FILTER = 'EgIQAQ%3D%3D'

interface YtSearchHit {
  videoId: string
  title: string
  channel: string
  lengthSeconds: number | null
  url: string
}

interface YtVideoDetail {
  description: string
  lengthSeconds: number | null
}

/**
 * Walk balanced braces forward from a starting key (e.g. `var ytInitialData =`)
 * and return the JSON object as a string. Handles strings + escapes so braces
 * inside string literals don't confuse the depth counter.
 */
function extractJsonObject(text: string, startKey: string): unknown | null {
  const keyIdx = text.indexOf(startKey)
  if (keyIdx === -1) return null
  let i = keyIdx + startKey.length
  while (i < text.length && text[i] !== '{') i++
  if (text[i] !== '{') return null
  const start = i
  let depth = 0
  let inString = false
  let escape = false
  for (; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
    } else {
      if (ch === '"') inString = true
      else if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          const json = text.slice(start, i + 1)
          try {
            return JSON.parse(json)
          } catch {
            return null
          }
        }
      }
    }
  }
  return null
}

function parseLengthText(s: string | undefined): number | null {
  if (!s) return null
  const parts = s.split(':').map((p) => Number(p))
  if (parts.some((n) => !Number.isFinite(n))) return null
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

interface YtRenderer { videoRenderer?: { videoId?: string; title?: { runs?: { text?: string }[] }; ownerText?: { runs?: { text?: string }[] }; lengthText?: { simpleText?: string } } }

async function search(query: string): Promise<YtSearchHit[]> {
  const url = `${SEARCH_URL}?search_query=${encodeURIComponent(query)}&sp=${VIDEOS_ONLY_FILTER}`
  const html = await fetchText(url)
  const data = extractJsonObject(html, 'var ytInitialData')
  if (!data || typeof data !== 'object') return []

  // Navigate the deeply-nested response carefully — every step can be
  // undefined when YouTube changes layout for an experiment.
  const root = data as {
    contents?: {
      twoColumnSearchResultsRenderer?: {
        primaryContents?: {
          sectionListRenderer?: {
            contents?: { itemSectionRenderer?: { contents?: YtRenderer[] } }[]
          }
        }
      }
    }
  }
  const sections = root.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ?? []
  const items: YtRenderer[] = sections.flatMap((s) => s.itemSectionRenderer?.contents ?? [])

  const hits: YtSearchHit[] = []
  for (const item of items) {
    const v = item.videoRenderer
    if (!v?.videoId) continue
    const title = v.title?.runs?.[0]?.text ?? ''
    const channel = v.ownerText?.runs?.[0]?.text ?? ''
    if (!title) continue
    hits.push({
      videoId: v.videoId,
      title,
      channel,
      lengthSeconds: parseLengthText(v.lengthText?.simpleText),
      url: `${WATCH_URL}?v=${v.videoId}`,
    })
  }
  return hits
}

function pickBestHit(song: SongRow, hits: YtSearchHit[]): YtSearchHit | null {
  if (hits.length === 0) return null
  const scored = hits.map((h) => ({
    hit: h,
    score:
      matchScore({
        songTitle: song.title,
        songArtists: song.artists,
        hitTitle: h.title,
        hitArtist: h.channel,
        cokeStudioBonusHaystack: `${h.title} ${h.channel}`,
      }) +
      // Heavily prefer the official channel(s). Both "Coke Studio" and "Coke
      // Studio Pakistan" appear, plus the older "Coke Studio Pakistan -
      // Topic" auto-generated channel.
      (/^coke\s*studio/i.test(h.channel) ? 8 : 0),
  }))
  scored.sort((a, b) => b.score - a.score)
  return scored[0].score >= 3 ? scored[0].hit : null
}

async function fetchVideoDetail(videoId: string): Promise<YtVideoDetail | null> {
  const html = await fetchText(`${WATCH_URL}?v=${videoId}`)
  const data = extractJsonObject(html, 'var ytInitialPlayerResponse')
    ?? extractJsonObject(html, 'ytInitialPlayerResponse')
  if (!data || typeof data !== 'object') return null
  const root = data as {
    videoDetails?: { shortDescription?: string; lengthSeconds?: string }
  }
  const desc = root.videoDetails?.shortDescription
  if (!desc) return null
  const lengthRaw = root.videoDetails?.lengthSeconds
  const lengthSeconds = lengthRaw ? Number(lengthRaw) : null
  return {
    description: desc,
    lengthSeconds: Number.isFinite(lengthSeconds) ? lengthSeconds : null,
  }
}

// Heuristic: trim a YouTube video description down to the lyrics-and-translation
// portion. Coke Studio descriptions follow a rough shape:
//
//   <song / episode title boilerplate>
//   <lyrics block — often "LYRICS / بول" or "Lyrics & Translation"  header>
//   <credits — "Composer:", "Producer:", "Music Director:", "Lyrics by:", ...>
//   <social / sponsor boilerplate>
//
// We try to drop the credits + boilerplate tail. If the regex fails we keep
// the whole description — the LLM extractor can still find places.
const CREDIT_TAIL_MARKERS = [
  /^Composer\s*[:\-]/im,
  /^Composers?\s*[:\-]/im,
  /^Producer\s*[:\-]/im,
  /^Music\s*Director\s*[:\-]/im,
  /^Music\s*Produced/im,
  /^Lyrics\s*by\s*[:\-]/im,
  /^Director\s*[:\-]/im,
  /^Mixed\s*&?\s*Mastered/im,
  /^Recorded\s*by/im,
  /^©\s*Coke\s*Studio/im,
  /^Coke\s*Studio\s*Season\s*\d+\s*\|/im,
  /^Follow\s*Coke\s*Studio/im,
  /^Subscribe\s*to/im,
]

function trimDescriptionToLyrics(description: string): string {
  // Find the lyrics header (or the start, if not present).
  const headerMatch = description.match(/(^|\n)\s*(lyrics(\s*(&|and)\s*translation)?|بول)\s*[:\-]?\s*\n/i)
  let start = 0
  if (headerMatch && headerMatch.index !== undefined) {
    start = headerMatch.index + headerMatch[0].length
  }
  let endIdx = description.length
  for (const marker of CREDIT_TAIL_MARKERS) {
    const m = description.slice(start).match(marker)
    if (m && m.index !== undefined) {
      endIdx = Math.min(endIdx, start + m.index)
    }
  }
  const sliced = description.slice(start, endIdx).trim()
  // If trimming left almost nothing, fall back to the full description —
  // better to give the extractor too much than too little.
  return sliced.length > 200 ? sliced : description.trim()
}

export function createYouTubeSource(): LyricsSource {
  return {
    name: 'youtube',
    async fetch(song): Promise<LyricsCandidate | null> {
      const firstArtist = (song.artists ?? '').split(/[|,&]/)[0]?.trim() ?? ''
      const query = `${song.title} ${firstArtist} coke studio`.trim()
      const hits = await search(query)
      const hit = pickBestHit(song, hits)
      if (!hit) return null
      const detail = await fetchVideoDetail(hit.videoId)
      if (!detail) return null
      const trimmed = trimDescriptionToLyrics(detail.description)
      if (trimmed.length < 80) return null
      const detect = detectScript(trimmed)
      return {
        source: 'youtube',
        source_url: hit.url,
        source_id: hit.videoId,
        raw_text: trimmed,
        has_native_script: detect.has_native_script,
        has_translation: detect.has_translation,
        youtube_url: hit.url,
        duration_seconds: detail.lengthSeconds ?? hit.lengthSeconds,
      }
    },
  }
}
