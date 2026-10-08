/**
 * The vizf1 HTML-story brief with its race context: the generic brief
 * (./brief) plus, when the editor picked sessions, everything the timing and
 * telemetry tables know about them and the drivers the story follows
 * (@vismay/f1-viz/race-context's buildRaceContext — classifications, lap-by-lap
 * timing, sectors and speed traps, strategy, key moments, the head-to-head
 * across sessions and races, and the championship round by round). A brief
 * for the recap format also lists each race's replay moments
 * (@vismay/f1-viz/recap): the cues that point the 3D replay at them.
 *
 * Server only — the context is read with the service-role client.
 */

import { createServiceClient } from '@vismay/content-source/supabase'
import {
  buildRaceContext,
  MAX_RACE_CONTEXT_DRIVERS,
  MAX_RACE_CONTEXT_SESSIONS,
} from '@vismay/f1-viz/race-context'
import { loadReplayMoments, replayMomentsMarkdown } from '@vismay/f1-viz/recap'
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
  const db = keys.length ? createServiceClient() : null
  let context = db ? await buildRaceContext(db, { sessionKeys: keys, drivers, prompt, siteUrl }) : null
  if (db && format === 'recap') context = `${context ?? ''}\n\n${await replayMomentsSection(db, keys)}`
  return htmlStoryBrief({ app: 'vizf1', siteUrl, style, context, format })
}

/** Races (and sprints) only: a recap frames a race's replay. */
const RACE_KEY = /_(R|S)$/

/** "## Replay moments": for each race picked, its replay attributes and one cue per moment. */
async function replayMomentsSection(db: ReturnType<typeof createServiceClient>, keys: string[]): Promise<string> {
  const races = keys.filter((k) => RACE_KEY.test(k))
  const found = (await Promise.all(races.map((k) => loadReplayMoments(db, k).catch(() => null)))).filter(
    (m): m is NonNullable<typeof m> => m != null,
  )
  const body = found.length
    ? found.map(replayMomentsMarkdown).join('\n\n')
    : `None of the sessions picked is an ingested race, so there is no replay to frame. Pick a race (its key ends in _R) for a recap.`
  return `## Replay moments

The moments in each race worth pointing the 3D replay at, with their cues
(see "Story format: a race recap").

${body}`
}
