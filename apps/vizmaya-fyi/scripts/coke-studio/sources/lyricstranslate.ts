/**
 * LyricsTranslate source: crowdsourced lyrics with parallel English
 * translations, decent coverage of South Asian songs.
 *
 * No API; scrape the public search page and the song page. The site
 * shape has shifted between layouts over the years — we try several
 * selectors in order and pick the first that yields content so a layout
 * change degrades gracefully (returns null) rather than crashing.
 */

import { JSDOM } from 'jsdom'
import { fetchText, matchScore, detectScript } from './utils.js'
import type { LyricsCandidate, LyricsSource, SongRow } from './types.js'

const BASE = 'https://lyricstranslate.com'

interface LtHit {
  url: string
  title: string
  artist: string
}

async function search(query: string): Promise<LtHit[]> {
  const url = `${BASE}/en/search/site/${encodeURIComponent(query)}?type=song`
  const html = await fetchText(url)
  const dom = new JSDOM(html)
  const doc = dom.window.document

  // Each result is roughly: a row with two anchors — the song link and
  // the artist link. The exact class names rotate; pull anything that
  // looks like a song-page URL ('/en/<slug>/<slug>.html-lyrics' or
  // 'lyrics-…').
  const anchors = Array.from(doc.querySelectorAll('a[href^="/en/"]')) as HTMLAnchorElement[]
  const seen = new Set<string>()
  const hits: LtHit[] = []
  for (const a of anchors) {
    const href = a.getAttribute('href') ?? ''
    if (!/^\/en\/[^/]+\/[^/]+(\.html-lyrics?$|-lyrics(\.html)?$|\.html$)/.test(href)) continue
    if (seen.has(href)) continue
    seen.add(href)
    const title = (a.textContent ?? '').trim()
    if (!title) continue
    // Best-effort artist extraction from the URL slug (LT's URL shape is
    // /en/<artist-slug>/<song-slug>.html).
    const slugMatch = href.match(/^\/en\/([^/]+)\//)
    const artist = slugMatch ? slugMatch[1].replace(/-/g, ' ') : ''
    hits.push({ url: BASE + href, title, artist })
    if (hits.length >= 20) break
  }
  return hits
}

function pickBestHit(song: SongRow, hits: LtHit[]): LtHit | null {
  if (hits.length === 0) return null
  const scored = hits.map((h) => ({
    hit: h,
    score: matchScore({
      songTitle: song.title,
      songArtists: song.artists,
      hitTitle: h.title,
      hitArtist: h.artist,
      cokeStudioBonusHaystack: `${h.title} ${h.url}`,
    }),
  }))
  scored.sort((a, b) => b.score - a.score)
  return scored[0].score >= 2 ? scored[0].hit : null
}

// Try several known LT lyric containers, return the first non-empty one.
function extractLyricsFromPage(doc: Document): string | null {
  const selectors = [
    '[itemprop="lyrics"]',
    '.song-node-text',
    '.song-text',
    '.lyrics-text',
    '.lyrics',
  ]
  for (const sel of selectors) {
    const el = doc.querySelector(sel)
    if (!el) continue
    // Replace <br> with newlines so verse line breaks survive .textContent.
    for (const br of el.querySelectorAll('br')) {
      br.replaceWith(doc.createTextNode('\n'))
    }
    const text = (el.textContent ?? '').replace(/ /g, ' ').trim()
    if (text.length > 50) return text
  }
  return null
}

// LT shows translations in a sidebar (".translation-list") linking to
// /en/<song-slug>-translation-<id>.html-lyrics or similar. We pull the
// first English translation if there is one, to enrich has_translation.
function findEnglishTranslationUrl(doc: Document): string | null {
  const anchors = Array.from(doc.querySelectorAll('a[href]')) as HTMLAnchorElement[]
  for (const a of anchors) {
    const href = a.getAttribute('href') ?? ''
    const title = (a.textContent ?? '').toLowerCase()
    if (!href.includes('translation')) continue
    if (!title.includes('english')) continue
    return href.startsWith('http') ? href : BASE + href
  }
  return null
}

async function fetchLyricsAndMaybeTranslation(songUrl: string): Promise<string | null> {
  const html = await fetchText(songUrl)
  const dom = new JSDOM(html)
  const original = extractLyricsFromPage(dom.window.document)
  if (!original) return null

  const translationUrl = findEnglishTranslationUrl(dom.window.document)
  if (!translationUrl) return original

  try {
    const tHtml = await fetchText(translationUrl)
    const tDom = new JSDOM(tHtml)
    const translation = extractLyricsFromPage(tDom.window.document)
    if (translation) {
      return `${original}\n\n--- English translation ---\n\n${translation}`
    }
  } catch {
    // Translation fetch is best-effort. If it fails, keep the original.
  }
  return original
}

export function createLyricsTranslateSource(): LyricsSource {
  return {
    name: 'lyricstranslate',
    async fetch(song): Promise<LyricsCandidate | null> {
      const firstArtist = (song.artists ?? '').split(/[|,&]/)[0]?.trim() ?? ''
      const query = `${song.title} ${firstArtist}`.trim()
      const hits = await search(query)
      const hit = pickBestHit(song, hits)
      if (!hit) return null
      const text = await fetchLyricsAndMaybeTranslation(hit.url)
      if (!text) return null
      const detect = detectScript(text)
      // If we appended a translation, force has_translation=true regardless
      // of what detectScript heuristically inferred (it's a strong signal).
      const has_translation = detect.has_translation || text.includes('--- English translation ---')
      return {
        source: 'lyricstranslate',
        source_url: hit.url,
        source_id: null,
        raw_text: text,
        has_native_script: detect.has_native_script,
        has_translation,
      }
    },
  }
}
