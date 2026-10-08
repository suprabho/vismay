import 'server-only'
import { espnNews, gameDetail, scoreboard, type GameDetail, type NewsItem } from './espn'
import { biggestRun, type Run } from './margin'
import { teamFromEspn } from './teams'
import { addDays, ET, todayKey } from './time'

export type FeedItem = NewsItem & {
  /** Present on game recaps: drives the score-margin hero and the score row. */
  game?: { detail: GameDetail; run: Run | null }
}

const RECAPS = 8

/** Recaps of the most recent finished games, with their play-by-play. */
export async function recentRecaps(limit = RECAPS): Promise<FeedItem[]> {
  const today = todayKey(ET)
  const days = await Promise.all([scoreboard(today), scoreboard(addDays(today, -1))])
  const finals = days
    .flat()
    .filter((g) => g.state === 'post')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
  const details = await Promise.all(finals.map((g) => gameDetail(g.id, 3600)))
  return details
    .filter((d): d is GameDetail => !!d?.recap)
    .map((d) => ({
      id: `recap-${d.game.id}`,
      kind: 'recap' as const,
      label: 'Game recap',
      publisher: 'ESPN',
      headline: d.recap!.headline,
      body: d.recap!.description,
      published: d.recap!.published,
      url: d.recap!.url,
      image: d.recap!.image,
      teams: [d.game.away.team, d.game.home.team],
      gameId: d.game.id,
      game: { detail: d, run: biggestRun(d.margin) },
    }))
}

const TOPIC_LABEL: Record<string, string> = {
  game: 'Game',
  transaction: 'Transaction',
  injury: 'Injury',
  draft: 'Draft',
  front_office: 'Front office',
  league: 'League',
  analysis: 'Analysis',
  off_court: 'Off court',
}

/**
 * Optional: the summarised, team-tagged articles that `@viznba/worker`
 * ingests from a dozen RSS feeds into Supabase. Read straight from PostgREST
 * with the anon key (RLS exposes summarised rows only); skipped when the env
 * isn't set, so the app runs on ESPN alone.
 */
async function workerArticles(): Promise<FeedItem[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return []
  const query =
    'select=id,url,publisher,headline,summary,image_url,published_at,topic_category,viznba_article_entities(entity_type,entity_id,confidence)' +
    '&status=eq.summarized&order=published_at.desc&limit=40'
  try {
    const res = await fetch(`${url}/rest/v1/viznba_articles?${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const rows = (await res.json()) as Array<{
      id: string
      url: string
      publisher: string
      headline: string
      summary: string | null
      image_url: string | null
      published_at: string
      topic_category: string | null
      viznba_article_entities?: Array<{ entity_type: string; entity_id: string; confidence: number }>
    }>
    return rows.map((r) => ({
      id: `w-${r.id}`,
      kind: 'news' as const,
      label: TOPIC_LABEL[r.topic_category ?? ''] ?? 'News',
      publisher: r.publisher,
      headline: r.headline,
      body: r.summary ?? '',
      published: r.published_at,
      url: r.url,
      image: r.image_url,
      teams: (r.viznba_article_entities ?? [])
        .filter((e) => e.entity_type === 'team' && e.confidence >= 0.5)
        .map((e) => teamFromEspn('', e.entity_id))
        .filter((t) => !t.id.startsWith('x'))
        .slice(0, 3),
      gameId: null,
    }))
  } catch {
    return []
  }
}

function normaliseHeadline(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export async function feed(): Promise<FeedItem[]> {
  const [recaps, news, worker] = await Promise.all([recentRecaps(), espnNews(40), workerArticles()])
  const seen = new Set<string>()
  const out: FeedItem[] = []
  for (const item of [...recaps, ...worker, ...news]) {
    const key = normaliseHeadline(item.headline)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out.sort((a, b) => b.published.localeCompare(a.published)).slice(0, 40)
}
