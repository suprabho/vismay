/**
 * The daily trend snapshot (./trends) on the server: read the beats from the
 * Xpoz REST API (https://api.xpoz.ai, `Authorization: Bearer $XPOZ_API_KEY`)
 * and keep one row per UTC day in randomizer_trends, migration 092.
 *
 * A source that fails is recorded on its beat, not swallowed: the snapshot is
 * 'partial' and the admin panel shows which source failed and why. A run where
 * every source fails is not saved: refreshTrends throws (the job goes red) and
 * the brief keeps the last good snapshot, marked stale after
 * TREND_RULES.staleAfterHours.
 *
 * Run by .github/workflows/randomizer-trends.yml (scripts/refresh-trends.ts).
 * Server only: imports the service Supabase client and reads the Xpoz key.
 */

import { createServiceClient } from '@vismay/content-source/supabase'
import { SpinError } from './spins'
import {
  TREND_BEATS,
  TREND_RULES,
  cleanTrendText,
  trendSourceLabel,
  trendStatus,
  type TrendBeat,
  type TrendBeatSnapshot,
  type TrendItem,
  type TrendSnapshot,
  type TrendSource,
} from './trends'

export const XPOZ_API_KEY_ENV = 'XPOZ_API_KEY'
const XPOZ_API_URL = 'https://api.xpoz.ai'
const MIGRATION_HINT = 'Trends need migration 092_randomizer_trends.sql applied'
const DAY = 864e5

export function hasXpozEnv(): boolean {
  return !!process.env[XPOZ_API_KEY_ENV]
}

type Fetch = typeof fetch

interface XpozPage {
  results: Array<Record<string, unknown>>
}

