/**
 * The footshorts HTML-story brief with its match context: the generic brief
 * (./brief) plus, when the editor picked matches, everything the match tables
 * know about them (@vismay/content-source/footshortsMatchBrief's
 * buildMatchContext — facts, full stat set, timeline, insights, commentary,
 * build-up, each team's form and schedule, the table, the competition's next
 * fixtures).
 *
 * With a Football Desk spin (@vismay/randomizer), the brief carries the spin
 * (assignment, research protocol, format, research file) and, unless the
 * editor picked matches, the match context for the fixtures the spin drew:
 * the team's recent results and next match, and any head-to-head meeting.
 *
 * Server only — the context is read with the service-role client.
 */

import { buildMatchContext, MAX_CONTEXT_MATCHES } from '@vismay/content-source/footshortsMatchBrief'
import type { BriefSpin } from '@vismay/randomizer/spinBrief'
import type { TrendSnapshot } from '@vismay/randomizer/trends'
import { htmlStoryBrief } from './brief'
import type { HtmlStoryFormat } from './formats'
import type { StoryStyle } from './styles'

export { MAX_CONTEXT_MATCHES }

export interface FootshortsBriefOptions {
  /** e.g. https://footshorts.com — the hosting site; also where the context's match links point. */
  siteUrl: string
  style?: StoryStyle | null
  /** Fixture ids (up to {@link MAX_CONTEXT_MATCHES}) the story is about. Empty: a brief with no match context. */
  fixtureIds?: string[]
  /** Editorial intent, surfaced at the top of the context. */
  prompt?: string
  /** The story format (./formats). Default: scroll. */
  format?: HtmlStoryFormat | null
  /** A Football Desk spin; its fixtures are the match context when `fixtureIds` is empty. */
  spin?: BriefSpin | null
  /** With a spin: the newest daily trend snapshot (see BriefOptions.trends). */
  trends?: TrendSnapshot | null
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
  spin,
  trends,
}: FootshortsBriefOptions): Promise<string> {
  const picked = fixtureIds.filter(Boolean)
  const ids = picked.length ? picked : spinFixtureIds(spin)
  const angle = prompt ?? (spin && !picked.length ? `Football Desk spin: ${spin.subject.randomizer === 'footshorts' ? spinPrompt(spin.subject) : ''}` : undefined)
  const context = ids.length ? await buildMatchContext(ids, { prompt: angle, siteUrl }) : null
  return htmlStoryBrief({ app: 'footshorts', siteUrl, style, context, format, spin, trends })
}

function spinPrompt(s: Extract<BriefSpin['subject'], { randomizer: 'footshorts' }>): string {
  const subject = s.opponent ? `${s.team.name} v ${s.opponent.name}` : s.team.name
  return `${subject} (${s.competition.name}), the ${s.angle.name} angle, ${s.freshness.name.toLowerCase()}.`
}
