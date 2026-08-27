/**
 * Hindi recipe-video lookup for the Nashta planner via the YouTube Data API v3
 * (search.list + videos.list for durations). Degrades to a plain YouTube
 * search link when YOUTUBE_API_KEY is missing or the API fails/hits quota —
 * the plan still ships, just without embedded video cards.
 */
import type { MealPlanVideo } from '@vismay/content-source/epics'

const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search'
const VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos'

function searchLinkFallback(query: string): MealPlanVideo[] {
  return [
    {
      videoId: null,
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      title: `Search YouTube: ${query}`,
      channel: null,
      thumbnail: null,
      duration: null,
    },
  ]
}

/** search.list snippets come back HTML-escaped ("Quick &amp;amp; Easy …"). */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
}

/** "PT1H12M34S" → "1:12:34"; "PT8M5S" → "8:05". Null when unparsable. */
function formatIsoDuration(iso: string | undefined): string | null {
  if (!iso) return null
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!m) return null
  const [, h, min, s] = m
  const mm = Number(min ?? 0)
  const ss = String(Number(s ?? 0)).padStart(2, '0')
  return h ? `${Number(h)}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`
}

/** Top Hindi recipe videos for one dish query. Never throws. */
export async function findDishVideos(query: string, max = 3): Promise<MealPlanVideo[]> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return searchLinkFallback(query)
  try {
    const searchParams = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      relevanceLanguage: 'hi',
      maxResults: String(Math.min(Math.max(max, 1), 5)),
      q: query,
      key,
    })
    const searchRes = await fetch(`${SEARCH_URL}?${searchParams}`, { signal: AbortSignal.timeout(10_000) })
    if (!searchRes.ok) {
      console.warn(`nashta youtube search ${searchRes.status}: ${(await searchRes.text()).slice(0, 200)}`)
      return searchLinkFallback(query)
    }
    const search = (await searchRes.json()) as {
      items?: Array<{
        id?: { videoId?: string }
        snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string }; default?: { url?: string } } }
      }>
    }
    const hits = (search.items ?? []).filter((i) => i.id?.videoId)
    if (hits.length === 0) return searchLinkFallback(query)

    const ids = hits.map((i) => i.id!.videoId!).join(',')
    const durations = new Map<string, string | null>()
    try {
      const detailRes = await fetch(`${VIDEOS_URL}?${new URLSearchParams({ part: 'contentDetails', id: ids, key })}`, {
        signal: AbortSignal.timeout(10_000),
      })
      if (detailRes.ok) {
        const detail = (await detailRes.json()) as {
          items?: Array<{ id?: string; contentDetails?: { duration?: string } }>
        }
        for (const item of detail.items ?? []) {
          if (item.id) durations.set(item.id, formatIsoDuration(item.contentDetails?.duration))
        }
      }
    } catch {
      // durations are decoration — keep the cards
    }

    return hits.map((i) => {
      const id = i.id!.videoId!
      return {
        videoId: id,
        url: `https://www.youtube.com/watch?v=${id}`,
        title: decodeEntities(i.snippet?.title ?? 'Recipe video'),
        channel: i.snippet?.channelTitle ? decodeEntities(i.snippet.channelTitle) : null,
        thumbnail: i.snippet?.thumbnails?.medium?.url ?? i.snippet?.thumbnails?.default?.url ?? null,
        duration: durations.get(id) ?? null,
      }
    })
  } catch (e) {
    console.warn(`nashta youtube lookup failed: ${e instanceof Error ? e.message : e}`)
    return searchLinkFallback(query)
  }
}
