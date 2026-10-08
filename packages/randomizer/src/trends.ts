/**
 * What is trending today, as the randomizers read it: a daily snapshot of the
 * most-engaged social posts per beat (world news, business and tech, culture
 * and history, football), pulled from Xpoz (xpoz.ai) by the daily job
 * (./trendsServer, .github/workflows/randomizer-trends.yml) and kept in
 * randomizer_trends, migration 092.
 *
 * Xpoz has no "trending topics" endpoint: a beat is a set of searches that
 * stand in for one. Subreddits read with sort=top&time=day (the day's most
 * upvoted threads), and X searches over the last day ranked by engagement.
 * Every source is 2 credits a run, so the beats below cost about 20 credits a
 * day; edit TREND_BEATS to tune them.
 *
 * The spin's brief carries the beats its randomizer reads (trendsSection) as
 * context before the agent writes anything: a timely hook if one genuinely
 * connects to the drawn subject, never a reason to change the subject.
 *
 * Pure: no Supabase / Node imports, so admin client components can use it.
 * None of the text here uses em dashes, because the playbook bans them in
 * everything generated (titles quoted from posts have theirs replaced).
 */

import type { BriefSpin } from './spinBrief'
import { RANDOMIZER_META, type RandomizerId, type SpinSubject } from './types'

export type TrendPlatform = 'reddit' | 'twitter'

/** One search that stands in for "what is trending" on a beat. */
export type TrendSource =
  /** A subreddit's top threads of the day. */
  | { platform: 'reddit'; subreddit: string }
  /** An X search over the last day, ranked by engagement. `label` names it in the brief. */
  | { platform: 'twitter'; q: string; label: string }

export interface TrendBeat {
  id: string
  label: string
  /** The randomizers whose briefs carry this beat. */
  randomizers: RandomizerId[]
  sources: TrendSource[]
}

export const TREND_BEATS: TrendBeat[] = [
  {
    id: 'world',
    label: 'World news',
    randomizers: ['desk', 'atlas', 'epics'],
    sources: [
      { platform: 'reddit', subreddit: 'worldnews' },
      { platform: 'reddit', subreddit: 'news' },
    ],
  },
  {
    id: 'business',
    label: 'Business, markets and tech',
    randomizers: ['desk'],
    sources: [
      { platform: 'reddit', subreddit: 'Economics' },
      { platform: 'reddit', subreddit: 'technology' },
      { platform: 'reddit', subreddit: 'business' },
      {
        platform: 'twitter',
        label: 'Desk industries on X',
        q: '(semiconductors OR "data center" OR "AI chips" OR "oil prices" OR OPEC OR "interest rates" OR IPO OR shipping OR defense OR pharma)',
      },
    ],
  },
  {
    id: 'culture',
    label: 'Culture, history and travel',
    randomizers: ['atlas', 'epics'],
    sources: [
      { platform: 'reddit', subreddit: 'history' },
      { platform: 'reddit', subreddit: 'travel' },
      { platform: 'reddit', subreddit: 'mythology' },
    ],
  },
  {
    id: 'football',
    label: 'Football',
    randomizers: ['footshorts'],
    sources: [
      { platform: 'reddit', subreddit: 'soccer' },
      {
        platform: 'twitter',
        label: 'Football on X',
        q: '("Premier League" OR "Champions League" OR "La Liga" OR "Serie A" OR Bundesliga OR "Ligue 1" OR "World Cup")',
      },
    ],
  },
]

/** The tunable numbers behind the snapshot and its brief section. */
export const TREND_RULES = {
  /** Items kept per source, after filtering. */
  perSource: 6,
  /** Items kept per beat (round-robin across its sources). */
  perBeat: 12,
  /** Items per beat shown in the brief. */
  briefPerBeat: 8,
  /** A snapshot older than this is shown as stale. */
  staleAfterHours: 36,
} as const

export interface TrendItem {
  platform: TrendPlatform
  /** Thread title, or the post text (trimmed). */
  title: string
  url: string
  /** r/subreddit or @handle. */
  where: string
  /** Reddit score, or likes on X. */
  score: number
  comments: number
  /** ISO timestamp, when the source gave one. */
  postedAt: string | null
}

export interface TrendBeatSnapshot {
  id: string
  label: string
  items: TrendItem[]
  /** Sources that failed this run, with why. */
  errors: string[]
}

export type TrendStatus = 'ok' | 'partial' | 'failed'

/** One day's snapshot (a randomizer_trends row). */
export interface TrendSnapshot {
  /** UTC day, YYYY-MM-DD. */
  day: string
  /** ISO timestamp the snapshot was read. */
  asOf: string
  status: TrendStatus
  beats: TrendBeatSnapshot[]
  /** Searches the run made (each spends Xpoz credits). */
  searches: number
  refreshedBy: string | null
}

