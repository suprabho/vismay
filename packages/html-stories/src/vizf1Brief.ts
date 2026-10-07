/**
 * The vizf1 HTML-story brief with its race context: the generic brief
 * (./brief) plus, when the editor picked sessions, everything the timing and
 * telemetry tables know about them and the drivers the story follows
 * (@vismay/f1-viz/race-context's buildRaceContext — classifications, lap-by-lap
 * timing, sectors and speed traps, strategy, key moments, the head-to-head
 * across sessions and races, and the championship round by round).
 *
 * Server only — the context is read with the service-role client.
 */

import { createServiceClient } from '@vismay/content-source/supabase'
import {
  buildRaceContext,
  MAX_RACE_CONTEXT_DRIVERS,
  MAX_RACE_CONTEXT_SESSIONS,
} from '@vismay/f1-viz/race-context'
import { htmlStoryBrief } from './brief'
import type { HtmlStoryFormat } from './formats'
import type { StoryStyle } from './styles'

export { MAX_RACE_CONTEXT_DRIVERS, MAX_RACE_CONTEXT_SESSIONS }

export interface Vizf1BriefOptions {
  /** e.g. https://www.vizf1.com — the hosting site; team logos and race pages resolve against it. */
  siteUrl: string
  style?: StoryStyle | null
  /** Telemetry session keys (up to {@link MAX_RACE_CONTEXT_SESSIONS}). Empty: a brief with no race context. */
  sessionKeys?: string[]
  /** Driver codes (VER) or car numbers the story follows (up to {@link MAX_RACE_CONTEXT_DRIVERS}). Empty: the top scorers. */
  drivers?: string[]
  /** Editorial intent, surfaced at the top of the context. */
  prompt?: string
  /** The story format (./formats). Default: scroll. */
  format?: HtmlStoryFormat | null
}

export async function vizf1HtmlStoryBrief({
  siteUrl,
  style,
  sessionKeys = [],
  drivers = [],
  prompt,
  format,
}: Vizf1BriefOptions): Promise<string> {
  const keys = sessionKeys.filter(Boolean)
  const context = keys.length
    ? await buildRaceContext(createServiceClient(), { sessionKeys: keys, drivers, prompt, siteUrl })
    : null
  return htmlStoryBrief({ app: 'vizf1', siteUrl, style, context, format })
}
