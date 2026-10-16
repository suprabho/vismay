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

/** Per site: what the humour is aimed at, one line of the voice, and one headline rewrite. */
const HUMOR_TARGETS: Record<
  HtmlStoryApp,
  { targets: string; good: string; bad: string; headline: [straight: string, funny: string] }
> = {
  'vizmaya-fyi': {
    targets:
      'institutions, official forecasts, press releases, corporate "industry firsts", policy U-turns, jargon, and the gap between a promise and the chart',
    good: 'The ministry forecast 8% growth. The ministry has forecast 8% growth every year since 2014.',
    bad: 'Growth came in below the forecast.',
    headline: ['AI shopping: merchants face returns first', 'Your AI agent bought the wrong thing. Guess who gets the box.'],
  },
  footshorts: {
    targets:
      'tactics that did not work, transfer fees, managers\' post-match excuses, VAR, owners, and the gap between possession and chances',
    good: '71% possession, one shot on target. Control, of a sort.',
    bad: 'Arsenal dominated possession but struggled to create chances.',
    headline: ['Arsenal dominate possession but lose to Chelsea', 'Arsenal had the ball for 64 minutes. Chelsea had the goals.'],
  },
  vizf1: {
    targets:
      'pit-wall strategy calls, team radio optimism, upgrade packages that changed nothing, stewards, and the gap between the qualifying hype and Sunday',
    good: 'The undercut was planned for lap 18. The tyre gun had other plans.',
    bad: 'A slow pit stop cost Norris the position.',
    headline: ['Slow stop costs Norris the win', 'Norris was faster for 57 laps and slower for 4.2 seconds. Guess which counted.'],
  },
  viznba: {
    targets:
      'shot selection, load management, contracts, coaching challenges, front offices, and the gap between a team\'s payroll and its record',
    good: 'They took 41 threes and made 9. Volume is a strategy.',
    bad: 'The team shot poorly from three.',
    headline: ['Knicks win with bench minutes', 'The Knicks\' best lineup was the one without their best player.'],
  },
  travel: {
    targets:
      'the travellers themselves (the plan, the overpacking, the wrong train, the step count), queues, prices, the weather, and the gap between the itinerary and the day',
    good: 'The itinerary said "leisurely lunch, 45 min". The itinerary had not met the queue.',
    bad: 'Lunch took longer than expected.',
    headline: ['Day 3: Brooklyn and the Bridge', 'Day 3, in which we walked 24,000 steps to eat one sandwich.'],
  },
}

const REQUIRED_PLACES = [
  'the headline and the dek',
  'every section heading (or kicker) and the line that opens each section',
  'every chart title',
  'the key numbers strip: each stat\'s one-line caption',
  'any pull quote or callout, and the closing line',
]

/** A short notice for the top of the brief, so the voice is set before anything else is read. */
export function toneBanner(tone: HtmlStoryTone | null | undefined): string {
  if (tone !== 'humorous') return ''
  return `
> **Voice: humorous and sarcastic (required).** This story must be funny. Read
> "Tone" below before you write a word: it overrides every "write plainly" or
> "no hype" line in this brief. The facts stay exact; the voice does not stay
> neutral. A straight-faced page fails this brief even if every number is right.
`
}

/** The brief's "Tone" section; empty for the straight tone (the content section's voice stands). */
export function toneSection(app: HtmlStoryApp, tone: HtmlStoryTone | null | undefined): string {
  if (tone !== 'humorous') return ''
  const { targets, good, bad, headline } = HUMOR_TARGETS[app]
  return `## Tone: humorous and sarcastic (required)

This story is funny. Write it like a sharp, sardonic columnist (think John
Oliver's writers, Matt Levine, Private Eye, The Onion's headline desk working
from real numbers): dry, knowing, openly sarcastic about the people and
institutions in the story. Not a press release, not a neutral explainer with
one joke at the end. This section overrides "write plainly", "no hype" and
"lead with the finding" elsewhere in the brief: you still lead with the
finding, you just say it with a raised eyebrow.

**Where the jokes must go.** Each of these carries wit, every time:
${REQUIRED_PLACES.map((p) => `- ${p}`).join('\n')}
- body copy: at least one line per section a reader would quote to a friend

**How it should sound.**
- Aim at: ${targets}.
  Never at victims, at anyone's identity, or at people who are suffering.
- The best joke is a real fact set beside a claim it embarrasses:
  "${good}" beats "${bad}"
- Headlines too: "${headline[1]}" beats "${headline[0]}"
- Tools that work: deadpan understatement, the pointed short sentence after a
  long one, quoting official language and then translating it, scare quotes
  on corporate euphemisms, an absurd but accurate comparison of scale, the
  rhetorical question the source would rather you didn't ask.
- A dry or technical subject (payments, regulation, fiscal policy, tyre
  compounds) is not a reason to write straight; the jargon is the material.
  Translate it into what it means for an ordinary person, sarcastically.
- Hedges and caveats still belong on the page, but make them sound like a
  person, not a disclaimer: "Is this a crisis? Not yet. 0.0002% of anything
  is not a crisis." beats "These data do not establish a crisis."
- No emoji, no "lol", no memes that will date, no exclamation marks doing
  the work a sentence should.

**What stays straight.** Axis labels, units, source lines, the claims log,
alt text and photo credits are plain and exact. A chart title may be funny
but must still state the chart's point.

**Accuracy is not part of the joke.** Every figure, quote and fact follows
the rules above exactly. Never exaggerate a number, invent a quote, or imply
something the sources don't support for a punchline. Sarcasm must read as
sarcasm: no line a reader could quote as a straight factual claim that isn't
true. Contested claims are still labelled contested, just wryly.

**The one exception.** Where the story involves deaths, disaster, abuse or
serious harm to people, write that part straight (the institutions around it
are still fair game). Do not use this as a reason to make the whole page
neutral when the subject is merely serious, dull or about money.
`
}

/** "Before you post" checks for the tone; empty for straight. */
export function toneChecks(tone: HtmlStoryTone | null | undefined): string[] {
  if (tone !== 'humorous') return []
  return [
    'the voice: read the headline, dek, section headings and chart titles aloud in a row. If they could run in a neutral trade report, rewrite them; they must be funny on their own',
    'every section has at least one line a reader would quote for being funny; no section is joke-free',
    'no joke bends a number, invents a quote or states sarcasm as fact',
  ]
}

/**
 * The content sections' plain-voice lines, pointed at the Tone section when the
 * story is humorous, so the brief never says "write plainly" and "be funny" at once.
 */
export function applyToneToVoice(section: string, tone: HtmlStoryTone | null | undefined): string {
  if (tone !== 'humorous') return section
  return section
    .replace(/Write plainly\. No hype\./g, 'Voice: funny and sarcastic, per "Tone" below (never hype).')
    .replace(/not a press release: plain, specific, no hype\./g, 'not a press release: specific, sarcastic, funny (see "Tone" below).')
}