export function trendBeatsFor(randomizer: RandomizerId): TrendBeat[] {
  return TREND_BEATS.filter((b) => b.randomizers.includes(randomizer))
}

export function trendSourceLabel(s: TrendSource): string {
  return s.platform === 'reddit' ? `r/${s.subreddit}` : s.label
}

/** Ok when every source answered, failed when none did. */
export function trendStatus(beats: TrendBeatSnapshot[], searches: number): TrendStatus {
  const failures = beats.reduce((n, b) => n + b.errors.length, 0)
  return failures === 0 ? 'ok' : failures >= searches ? 'failed' : 'partial'
}

export function trendAgeHours(snapshot: Pick<TrendSnapshot, 'asOf'>, now: Date = new Date()): number {
  return (now.getTime() - new Date(snapshot.asOf).getTime()) / 36e5
}

export function isTrendSnapshotStale(snapshot: Pick<TrendSnapshot, 'asOf'>, now: Date = new Date()): boolean {
  return trendAgeHours(snapshot, now) > TREND_RULES.staleAfterHours
}

/** Social text into one clean line: no newlines, no em dashes, capped. */
export function cleanTrendText(s: string, max = 220): string {
  const line = s
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s*—\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

/** The names a spin is about, for spotting them in the day's posts. */
export function subjectTerms(subject: SpinSubject): string[] {
  const terms =
    subject.randomizer === 'desk'
      ? [subject.sub.name, subject.industry.name]
      : subject.randomizer === 'atlas'
        ? [subject.country.name, subject.pair?.name]
        : subject.randomizer === 'epics'
          ? [subject.epic.title, subject.place.name]
          : [subject.team.name, subject.opponent?.name, subject.competition.name]
  return [...new Set(terms.filter((t): t is string => !!t && t.trim().length >= 3).map((t) => t.trim()))]
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Whole-word, case-insensitive. */
export function mentions(text: string, term: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}($|[^\\p{L}\\p{N}])`, 'iu').test(text)
}

function itemLine(item: TrendItem): string {
  const stat = item.platform === 'reddit' ? `${item.score} upvotes, ${item.comments} comments` : `${item.score} likes, ${item.comments} replies`
  return `- [${item.title.replace(/[[\]]/g, '')}](${item.url}) (${item.where}; ${stat})`
}

/**
 * "## Trending today": the beats this spin's randomizer reads, from the
 * newest snapshot, with the posts that name the drawn subject first. Context
 * for the Why Now and the hook, not a source: anything used is verified like
 * every other claim.
 */
export function trendsSection(snapshot: TrendSnapshot | null, spin: Pick<BriefSpin, 'randomizer' | 'subject'>, now: Date = new Date()): string {
  const heading = '## Trending today'
  if (!snapshot) {
    return `${heading}

No trend snapshot is on file (the daily Xpoz job has not run, or randomizer_trends is missing). Work without it.`
  }
  const beats = trendBeatsFor(spin.randomizer)
    .map((b) => snapshot.beats.find((s) => s.id === b.id))
    .filter((b): b is TrendBeatSnapshot => !!b)
  const age = Math.max(0, Math.round(trendAgeHours(snapshot, now)))
  const stale = isTrendSnapshotStale(snapshot, now)
  const out = [
    heading,
    '',
    `What people were talking about on Reddit and X on ${snapshot.day} (read ${age} ${age === 1 ? 'hour' : 'hours'} ago, via Xpoz), for the ${RANDOMIZER_META[spin.randomizer].name}'s beats.${
      stale ? ' This snapshot is stale: the daily job has not run since, so treat it as background, not as today.' : ''
    }`,
    '',
    'How to use it:',
    '- Read it before the research. If a post genuinely connects to the subject, it can be the Why Now or the opening hook.',
    '- It never changes the assignment. Do not swap the drawn subject for whatever is trending.',
    '- Social posts are signals, not sources. Anything you use goes in the claims log and is verified under the research protocol like every other claim.',
  ]

  const items = beats.flatMap((b) => b.items)
  const terms = subjectTerms(spin.subject)
  const hits = items.filter((i) => terms.some((t) => mentions(i.title, t)))
  out.push('')
  if (hits.length) {
    out.push(`### Mentions of ${terms.join(', ')}`, '', ...hits.slice(0, 8).map(itemLine))
  } else if (terms.length) {
    out.push(`Nothing in today's set names ${terms.join(', ')} directly. Look for an indirect link, or leave the trends aside.`)
  }

  if (!beats.some((b) => b.items.length)) {
    out.push('', 'The snapshot has no posts for these beats today.')
  }
  for (const b of beats) {
    if (!b.items.length) continue
    out.push('', `### ${b.label}`, '', ...b.items.slice(0, TREND_RULES.briefPerBeat).map(itemLine))
  }
  return out.join('\n')
}
