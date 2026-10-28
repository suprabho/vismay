/**
 * The footshorts HTML-story brief with its match context: the generic brief
 * (./brief) plus, when the editor picked matches, everything the match tables
 * know about them (@vismay/content-source/footshortsMatchBrief's
 * buildMatchContext — facts, full stat set, timeline, insights, commentary,
 * build-up, each team's form and schedule, the table, the competition's next
 * fixtures).
 *
 * With a club (`club`: a team slug), the brief also carries the match context
 * for that club's fixtures across every competition: its last results and
 * its next matches (pickClubFixtures), after any picked fixtures, up to the cap.
 *
 * With a Football Desk spin (@vismay/randomizer), the brief carries the spin
 * (assignment, research protocol, format, research file) and, unless the
 * editor picked matches, the match context for the fixtures the spin drew:
 * the team's recent results and next match, and any head-to-head meeting.
 *
 * Server only — the context is read with the service-role client.
 */

import { buildMatchContext, MAX_CONTEXT_MATCHES } from '@vismay/content-source/footshortsMatchBrief'
import { fetchFixturesForTeam } from '@vismay/content-source/footshortsData'
import type { BriefSpin } from '@vismay/randomizer/spinBrief'
import { htmlStoryBrief } from './brief'
import type { AuthorableHtmlStoryFormat } from './formats'
import type { StoryStyle } from './styles'
import type { HtmlStoryTone } from './tone'

export { MAX_CONTEXT_MATCHES }

/** How many of a club's results and upcoming fixtures a club brief takes by default. */
export const CLUB_FIXTURES_DEFAULT = { last: 5, next: 3 } as const
/** Most results (or upcoming fixtures) one club brief asks for. */
export const MAX_CLUB_FIXTURES_SIDE = 20

/** A club whose fixtures the brief covers: its last `last` results and next `next` matches. */
export interface ClubFixturesPick {
  /** The team's entity slug, e.g. arsenal. */
  team: string
  last?: number
  next?: number
}

/**
 * The fixture ids a club brief covers, from the club's fixtures across every
 * competition: its `last` most recent results, oldest first, then its `next`
 * upcoming (or live) matches, soonest first. Postponed and cancelled
 * fixtures are skipped.
 */
export function pickClubFixtures(
  fixtures: Array<{ id: string; kickoff_at: string; status: string }>,
  { last = CLUB_FIXTURES_DEFAULT.last, next = CLUB_FIXTURES_DEFAULT.next, now = new Date() }: { last?: number; next?: number; now?: Date } = {},
): string[] {
  const at = now.toISOString()
  const played = fixtures
    .filter((f) => f.status === 'finished')
    .sort((a, b) => b.kickoff_at.localeCompare(a.kickoff_at))
    .slice(0, Math.max(0, last))
    .reverse()
  const ahead = fixtures
    .filter((f) => f.status === 'live' || (f.status === 'scheduled' && f.kickoff_at >= at))
    .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at))
    .slice(0, Math.max(0, next))
  return [...played, ...ahead].map((f) => f.id)
}

/** The fixture ids for a club pick; throws when the club has none. Server only. */
export async function clubFixtureIds(club: ClubFixturesPick): Promise<string[]> {
  const fixtures = await fetchFixturesForTeam(club.team, { limit: 200 })
  const ids = pickClubFixtures(fixtures, club)
  if (!ids.length) throw new Error(`no fixtures for team ${club.team}`)
  return ids
}

export interface FootshortsBriefOptions {
  /** e.g. https://footshorts.com — the hosting site; also where the context's match links point. */
  siteUrl: string
  style?: StoryStyle | null
  /** Fixture ids (up to {@link MAX_CONTEXT_MATCHES}) the story is about. Empty: a brief with no match context. */
  fixtureIds?: string[]
  /** Editorial intent, surfaced at the top of the context. */
  prompt?: string
  /** The story format (./formats). Default: scroll. */
  format?: AuthorableHtmlStoryFormat | null
  /** The story's voice (./tone). Default: straight. */
  tone?: HtmlStoryTone | null
  /** A club whose recent results and next matches join the match context (after `fixtureIds`, up to the cap). */
  club?: ClubFixturesPick | null
  /** A Football Desk spin; its fixtures are the match context when neither `fixtureIds` nor `club` is set. */
  spin?: BriefSpin | null
}

/** The fixtures a spin's brief carries match context for (empty for any spin but a Football Desk one). */
export function spinFixtureIds(spin: BriefSpin | null | undefined): string[] {
  return spin?.subject.randomizer === 'footshorts' ? spin.subject.fixtureIds : []
}

export async function footshortsHtmlStoryBrief({
  siteUrl,
  style,
  fixtureIds = [],
  prompt,
  format,
  tone,
  club,
  spin,
}: FootshortsBriefOptions): Promise<string> {
  const fromClub = club ? await clubFixtureIds(club) : []
  const picked = Array.from(new Set([...fixtureIds.filter(Boolean), ...fromClub])).slice(0, MAX_CONTEXT_MATCHES)
  const ids = picked.length ? picked : spinFixtureIds(spin)
  const angle = prompt ?? (spin && !picked.length ? `Football Desk spin: ${spin.subject.randomizer === 'footshorts' ? spinPrompt(spin.subject) : ''}` : undefined)
  const context = ids.length ? await buildMatchContext(ids, { prompt: angle, siteUrl }) : null
  return htmlStoryBrief({ app: 'footshorts', siteUrl, style, context, format, spin, tone })
}

function spinPrompt(s: Extract<BriefSpin['subject'], { randomizer: 'footshorts' }>): string {
  const subject = s.opponent ? `${s.team.name} v ${s.opponent.name}` : s.team.name
  return `${subject} (${s.competition.name}), the ${s.angle.name} angle, ${s.freshness.name.toLowerCase()}.`
}
