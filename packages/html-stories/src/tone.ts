/**
 * The voice an HTML story is written in. `straight` is the default: the
 * content section's "plain, no hype" voice, and the brief stays as it was.
 * `humorous` adds a "Tone" section that asks for a wry, sarcastic voice
 * while every accuracy rule still holds: the jokes go in the words, never in
 * the numbers.
 *
 * Client-safe: the admin toggle imports the type and labels.
 */

import type { HtmlStoryApp } from './apps'

export const HTML_STORY_TONES = ['straight', 'humorous'] as const
export type HtmlStoryTone = (typeof HTML_STORY_TONES)[number]

/** A tone from a query param or JSON body; null for anything unknown. Missing: straight. */
export function parseHtmlStoryTone(v: unknown): HtmlStoryTone | null {
  if (v == null || v === '') return 'straight'
  return typeof v === 'string' && (HTML_STORY_TONES as readonly string[]).includes(v) ? (v as HtmlStoryTone) : null
}

/** Per site: what the humour is aimed at, and one example of the voice. */
const HUMOR_TARGETS: Record<HtmlStoryApp, { targets: string; good: string; bad: string }> = {
  'vizmaya-fyi': {
    targets: 'institutions, official forecasts, press releases, policy U-turns and the gap between a promise and the chart',
    good: 'The ministry forecast 8% growth. The ministry has forecast 8% growth every year since 2014.',
    bad: 'Growth came in below the forecast.',
  },
  footshorts: {
    targets: 'tactics that did not work, transfer fees, managers\' post-match excuses, VAR and the gap between possession and chances',
    good: '71% possession, one shot on target. Control, of a sort.',
    bad: 'Arsenal dominated possession but struggled to create chances.',
  },
  vizf1: {
    targets: 'pit-wall strategy calls, team radio optimism, upgrade packages that changed nothing and the gap between the qualifying hype and Sunday',
    good: 'The undercut was planned for lap 18. The tyre gun had other plans.',
    bad: 'A slow pit stop cost Norris the position.',
  },
  viznba: {
    targets: 'shot selection, load management, contracts, coaching challenges and the gap between a team\'s payroll and its record',
    good: 'They took 41 threes and made 9. Volume is a strategy.',
    bad: 'The team shot poorly from three.',
  },
  travel: {
    targets: 'the travellers themselves (the plan, the overpacking, the wrong train), queues, prices and the gap between the itinerary and the day',
    good: 'The itinerary said "leisurely lunch, 45 min". The itinerary had not met the queue.',
    bad: 'Lunch took longer than expected.',
  },
}

/** The brief's "Tone" section; empty for the straight tone (the content section's voice stands). */
export function toneSection(app: HtmlStoryApp, tone: HtmlStoryTone | null | undefined): string {
  if (tone !== 'humorous') return ''
  const { targets, good, bad } = HUMOR_TARGETS[app]
  return `## Tone: humorous, a little sarcastic

This story is written with a sense of humour. It replaces "plain, no hype"
above: write like a sharp columnist with a dry wit, not a press release and
not a stand-up set.

- Aim the jokes at ${targets}. Never at victims, at anyone's identity, or at
  people who are suffering.
- Be specific: the funniest line is usually a real number set beside a
  claim it contradicts. "${good}", not "${bad}".
- Deadpan beats exclamation marks. Understatement, irony and a well-placed
  short sentence do the work; no emoji, no "lol", no memes that will date.
- Ration it: one good line per section beats a gag in every sentence. The
  reader must still learn what happened and why.
- Headlines, chart titles and pull quotes may carry the wit, but a chart
  title must still state its point, and axis labels, units, source lines and
  alt text stay plain.
- **Accuracy is not part of the joke.** Every figure, quote and fact follows
  the rules above exactly. Never exaggerate a number, invent a quote, or
  imply something the sources don't support for the sake of a punchline.
  Sarcasm must be readable as sarcasm: no line a reader could quote as a
  straight factual claim that isn't true.
- If the subject turns out to involve deaths, disaster, abuse or serious
  harm, drop the humour for that part (or the whole story) and write it
  straight.
`
}
