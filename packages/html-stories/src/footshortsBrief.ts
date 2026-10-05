/**
 * The footshorts HTML-story brief with its match context: the generic brief
 * (./brief) plus, when the editor picked matches, everything the match tables
 * know about them (@vismay/content-source/footshortsMatchBrief's
 * buildMatchContext — facts, full stat set, timeline, insights, commentary,
 * build-up, each team's form and schedule, the table, the competition's next
 * fixtures).
 *
 * Server only — the context is read with the service-role client.
 */

import { buildMatchContext, MAX_BRIEF_MATCHES } from '@vismay/content-source/footshortsMatchBrief'
import { htmlStoryBrief } from './brief'
import type { StoryStyle } from './styles'

export { MAX_BRIEF_MATCHES }

export interface FootshortsBriefOptions {
  /** e.g. https://footshorts.com — the hosting site; also where the context's match links point. */
  siteUrl: string
  style?: StoryStyle | null
  /** Fixture ids (up to {@link MAX_BRIEF_MATCHES}) the story is about. Empty: a brief with no match context. */
  fixtureIds?: string[]
  /** Editorial intent, surfaced at the top of the context. */
  prompt?: string
}

export async function footshortsHtmlStoryBrief({
  siteUrl,
  style,
  fixtureIds = [],
  prompt,
}: FootshortsBriefOptions): Promise<string> {
  const ids = fixtureIds.filter(Boolean)
  const context = ids.length ? await buildMatchContext(ids, { prompt, siteUrl }) : null
  return htmlStoryBrief({ app: 'footshorts', siteUrl, style, context })
}
