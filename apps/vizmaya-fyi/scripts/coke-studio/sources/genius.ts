/**
 * Genius source: API search + page-HTML lyrics scrape.
 *
 * Auth via GENIUS_CLIENT_ACCESS_TOKEN. Coverage is patchy for older Coke
 * Studio Pakistan seasons and Punjabi/Sindhi/Pashto songs (~40% hit rate),
 * so this is one source among several in the multi-source orchestrator.
 */

import { JSDOM } from 'jsdom'
import { detectScript, fetchText, matchScore, USER_AGENT } from './utils.js'
import type { LyricsCandidate, LyricsSource, SongRow } from './types.js'

const GENIUS_API = 'https://api.genius.com'
const MIN_MATCH_SCORE = 2

interface GeniusHit {
  id: number
  title: string
  primary_artist_name: string
  url: string
}

async function search(query: string, token: string): Promise<GeniusHit[]> {
  const url = `${GENIUS_API}/search?q=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, 'user-agent': USER_AGENT },
  })
  if (!res.ok) throw new Error(`Genius search ${res.status} ${res.statusText}: ${query}`)
  const body = (await res.json()) as {
    response: { hits: { result: { id: number; title: string; url: string; primary_artist: { name: string } } }[] }
  }
  return body.response.hits.map((h) => ({
    id: h.result.id,
    title: h.result.title,
    primary_artist_name: h.result.primary_artist.name,
    url: h.result.url,
  }))
}

function pickBestHit(song: SongRow, hits: GeniusHit[]): GeniusHit | null {
  if (hits.length === 0) return null
  const scored = hits.map((h) => ({
    hit: h,
    score: matchScore({
      songTitle: song.title,
      songArtists: song.artists,
      hitTitle: h.title,
      hitArtist: h.primary_artist_name,
      cokeStudioBonusHaystack: `${h.title} ${h.url}`,
    }),
  }))
  scored.sort((a, b) => b.score - a.score)
  return scored[0].score >= MIN_MATCH_SCORE ? scored[0].hit : null
}

async function scrapeLyrics(url: string): Promise<string | null> {
  const html = await fetchText(url)
  const dom = new JSDOM(html)
  const containers = dom.window.document.querySelectorAll('[data-lyrics-container="true"]')
  if (containers.length === 0) return null

  // Replace <br> with newlines so the text reads as verses, not one blob.
  // Genius uses <br> for line breaks within sections and a new container
  // per section (Verse 1, Chorus, etc).
  const sections: string[] = []
  for (const c of containers) {
    for (const br of c.querySelectorAll('br')) {
      br.replaceWith(dom.window.document.createTextNode('\n'))
    }
    const text = (c.textContent ?? '').trim()
    if (text) sections.push(text)
  }
  return sections.join('\n\n').trim() || null
}

export function createGeniusSource(): LyricsSource | null {
  const token = process.env.GENIUS_CLIENT_ACCESS_TOKEN
  if (!token) return null
  return {
    name: 'genius',
    async fetch(song): Promise<LyricsCandidate | null> {
      const firstArtist = (song.artists ?? '').split(/[|,&]/)[0]?.trim() ?? ''
      const query = `${song.title} ${firstArtist} coke studio`.trim()
      const hits = await search(query, token)
      const hit = pickBestHit(song, hits)
      if (!hit) return null
      const text = await scrapeLyrics(hit.url)
      if (!text) return null
      const detect = detectScript(text)
      return {
        source: 'genius',
        source_url: hit.url,
        source_id: String(hit.id),
        raw_text: text,
        has_native_script: detect.has_native_script,
        has_translation: detect.has_translation,
      }
    },
  }
}