async function xpozGet(path: string, params: Record<string, string>, apiKey: string, fetchImpl: Fetch): Promise<XpozPage> {
  const url = `${XPOZ_API_URL}${path}?${new URLSearchParams(params)}`
  const res = await fetchImpl(url, {
    headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  const text = await res.text()
  let body: any = null
  try {
    body = JSON.parse(text)
  } catch {
    // keep the raw text for the error
  }
  if (!res.ok) {
    const why = body?.message ?? body?.error ?? text.slice(0, 200)
    throw new Error(`Xpoz ${res.status}${res.status === 402 ? ' (out of credits)' : res.status === 403 ? ' (trial keys cannot search live)' : ''}: ${why}`)
  }
  if (!body || !Array.isArray(body.results)) throw new Error('Xpoz answered without results')
  return body as XpozPage
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function isoOrNull(v: unknown): string | null {
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v).toISOString()
  if (typeof v !== 'string' || !v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function redditUrl(r: Record<string, unknown>): string {
  const link = str(r.postUrl) || str(r.permalink)
  if (!link) return str(r.url)
  return link.startsWith('http') ? link : `https://www.reddit.com${link.startsWith('/') ? '' : '/'}${link}`
}

async function readReddit(subreddit: string, apiKey: string, fetchImpl: Fetch): Promise<TrendItem[]> {
  const page = await xpozGet(
    `/api/data/reddit/posts/subreddits/${encodeURIComponent(subreddit)}/live`,
    {
      sort: 'top',
      time: 'day',
      limit: '25',
      fields: 'id,title,permalink,postUrl,url,subredditName,score,commentsCount,createdAt,stickied,over18',
    },
    apiKey,
    fetchImpl,
  )
  return page.results
    .filter((r) => !r.stickied && !r.over18 && str(r.title))
    .map(
      (r): TrendItem => ({
        platform: 'reddit',
        title: cleanTrendText(str(r.title)),
        url: redditUrl(r),
        where: `r/${str(r.subredditName) || subreddit}`,
        score: num(r.score),
        comments: num(r.commentsCount),
        postedAt: isoOrNull(r.createdAt),
      }),
    )
    .filter((i) => i.url)
    .sort((a, b) => b.score - a.score)
    .slice(0, TREND_RULES.perSource)
}

async function readTwitter(q: string, now: Date, apiKey: string, fetchImpl: Fetch): Promise<TrendItem[]> {
  const page = await xpozGet(
    '/api/data/twitter/posts/live',
    {
      q,
      since: new Date(now.getTime() - DAY).toISOString().slice(0, 10),
      lang: 'en',
      sortBy: 'relevance',
      fields: 'id,authorUsername,text,likeCount,retweetCount,replyCount,quoteCount,isRetweet,possiblySensitive,replyToTweetId,createdAt',
    },
    apiKey,
    fetchImpl,
  )
  const engagement = (r: Record<string, unknown>) => num(r.likeCount) + 2 * num(r.retweetCount) + num(r.quoteCount) + num(r.replyCount)
  return page.results
    .filter((r) => !r.isRetweet && !r.possiblySensitive && !r.replyToTweetId && str(r.text) && str(r.id) && str(r.authorUsername))
    .sort((a, b) => engagement(b) - engagement(a))
    .slice(0, TREND_RULES.perSource)
    .map(
      (r): TrendItem => ({
        platform: 'twitter',
        title: cleanTrendText(str(r.text)),
        url: `https://x.com/${str(r.authorUsername)}/status/${str(r.id)}`,
        where: `@${str(r.authorUsername)}`,
        score: num(r.likeCount),
        comments: num(r.replyCount),
        postedAt: isoOrNull(r.createdAt),
      }),
    )
}

function readSource(source: TrendSource, now: Date, apiKey: string, fetchImpl: Fetch): Promise<TrendItem[]> {
  return source.platform === 'reddit' ? readReddit(source.subreddit, apiKey, fetchImpl) : readTwitter(source.q, now, apiKey, fetchImpl)
}

/** Interleave the sources' lists so no one source fills the beat. */
function roundRobin(lists: TrendItem[][], max: number): TrendItem[] {
  const out: TrendItem[] = []
  const seen = new Set<string>()
  for (let i = 0; out.length < max && lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      const item = l[i]
      if (item && !seen.has(item.url) && out.length < max) {
        seen.add(item.url)
        out.push(item)
      }
    }
  }
  return out
}

/** Read every beat from Xpoz. Never throws for a source: its error lands on the beat. */
export async function collectTrends({
  apiKey = process.env[XPOZ_API_KEY_ENV],
  now = new Date(),
  beats = TREND_BEATS,
  fetchImpl = fetch,
}: { apiKey?: string; now?: Date; beats?: TrendBeat[]; fetchImpl?: Fetch } = {}): Promise<Omit<TrendSnapshot, 'refreshedBy'>> {
  if (!apiKey) throw new SpinError(`${XPOZ_API_KEY_ENV} is not set`, 503)
  const read = await Promise.all(
    beats.map(async (beat): Promise<TrendBeatSnapshot> => {
      const settled = await Promise.allSettled(beat.sources.map((s) => readSource(s, now, apiKey, fetchImpl)))
      const errors = settled.flatMap((r, i) =>
        r.status === 'rejected' ? [`${trendSourceLabel(beat.sources[i]!)}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`.slice(0, 300)] : [],
      )
      const lists = settled.map((r) => (r.status === 'fulfilled' ? r.value : []))
      return { id: beat.id, label: beat.label, items: roundRobin(lists, TREND_RULES.perBeat), errors }
    }),
  )
  const searches = beats.reduce((n, b) => n + b.sources.length, 0)
  return { day: now.toISOString().slice(0, 10), asOf: now.toISOString(), status: trendStatus(read, searches), beats: read, searches }
}

function check(error: { code?: string; message: string } | null): void {
  if (!error) return
  if (error.code === '42P01' || error.code === 'PGRST205') throw new SpinError(MIGRATION_HINT, 503)
  throw new SpinError(error.message, 500)
}

function mapTrends(r: any): TrendSnapshot {
  return {
    day: String(r.day).slice(0, 10),
    asOf: r.as_of,
    status: r.status === 'failed' || r.status === 'partial' ? r.status : 'ok',
    beats: Array.isArray(r.beats) ? r.beats : [],
    searches: r.searches ?? 0,
    refreshedBy: r.refreshed_by ?? null,
  }
}

/** The newest snapshot, or null when none was ever taken. */
export async function latestTrends(): Promise<TrendSnapshot | null> {
  const { data, error } = await createServiceClient().from('randomizer_trends').select('*').order('day', { ascending: false }).limit(1)
  check(error)
  return data?.[0] ? mapTrends(data[0]) : null
}

/** The newest snapshot for the brief and admin: null instead of throwing, so a missing table never breaks them. */
export async function latestTrendsOrNull(): Promise<TrendSnapshot | null> {
  try {
    return await latestTrends()
  } catch (e) {
    console.error('[randomizer] trends unavailable', e)
    return null
  }
}

export async function saveTrends(snapshot: Omit<TrendSnapshot, 'refreshedBy'>, by: string): Promise<TrendSnapshot> {
  const row = {
    day: snapshot.day,
    as_of: snapshot.asOf,
    status: snapshot.status,
    beats: snapshot.beats,
    searches: snapshot.searches,
    refreshed_by: by,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await createServiceClient().from('randomizer_trends').upsert(row, { onConflict: 'day' }).select('*').single()
  check(error)
  return mapTrends(data)
}

/** Read today's trends from Xpoz and keep them (re-running the same day replaces that day's row). */
export async function refreshTrends(by: string, now: Date = new Date()): Promise<TrendSnapshot> {
  const snapshot = await collectTrends({ now })
  if (snapshot.status === 'failed') {
    const why = snapshot.beats.flatMap((b) => b.errors)[0] ?? 'no source answered'
    throw new SpinError(`every Xpoz search failed, nothing saved (${why})`, 502)
  }
  return saveTrends(snapshot, by)
}
