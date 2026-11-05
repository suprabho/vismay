/**
 * The sections a spin adds to the HTML story brief (packages/html-stories
 * brief.ts): the assignment written from the reels, the research protocol
 * (playbook 0.2, 0.3, 0.5), the deliverables, the randomizer's output format
 * (1.5, 2.5, 3.6), the reel script rules (0.4) and the quality checklist (5).
 *
 * Kept here, next to the datasets and the draw, so the brief only decides
 * where the sections go. Pure. None of this text uses em dashes, because the
 * playbook bans them in everything generated.
 */

import {
  curiousClaimLabel,
  curiousCreditLine,
  curiousDocumentLabel,
  curiousGradeNotes,
  curiousLensMetrics,
  evidenceCreditLine,
  evidenceLensMetrics,
  evidenceStudyLabel,
  fixtureSummary,
  footshortsAngleMetrics,
  frontierAbsUrl,
  frontierCreditLine,
  frontierHeadline,
  frontierLensMetrics,
  frontierPaperLabel,
  gameSummary,
  hundredCreditLine,
  hundredLensMetrics,
  hundredLife,
  hundredRankLabel,
  LANDMARK_WORK_LEVEL_LABEL,
  landmarkAwardLabel,
  landmarkCreditLine,
  landmarkFocus,
  landmarkFocusNoun,
  landmarkLensDescription,
  landmarkLensMetrics,
  landmarkReadings,
  landmarkWorkBasisLabel,
  ocwCourseLabel,
  ocwCreditLine,
  ocwLensMetrics,
  researchFileName,
  researchStub,
  viznbaAngleMetrics,
} from './stub'
import { curiousGradeLabel, FRONTIER } from './datasets'
import {
  RANDOMIZER_META,
  type AtlasSubject,
  type CuriousSubject,
  type DeskSubject,
  type EpicsSubject,
  type EvidenceSubject,
  type FootshortsFixtureRef,
  type FootshortsSubject,
  type FrontierSubject,
  type HundredSubject,
  type LandmarkSubject,
  type OcwSubject,
  type SpinRecord,
  type ViznbaGameRef,
  type ViznbaSubject,
} from './types'

export type BriefSpin = Pick<
  SpinRecord,
  'id' | 'seed' | 'randomizer' | 'subject' | 'createdAt' | 'reels' | 'status' | 'heroInsight' | 'researchMd'
>

/** The lens that turns a spin's page into a picture story for a five-year-old. */
export const ELI5_LENS = "Explain like I'm 5"

/**
 * An "Explain like I'm 5" spin: its page is not the randomizer's format with
 * one simple paragraph inside, it is a short picture story a child can follow.
 * The research behind it stays as rigorous as any other spin's.
 */
export function isEli5Spin(spin: Pick<BriefSpin, 'subject'>): boolean {
  const s = spin.subject
  return (s.randomizer === 'hundred' || s.randomizer === 'landmark' || s.randomizer === 'ocw' || s.randomizer === 'evidence' || s.randomizer === 'frontier' || s.randomizer === 'curious') && s.lens.name === ELI5_LENS
}

/** What the picture story is about, and what the grown-ups card credits, per randomizer. */
function eli5Subject(spin: BriefSpin): { who: string; real: string; credit: string } {
  const s = spin.subject
  if (s.randomizer === 'hundred') {
    return {
      who: s.person.name,
      real: `#${s.person.rank} of 100 in ${s.book.author}'s list, and what the record says ${s.person.name} changed`,
      credit: hundredCreditLine(s),
    }
  }
  if (s.randomizer === 'landmark') {
    return {
      who: s.award.name,
      real: `the ${landmarkAwardLabel(s.prize, s.award.year)} and ${landmarkFocus(s) === 'work' ? 'the work it rewarded' : 'what it rewarded'}`,
      credit: landmarkCreditLine(s),
    }
  }
  if (s.randomizer === 'evidence') {
    return {
      who: `the people who ran ${s.study.label}`,
      real: `${evidenceStudyLabel(s)}, what its design can show, and the strongest study on the other side`,
      credit: evidenceCreditLine(s),
    }
  }
  if (s.randomizer === 'frontier') {
    return {
      who: `the people who wrote "${s.paper.title}"`,
      real: `${frontierPaperLabel(s.paper)}, what it claims, and how strong the evidence is so far`,
      credit: frontierCreditLine(s),
    }
  }
  if (s.randomizer === 'ocw') {
    return { who: `the idea in ${ocwCourseLabel(s.course)}`, real: 'the resource and its course page', credit: ocwCreditLine(s) }
  }
  if (s.randomizer === 'curious') {
    return {
      who: s.claim.subject ?? 'the people in the claim',
      real: `the claim "${curiousClaimLabel(s.claim, 70)}", its ${curiousGradeLabel(s.claim).toLowerCase()} and the sources behind it`,
      credit: curiousCreditLine(s),
    }
  }
  return { who: 'the subject', real: 'the record', credit: '' }
}

/** One line near the top of every spun brief: which rule wins when two clash. */
export const PRECEDENCE_LINE =
  'When rules in this brief clash, the higher one wins: format > reader > tone > house rules. A format\'s unit counts, chart counts and image rules beat the generic sections below.'

/** A short notice for the top of the brief, so the reader is set before anything else is read. */
export function eli5Banner(spin: BriefSpin | null | undefined): string {
  if (!spin || !isEli5Spin(spin)) return ''
  return `
> **Reader: a five-year-old (required).** This page is a short picture story,
> not an explainer. Read "Format: picture story" below before you write a word:
> it replaces the randomizer's usual format, and it overrides every rule in this
> brief that asks for more sections, more charts or more words on the page. The
> research is as careful as ever; it stays in the research file. A page an adult
> skims and a child cannot follow fails this brief even if every fact is right.
>
> The page is built from the research file's STORY INSIGHT, not its HERO INSIGHT:
> the hero insight is the most surprising verified fact and goes on the
> grown-ups card. The story insight is the one thing the child leaves knowing.
> Write the sentence a child would repeat to a parent; if you cannot, pick a
> different insight and record why. A finding about the sources (a catalog
> mismatch, a disputed date) is never the story insight.
`
}

function eli5Format(spin: BriefSpin): string {
  const { who, real, credit } = eli5Subject(spin)
  return `## Format: picture story for a five-year-old

Built like a good picture book: a child looks at each page, hears one or two
sentences, and gets it. Six beats at most, in this order. One beat is one
section (a scroll chapter, a slide, a page).

1. **Cover:** a question a child would ask, as the headline ("Why did the toy boat sink?"), and one big picture. No dek longer than eight words.
2. **The scene:** the everyday stand-in (toys, food, a playground, a bedtime, a garden), shown in one big picture. One or two sentences.
3. **The trick:** the story insight, what ${who} figured out, told in the scene. Name the real person or idea once, here.
4. **Why it helps:** what is different because of it, in the scene or in the child's own day. One or two sentences.
5. **Where the picture stops:** one sentence a child can follow on where the stand-in is not the real thing ("Real science is much bigger than a bath tub.").
6. **For grown-ups:** the one beat in adult words, set apart as a small card at the end: ${real} in two or three plain lines, the hero insight (the research finding) in one, the sources as links, and the credit. ${credit}

**Words.**
- At most 20 words per beat in beats 1 to 5, and about 100 words of story in all.
- Short words a five-year-old knows. Short sentences. No year, no percentage, no number bigger than ten, no name except the one in beat 3.
- Talk to the child: "you", "imagine", "look". Concrete things they can touch, never abstractions ("ideas", "methods", "influence").
- No eyebrows or kickers ("THE ARGUMENT", "01 /"), no source line under each beat, no caveats in beats 1 to 5. Accuracy lives in the scene being true to the record, and in beat 6.

**Pictures.**
- Every beat in 1 to 5 is mostly picture: one big drawn illustration (inline SVG or CSS shapes: flat, round, friendly, bright, thick outlines), the words large beside or under it. The picture carries the idea; a child who cannot read follows the story from the pictures alone.
- Draw the same stand-in, in the same colours, through every beat, so the pictures read as one story.
- At most one chart, and only a picture count (five boats, three sink) a child can count. No axes, no timelines, no maps, no pageview or ranking charts.
- A real portrait or document image, if you use one, goes in beat 3 or beat 6, small.

**Not on this page** (they stay in the research file; this format overrides any deck, chart-count, photo or search rule elsewhere in the brief): the timeline, the map, the ranking comparison, the counter-case, the method and the claims log.`
}

/** Research is done and nothing public waits on a human any more. */
function insightReady(spin: BriefSpin): boolean {
  if (!spin.heroInsight) return false
  return spin.status === 'approved' || spin.status === 'published' || !RANDOMIZER_META[spin.randomizer].gated
}

function deskAssignment(s: DeskSubject): string[] {
  const out = [
    `- Industry: ${s.industry.name}`,
    `- Sub-industry: ${s.sub.name} (heat ${s.sub.heat})${s.sub.region ? `. Region: ${s.sub.region}.` : ''}${
      s.sub.emerging ? ' Emerging segment: define it and size it before the Why Now.' : ''
    }`,
    `- Lens: ${s.lens.name}. ${s.lens.description}`,
    `- Freshness: ${s.freshness.name} (${s.freshness.window})`,
    '',
    '### Do this first',
    '',
    `1. Why Now. Find the three most recent developments for ${s.sub.name}${
      s.freshness.days === null ? '' : ` inside the ${s.freshness.window}`
    }, each dated and sourced.`,
    `2. Apply the ${s.lens.name} lens to the newest development, not to a general description of the segment.`,
    '3. If nothing happened in that window, move to the next one (Breaking, then Developing, then Evergreen) and say so at the top of the research file.',
  ]
  if (s.refreshFailed) {
    out.push('4. The last heat refresh failed, so this spin is Evergreen. Say so at the top of the research file.')
  } else if (s.heatStale) {
    out.push(
      '4. The heat score is stale. Your Why Now search is the refresh: if you cannot browse or cannot confirm the segment is current, treat this as Evergreen and say so.',
    )
  }
  const headlines = s.sub.top_headlines.slice(0, 3)
  if (headlines.length) {
    out.push('', 'Last known headlines (check they are still the newest):')
    for (const h of headlines) out.push(`- ${h.date}: [${h.title}](${h.url})`)
  }
  const note = s.sub.seed_note
  if (note) {
    out.push(
      '',
      `Seed note from ${note.researched} research (${note.confidence} confidence, verify against the primary source before using it): ${note.text}`,
    )
  }
  out.push(
    '',
    `Chart these if primary data exists (8 or more points): ${s.sub.key_metrics.join(', ')}.`,
    `Start from: ${s.sub.primary_sources.join(', ')}.`,
  )
  return out
}

function atlasAssignment(s: AtlasSubject): string[] {
  const subject = s.pair ? `the relationship between ${s.country.name} and ${s.pair.name}` : s.country.name
  const out = [
    `- Country: ${s.country.name} (${s.country.subregion})${s.country.extra ? `. On the extras list: ${s.country.status}.` : ''}`,
  ]
  if (s.pair) out.push(`- Pair: ${s.pair.name} (${s.pair.subregion}). The story is the relationship: a trade corridor, a shared border, a colonial link or a migration channel.`)
  out.push(
    `- Cultural thread: ${s.thread}`,
    `- Time depth: ${s.time.name} (${s.time.description})`,
    `- Geography frame: ${s.frame.name}. ${s.frame.description}`,
    `- Lens: ${s.lens.name}. ${s.lens.description}`,
    '',
    '### Do this first',
    '',
    `1. Anchor ${s.thread.toLowerCase()} in ${subject} to 4 to 8 named places, in story order, using the ${s.frame.name} frame. A story pitched at the level of a continent is a failed spin.`,
    '2. For each place: what is physically there today, and what happened there that matters to the thread.',
    `3. Find one insider voice: a primary or scholarly source from within ${s.country.name} or the community, not only outside commentary.`,
    '4. Give every place a status: Documented, Contested or Inferred.',
    '',
    'Numbers from: national census and statistics offices, the UN (UN DESA population and migrant stock), the World Bank.',
  )
  return out
}

function epicsAssignment(s: EpicsSubject): string[] {
  const out = [
    `- Epic: ${s.epic.title} (${s.epic.tradition}; ${s.epic.types.join(', ')}; ${s.epic.language}, ${s.epic.approx_date_of_composition})`,
    `- Episode: ${s.episode.name}`,
    `- Place: ${s.place.name}, ${s.place.modern}${s.place.text_ref ? ` (${s.place.text_ref})` : ''}`,
    `- Starting status: ${s.place.status}. Verify it.`,
    `- Lens: ${s.lens.name}. ${s.lens.description}`,
    `- The epic overall: mostly ${s.epic.geography_status.dominant}. ${s.epic.geography_status.note} Say so up front, because it frames the whole story honestly.`,
  ]
  if (s.sequence) out.push('- Sequence mode: this continues the route from the previous episode. Link back to it.')
  out.push(
    '',
    '### Do this first',
    '',
    `1. Read ${s.episode.name} in a standard translation. Cite the edition and the line or verse numbers.`,
    '2. List every place the episode names, in order, with text references.',
    `3. For ${s.place.name}: ancient name, modern name, country, coordinates, status. Who first proposed the identification, when, on what evidence, and who disputes it.`,
    '4. Check the present: what stands there, who visits, any heritage, tourism or political investment.',
    '5. Report what the text says and what scholarship and communities say, separately.',
  )
  if (s.epic.types.includes('Philosophical and spiritual')) {
    out.push('6. Required here: explain why this place appears at this point in the text, citing scholarship.')
  }
  if (s.epic.best_editions_and_translations.length) {
    out.push('', `Editions and translations to start from: ${s.epic.best_editions_and_translations.join('; ')}.`)
  }
  if (s.epic.key_scholarly_sources.length) out.push(`Scholarship: ${s.epic.key_scholarly_sources.join('; ')}.`)
  return out
}

function footshortsAssignment(s: FootshortsSubject): string[] {
  const subject = s.opponent ? `${s.team.name} and ${s.opponent.name}` : s.team.name
  const window = s.freshness.days === null ? '' : ` inside the ${s.freshness.window}`
  const out = [
    `- Tournament: ${s.competition.name} (${s.competition.country}; news heat ${s.competition.heat})`,
    `- Team: ${s.team.name}${s.team.country ? ` (${s.team.country})` : ''}. News heat ${s.team.heat}: ${s.team.articles} ${s.team.articles === 1 ? 'story' : 'stories'} tagged on footshorts in the ${s.newsWindowDays} days to ${s.newsAsOf.slice(0, 10)}.`,
  ]
  if (s.opponent) {
    out.push(`- Head-to-head: ${s.opponent.name}${s.opponent.country ? ` (${s.opponent.country})` : ''}. The story is the matchup: what separates them, and what happens when they meet.`)
  }
  out.push(
    `- Angle: ${s.angle.name}. ${s.angle.description}`,
    `- Freshness: ${s.freshness.name} (${s.freshness.window})`,
    '',
    '### Do this first',
    '',
    `1. Why Now. Find the three most recent developments for ${subject}${window}, each dated and sourced. Start from the footshorts headlines below, then the clubs' and the competition's own channels.`,
    `2. Apply the ${s.angle.name} angle to the newest development, not to a general description of the club.`,
    '3. If nothing happened in that window, move to the next one (Matchday, then Running story, then Evergreen) and say so at the top of the research file.',
    '4. Read the match context at the end of this brief before anything else: it is the match record (scores, timelines, stats, the table, the next fixtures) the page is built on.',
  )
  const headlines = [...s.team.headlines, ...(s.opponent?.headlines ?? [])].slice(0, 5)
  if (headlines.length) {
    out.push('', 'Latest tagged headlines on footshorts (check they are still the newest):')
    for (const h of headlines) out.push(`- ${h.date}: [${h.title}](${h.url}) (${h.publisher})`)
  }
  const fixtures = new Map(
    [...s.team.recent, ...s.team.upcoming, ...(s.opponent ? [...s.opponent.recent, ...s.opponent.upcoming] : [])].map((f) => [f.id, f]),
  )
  const attached = s.fixtureIds.map((id) => fixtures.get(id)).filter((f): f is FootshortsFixtureRef => !!f)
  if (attached.length) {
    out.push('', 'Fixtures in the match context:')
    for (const f of attached) out.push(`- ${fixtureSummary(f)}`)
  }
  out.push(
    '',
    `Chart these if the data exists (8 or more points): ${footshortsAngleMetrics(s.angle.name).join(', ')}.`,
    'Start from: the match context (Opta via theanalyst.com, football-data.org), the clubs and the competition, club accounts for money.',
  )
  return out
}

function viznbaAssignment(s: ViznbaSubject): string[] {
  const subject = s.opponent ? `the ${s.team.name} and the ${s.opponent.name}` : `the ${s.team.name}`
  const window = s.freshness.days === null ? '' : ` inside the ${s.freshness.window}`
  const out = [
    `- Conference: ${s.conference.name} (news heat ${s.conference.heat})`,
    `- Team: ${s.team.name} (${s.team.division} division). News heat ${s.team.heat}: ${s.team.articles} ${s.team.articles === 1 ? 'story' : 'stories'} tagged on VizNBA in the ${s.newsWindowDays} days to ${s.newsAsOf.slice(0, 10)}.`,
  ]
  if (s.team.people.length) {
    out.push(`- In the news: ${s.team.people.map((p) => `${p.name} (${p.articles})`).join(', ')}.`)
  }
  if (s.opponent) {
    out.push(`- Head-to-head: ${s.opponent.name} (${s.opponent.division} division). The story is the matchup: what separates them, and what happens when they meet.`)
  }
  out.push(
    `- Angle: ${s.angle.name}. ${s.angle.description}`,
    `- Freshness: ${s.freshness.name} (${s.freshness.window})`,
    '',
    '### Do this first',
    '',
    `1. Why Now. Find the three most recent developments for ${subject}${window}, each dated and sourced. Start from the VizNBA headlines below, then the team's and the league's own channels.`,
    `2. Apply the ${s.angle.name} angle to the newest development, not to a general description of the franchise.`,
    '3. If nothing happened in that window, move to the next one (Last night, then This week, then Evergreen) and say so at the top of the research file.',
    '4. Read the box scores at the end of this brief before anything else: they are the game record (scores, quarters, team stats, leaders) the page is built on.',
  )
  const headlines = [...s.team.headlines, ...(s.opponent?.headlines ?? [])].slice(0, 5)
  if (headlines.length) {
    out.push('', 'Latest tagged headlines on VizNBA (check they are still the newest):')
    for (const h of headlines) out.push(`- ${h.date}: [${h.title}](${h.url}) (${h.publisher})`)
  }
  const games = new Map(
    [...s.team.recent, ...s.team.upcoming, ...(s.opponent ? [...s.opponent.recent, ...s.opponent.upcoming] : [])].map((g) => [g.id, g]),
  )
  const attached = s.gameIds.map((id) => games.get(id)).filter((g): g is ViznbaGameRef => !!g)
  if (attached.length) {
    out.push('', 'Games in the box scores:')
    for (const g of attached) out.push(`- ${gameSummary(g)}`)
  }
  out.push(
    '',
    `Chart these if the data exists (8 or more points): ${viznbaAngleMetrics(s.angle.name).join(', ')}.`,
    'Start from: the box scores (ESPN), NBA.com stats and standings, the team and the league, and team announcements for money.',
  )
  return out
}

function ocwAssignment(s: OcwSubject): string[] {
  const course = ocwCourseLabel(s.course)
  const who = s.course.instructors.length ? `, ${s.course.instructors.join(', ')}` : ''
  const out = [
    `- Field: ${s.field.name} › Topic: ${s.topic.name}`,
    `- Course: ${course}${who}. ${s.course.url}`,
    `- Resource: ${s.file.title} (${s.kind.name}, ${s.file.contentType}). ${s.file.url}`,
    `- Lens: ${s.lens.name}. ${s.lens.description}`,
    '',
    '### Do this first',
    '',
    '1. Read the resource at its OCW URL end to end: the PDF, or the video and the transcript on its page. It is the only source for what the page explains.',
    '2. Read the course page (syllabus and calendar) for where this resource sits in the course and what came before it.',
    `3. Apply the ${s.lens.name} lens to the resource itself, not to the course or to ${s.topic.name} in general.`,
    `4. ${ocwCreditLine(s)} Non-commercial applies: no sponsored placement on the page.`,
  ]
  if (s.sequence) out.push('5. This spin continues the previous one in the same course: link back to that story and do not re-explain what it covered.')
  if (s.siblings.length) {
    out.push('', `Other ${s.kind.name.toLowerCase()} files in the course (context, not to cover):`)
    for (const f of s.siblings.slice(0, 12)) out.push(`- [${f.title}](${f.url})`)
    if (s.siblings.length > 12) out.push(`- and ${s.siblings.length - 12} more on the course page`)
  }
  out.push(
    '',
    `Chart these if the data exists (8 or more points): ${ocwLensMetrics(s.lens.name).join(', ')}.`,
    'Start from: the resource, the course page and its other files, the textbook or paper the resource cites, and a public dataset for any chart.',
  )
  return out
}

/** The automatic work-picker rule: the award's own documents beat any fallback title. */
export const LANDMARK_SWITCH_RULE =
  'If the award documents cite works and the selected title is not among them, switch to the cited work they emphasise most, and record why in the research file. Do not spend research effort proving a fallback title that none of them mention.'

function landmarkAssignment(s: LandmarkSubject): string[] {
  const a = s.award
  const w = s.work
  const focus = landmarkFocus(s)
  const account = a.links.background
    ? `the scientific background document (${a.links.background})${a.links.lecture ? ` and the prize lecture (${a.links.lecture})` : ''}`
    : `the citation on the ${s.prize.awarder} list (${s.prize.url}) and the awarder's announcement for ${a.year}`
  const workLine = (r: NonNullable<typeof w>) =>
    `${r.title}${r.year ? ` (${r.year}${r.venue ? `, ${r.venue}` : ''})` : r.venue ? ` (${r.venue})` : ''}. ${r.url}${r.doi ? ` (DOI ${r.doi})` : ''}. ${r.oaUrl ? `Free to read: ${r.oaUrl} (${r.oaStatus ?? 'open'}).` : 'No free copy on record.'}`
  const out = [
    `- Field: ${s.field.name} › Prize: ${s.prize.name} (${s.prize.awarder}; ${LANDMARK_WORK_LEVEL_LABEL[s.prize.works]}). ${s.prize.note}`,
    `- Award: ${a.name}, ${landmarkAwardLabel(s.prize, a.year)}${a.share ? `, share ${a.share}` : ''}${a.coLaureates.length ? `, with ${a.coLaureates.join(', ')}` : ''}. ${a.url}`,
    a.motivation ? `- Motivation, verbatim: "${a.motivation}"` : `- Motivation: none on record here. Quote the citation from the official list verbatim (${s.prize.url}), or the awarder's announcement where the list carries none.`,
  ]
  if (focus === 'work') {
    out.push(`- Focus: the work. The award's own record names it, so the page explains this work.`, `- Work: ${workLine(w!)}`, `- ${landmarkWorkBasisLabel(s)}`)
  } else {
    out.push(
      `- Focus: the contribution. ${s.prize.works === 'body' ? `The ${s.prize.name} rewards a body of work` : s.prize.works === 'result' ? `The ${s.prize.name} rewards a result` : `This award's record names no title`}, so the page explains what the citation rewards. The titles below are lead readings: evidence for the contribution, never "the winning work", and none needs to be shown to have won.`,
    )
    const readings = landmarkReadings(s)
    if (readings.length) {
      out.push('- Lead readings (swap any for a work the awarder\'s own documents cite):')
      for (const r of readings) out.push(`  - ${workLine(r)}`)
    } else {
      out.push(`- Lead readings: none resolved. Take them from ${account}.`)
    }
  }
  out.push(`- Lens: ${s.lens.name}. ${landmarkLensDescription(s)}`)
  const links = [
    a.links.summary ? `prize summary ${a.links.summary}` : null,
    a.links.background ? `scientific background ${a.links.background}` : null,
    a.links.lecture ? `prize lecture ${a.links.lecture}` : null,
    a.links.wikipedia ? `Wikipedia ${a.links.wikipedia}` : null,
  ].filter(Boolean)
  if (links.length) out.push(`- Links: ${links.join('; ')}.`)
  out.push('', '### Do this first', '')
  if (focus === 'work') {
    out.push(
      '1. Read the work end to end (the free copy linked above, or the DOI). It is the only source for what the page says the work says: cite it by page, figure, theorem or chapter.',
      `2. Read the award's own account, ${account}: what the committee rewarded, in its words, and the references it cites.`,
    )
  } else {
    out.push(
      `1. Read the award's own account, ${account}: what it says it rewards, in its words, and any works it names or cites. That is the subject of the page.`,
      `2. Read the lead readings for the parts that show the contribution, and cite them by page, figure, theorem or chapter. ${LANDMARK_SWITCH_RULE} A reading's place is earned by showing the contribution, not by having won.`,
    )
  }
  let n = 3
  out.push(`${n++}. Apply the ${s.lens.name} lens to ${landmarkFocusNoun(focus)}, not to ${a.name}'s life in general or to ${s.field.name.toLowerCase()} as a whole.`)
  out.push(`${n++}. ${landmarkCreditLine(s)} Never alter the quoted words.`)
  if (s.sequence) out.push(`${n++}. This spin follows the previous one: the same prize, the year before. Link back to that story and do not re-explain the prize.`)
  const rest = focus === 'work' ? s.related : s.related.filter((r) => !landmarkReadings(s).includes(r))
  if (rest.length) {
    out.push('', focus === 'work' ? 'Other works the loader found (context, and the candidates for a switch):' : 'More of the laureate\'s works the loader found (context):')
    for (const r of rest.slice(0, 8)) out.push(`- [${r.title}](${r.url})${r.year ? ` (${r.year})` : ''}, ${r.basis === 'citation' ? 'named by the award' : r.basis === 'notable' ? 'a notable work' : r.basis === 'book' ? 'a book from around the prize year' : 'top-cited'}${r.oaUrl ? ', free to read' : ''}`)
  }
  const others = s.pool.laureates.filter((name) => name !== a.name).slice(0, 12)
  if (others.length) out.push('', `Other ${s.prize.name} laureates of ${s.era.name} the pool read (context, not to cover, and not a complete roster): ${others.join(', ')}${s.pool.laureates.length > 13 ? ` and ${s.pool.laureates.length - 13} more` : ''}.`)
  if (w?.countsByYear.length) {
    out.push('', `Citations by year of ${w.title} (OpenAlex, read ${s.pool.asOf.slice(0, 10)}): ${w.countsByYear.map((c) => `${c.year}: ${c.citations}`).join(', ')}. Cited ${w.citedBy?.toLocaleString('en-US') ?? '?'} times in all${w.fwci !== null ? `, FWCI ${w.fwci}` : ''}${w.topOnePercent ? ', top 1% of its field and year' : ''}.`)
  }
  if (s.pool.sources.notes.length) out.push('', `Loader notes: ${s.pool.sources.notes.join(' ')}`)
  out.push(
    '',
    `Chart these if the data exists (8 or more points; drop a chart rather than pad it): ${landmarkLensMetrics(s.lens.name, focus).join(', ')}.`,
    `Start from: ${focus === 'work' ? 'the work' : 'the citation and the lead readings'}, the award's own account (the background document, the lecture or the citation), OpenAlex for the citation record, and a public dataset for anything about the world.`,
  )
  return out
}

function hundredAssignment(s: HundredSubject): string[] {
  const p = s.person
  const pr = s.profile
  const event = (label: string, e: NonNullable<HundredSubject['profile']>['born']) =>
    e ? `${label} ${[e.date, e.place].filter(Boolean).join(', ')}${e.lat !== null && e.lon !== null ? ` (${e.lat.toFixed(3)}, ${e.lon.toFixed(3)})` : ''}` : null
  const life = pr ? [event('born', pr.born), event('died', pr.died)].filter(Boolean).join('; ') : ''
  const near = (n: HundredSubject['neighbours']['above'], where: string) => (n ? `#${n.rank} ${n.name} ${where}` : null)
  const out = [
    `- Person: ${p.name}${p.hart_name !== p.name ? ` (Hart: "${p.hart_name}")` : ''}, ${hundredLife(p)}. ${hundredRankLabel(s)}.`,
    `- Ranked for: ${s.domain.name}. Era: ${s.era.name}. Based in: ${p.region}.`,
    `- Neighbours in the ranking: ${[near(s.neighbours.above, 'above'), near(s.neighbours.below, 'below')].filter(Boolean).join(', ')}.`,
    `- Lens: ${s.lens.name}. ${s.lens.description}`,
    `- Record: Wikidata ${pr?.wikidataUrl ?? `https://www.wikidata.org/wiki/${p.wikidata}`}${pr?.description ? ` ("${pr.description}")` : ''}; Wikipedia ${pr?.wikipediaUrl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(p.wiki.replace(/ /g, '_'))}`}.`,
  ]
  if (life) out.push(`- Life on Wikidata: ${life}.${(p.born ?? p.died ?? Infinity) < 1000 ? ' Dates this old are traditional or estimated: say so on the page.' : ''}`)
  if (p.note) out.push(`- Up front: ${p.note}`)
  out.push(
    '',
    `About the book: ${s.book.note}`,
    '',
    '### Do this first',
    '',
    `1. Read ${s.book.author}'s chapter on ${p.hart_name} (#${p.rank}) if you can reach the book: it is the argument the page tests. It is copyrighted: paraphrase it, quote a phrase at most, and cite the page. If you cannot reach it, say so in the research file and test the rank against the record alone.`,
    `2. Build the life from primary and scholarly sources (the person's own writings, contemporary documents, a standard scholarly biography), not from Wikipedia: use it only to find them.`,
    `3. Apply the ${s.lens.name} lens to ${p.name} and the rank, not to ${s.domain.name.toLowerCase()} in general.`,
    `4. ${hundredCreditLine(s)}`,
  )
  let n = 5
  if (s.sequence) out.push(`${n++}. This spin walks the ranking: the previous spin covered #${p.rank === 1 ? 100 : p.rank - 1}. Link back to that story and compare the two ranks.`)
  if (p.flags.includes('no-portrait')) out.push(`${n++}. No portrait, figure or likeness of ${p.name} anywhere on the page, the share card included.`)
  else if (pr?.image) out.push(`${n++}. A portrait is on Wikimedia Commons (${pr.imagePage}): hotlink it only under the licence on its file page, credited, or draw none.`)
  if (pr?.pageviews.length) {
    out.push(
      '',
      `English Wikipedia views by month (Wikimedia pageviews, user agents, read ${pr.asOf.slice(0, 10)}; check the newest month is complete before charting it): ${pr.pageviews.map((v) => `${v.month}: ${v.views.toLocaleString('en-US')}`).join(', ')}.${pr.sitelinks ? ` Wikipedia editions with an article: ${pr.sitelinks}.` : ''}`,
    )
  }
  if (pr && (pr.sources.errors.length || pr.sources.notes.length)) out.push('', `Profile notes: ${[...pr.sources.notes, ...pr.sources.errors.map((e) => `${e}: look it up by hand.`)].join(' ')}`)
  if (!pr) out.push('', 'No live profile on this spin: look the life up on Wikidata and Wikipedia yourself.')
  out.push(
    '',
    `Chart these if the data exists (8 or more points): ${hundredLensMetrics(s.lens.name).join(', ')}.`,
    'Start from: the person\'s own writings or works, contemporary documents, a scholarly biography, Wikidata for dates and places, and a public dataset for any number about the world.',
  )
  return out
}

function evidenceAssignment(s: EvidenceSubject): string[] {
  const st = s.study
  const r = s.record
  const out = [
    `- Study: ${evidenceStudyLabel(s)}. ${st.citation}`,
    `- Link: ${st.url ?? 'none in the collection: find the paper on the publisher\'s site'}${st.access === 'open' ? ' (open access)' : st.access === 'free-copy' ? ' (a free author or working-paper copy is commonly available)' : ''}${r?.oaUrl && r.oaUrl !== st.url ? `. Free to read: ${r.oaUrl}` : ''}.`,
    `- Theme: ${s.theme.name}${st.section_name ? ` (${st.section_name})` : ''}. The collection rates this theme's evidence "${s.theme.strength}" and reads it as: ${s.theme.bottom_line}`,
    `- Design: ${s.design.name}. It can show ${s.design.can_show}.${st.type_sample ? ` Type and sample: ${st.type_sample}` : ''}`,
    `- The collection's summary (to check against the paper, never to cite): ${st.findings}`,
    `- Lens: ${s.lens.name}. ${s.lens.description}`,
  ]
  if (st.note) out.push(`- Up front: ${st.note}`)
  if (s.findings.length) out.push(`- The collection's conclusions that rest on it: ${s.findings.map((f) => `"${f}"`).join(' ')}`)
  if (r && (r.citedBy !== null || r.fwci !== null)) {
    out.push(
      `- Citation record (OpenAlex ${r.openalexUrl ?? ''}, read ${r.asOf.slice(0, 10)}): ${r.citedBy ?? 'n/a'} citations${r.fwci !== null ? `, field-weighted impact ${r.fwci} (1 is the field average)` : ''}${r.topOnePercent ? ', in the top 1% of its field' : ''}${r.retracted ? '. RETRACTED' : ''}.`,
    )
  }
  if (s.related.length) {
    out.push('', 'In conversation with (the collection links these to it; read the ones your lens needs):', '')
    for (const x of s.related) out.push(`- #${x.n} ${x.label}: ${x.title}${x.url ? ` (${x.url})` : ''}. ${x.findings}`)
  }
  out.push(
    '',
    `About the collection: ${s.collection.summary}`,
    '',
    '### Do this first',
    '',
    `1. Read the paper itself: the abstract, the methods and the main results table. ${st.url ? `Start at ${st.url}.` : ''} If you cannot reach the full text, say so in the research file and use only what the abstract and the publisher's page state.`,
    '2. Put every number the collection gives for it in the claims log and check each against the paper (page, table or figure). Where they differ, the paper wins and the research file says so.',
    `3. Apply the ${s.lens.name} lens to ${st.label}, not to ${s.theme.name.toLowerCase()} in general.`,
    `4. ${evidenceCreditLine(s)}`,
  )
  let n = 5
  if (s.from !== null) out.push(`${n++}. This spin follows the debate from #${s.from} in the collection, the previous spin's study. Link back to that story and say how the two studies answer each other.`)
  if (st.flags.includes('suicide')) out.push(`${n++}. The study concerns suicide or self-harm: follow safe-messaging guidance (no method detail, no single-cause or "epidemic" framing) and end the page with a crisis line such as 988 (US) or findahelpline.com.`)
  if (r?.countsByYear.length) {
    out.push('', `Citations by year (OpenAlex, read ${r.asOf.slice(0, 10)}; the newest year is partial): ${r.countsByYear.map((c) => `${c.year}: ${c.citations}`).join(', ')}.`)
  }
  if (r && (r.sources.errors.length || r.sources.notes.length)) out.push('', `Record notes: ${[...r.sources.notes, ...r.sources.errors.map((e) => `${e}: look it up by hand.`)].join(' ')}`)
  if (!r) out.push('', 'No live citation record on this spin: look the paper up on OpenAlex or the publisher\'s page yourself.')
  out.push(
    '',
    `Chart these if the data exists (8 or more points): ${evidenceLensMetrics(s.lens.name).join(', ')}.`,
    'Start from: the paper itself, its preregistration and data if they are public, the studies the collection links to it, and a public dataset (a national survey, a platform transparency report) for any number about the world.',
  )
  return out
}

function frontierAssignment(s: FrontierSubject): string[] {
  const p = s.paper
  const r = s.record
  const head = frontierHeadline(p)
  const kind = p.kind ? FRONTIER.kinds[p.kind] ?? p.kind : null
  const out = [
    `- Paper: ${frontierPaperLabel(p)}. Submitted to arXiv ${p.publishedAt.slice(0, 10)} (${s.window.name.toLowerCase()} when spun).`,
    `- Link: ${frontierAbsUrl(p.arxivId)} (PDF: https://arxiv.org/pdf/${p.arxivId}).${r?.version && r.version > 1 ? ` Now at v${r.version}${r.updated ? `, updated ${r.updated.slice(0, 10)}` : ''}: read the latest version.` : ''}`,
    `- Authors: ${p.authors ?? 'n/a'}.${p.affiliations ? ` Affiliations: ${p.affiliations}.` : ''}${kind ? ` (${kind}.)` : ''}`,
    `- Area: ${s.area.name}. ${s.area.description}${p.category ? ` Primary arXiv category: ${p.category}.` : ''}`,
    `- Why AI Daily kept it (the gate's line, to check): ${p.why ?? 'n/a'}`,
    `- Headline as the gate read it (to check against the paper): ${head ?? 'none found in the abstract'}.${p.scale ? ` Scale: ${p.scale}.` : ''}${p.computeBucket !== null ? ` Compute: ${FRONTIER.compute_buckets[p.computeBucket] ?? p.computeBucket}.` : ''}`,
    `- Released (as the gate read it): weights ${p.weightsReleased ? 'yes' : 'no'}, code ${p.codeReleased ? 'yes' : 'no'}.`,
    `- Lens: ${s.lens.name}. ${s.lens.description}`,
  ]
  if (p.tags.length) out.push(`- Tags: ${p.tags.join(', ')}.`)
  if (p.editions.length) out.push(`- In ${s.source.series}: featured on ${p.editions.map((d) => `${d} (${s.source.edition_url}${d})`).join(', ')}. Link the edition from the page.`)
  if (r?.journalRef || r?.doi) out.push(`- Published since (arXiv's record): ${[r.journalRef, r.doi ? `doi:${r.doi}` : null].filter(Boolean).join(', ')}. Cite the published version for anything that changed.`)
  if (r?.comment) out.push(`- The authors' comment on arXiv: "${r.comment}"`)
  if (r && r.citedBy !== null) out.push(`- Citations (OpenAlex ${r.openalexUrl ?? ''}, read ${r.asOf.slice(0, 10)}): ${r.citedBy}. A new preprint has few; say so rather than reading much into it.`)
  if (s.related.length) {
    out.push('', `Beside it in ${s.source.name}'s pool (shared tags or benchmark; read the ones your lens needs):`, '')
    for (const x of s.related) {
      const h = frontierHeadline(x)
      out.push(`- ${x.arxivId} (${x.publishedAt.slice(0, 10)}): ${x.title}. ${frontierAbsUrl(x.arxivId)}${h ? `. Headline: ${h}` : ''}${x.why ? `. ${x.why}` : ''}`)
    }
  }
  out.push(
    '',
    `About the source: ${s.source.note}`,
    '',
    '### Do this first',
    '',
    `1. Read the paper itself: the abstract, the method and the main results table, at ${frontierAbsUrl(p.arxivId)}. If you cannot reach the full text, say so in the research file and use only what the abstract states.`,
    '2. Put every number the gate gives (headline, baseline, compute, scale) in the claims log and check each against the paper\'s table or figure. Where they differ, the paper wins and the research file says so.',
    `3. Apply the ${s.lens.name} lens to this paper, not to ${s.area.name.toLowerCase()} in general.`,
    `4. ${frontierCreditLine(s)}`,
  )
  let n = 5
  if (s.from) out.push(`${n++}. This spin follows the thread from ${s.from}, the previous spin's paper. Link back to that story and say how the two papers relate.`)
  if (s.window.id === 'week') out.push(`${n++}. The paper is days old: nobody has replicated it. Say what result or release would confirm or sink it, and do not report the claim as settled.`)
  if (r && (r.sources.errors.length || r.sources.notes.length)) out.push('', `Record notes: ${[...r.sources.notes, ...r.sources.errors.map((e) => `${e}: look it up by hand.`)].join(' ')}`)
  if (!r) out.push('', 'No live record on this spin: check arXiv for the latest version and a journal reference yourself.')
  out.push(
    '',
    `Chart these if the data exists (8 or more points): ${frontierLensMetrics(s.lens.name).join(', ')}.`,
    'Start from: the paper and its appendix, its code or model card if released, the benchmark\'s own leaderboard or paper, the papers it cites as baselines, and a public dataset (Epoch AI, the IEA, company filings) for any number about compute, energy or money.',
  )
  return out
}

function curiousAssignment(s: CuriousSubject): string[] {
  const c = s.claim
  const r = s.record
  const notes = curiousGradeNotes(c)
  const archive = r?.archiveUrl ?? c.document.archiveUrl
  const out = [
    `- Claim: ${c.text}`,
    `- Kind: ${c.kind}.${c.subject ? ` Subject: ${c.subject}.` : ''} Era: ${s.era.name}${c.yearFrom != null ? ` (${c.yearFrom}${c.yearTo != null && c.yearTo !== c.yearFrom ? ` to ${c.yearTo}` : ''})` : ' (no year on the claim)'}. Theme: ${s.theme.name}.${s.region ? ` Region: ${s.region.name}.` : ''}${c.place ? ` Place: ${c.place}.` : ''}`,
    `- ${curiousGradeLabel(c)}: ${s.grade.label}. ${s.grade.rule} The grade is computed from explicit features of the sources found so far (${c.nSources} source${c.nSources === 1 ? '' : 's'} in ${c.nGroups} independent lineage${c.nGroups === 1 ? '' : 's'}${c.nPrimary ? `, ${c.nPrimary} primary` : ''}${c.nDerived ? `, ${c.nDerived} derived retelling${c.nDerived === 1 ? '' : 's'}` : ''}${c.score != null ? `; score ${Number(c.score).toFixed(2)}` : ''}). Print it on the page. If the research earns a different grade, print that and say why.`,
  ]
  if (notes.length) out.push(`- Why that grade (the grader's notes): ${notes.join('; ')}.`)
  out.push(
    `- Evidence (verbatim, the only quoted text from this document): "${c.evidenceQuote}"${c.evidencePage != null ? ` (p. ${c.evidencePage})` : ''}`,
    `- From: ${curiousDocumentLabel(c)}. ${c.document.canonicalUrl}${archive ? ` Archived: ${archive}` : ' (no archive snapshot yet)'}. Source: ${c.document.sourceId}.${c.document.language ? ` Language: ${c.document.language}.` : ''}`,
  )
  if (c.isHearsay || c.isAnonymous || c.speaker) out.push(`- Attribution: ${[c.isHearsay ? 'the passage hedges the claim' : null, c.isAnonymous ? 'it names no source' : null, c.speaker ? `it attributes the claim to ${c.speaker}` : null].filter(Boolean).join('; ')}. Keep the hedge on the page.`)
  if (c.flags.length) out.push(`- Flags: ${c.flags.join(', ')}.`)
  if (c.entities.length) out.push(`- Named in the claim: ${c.entities.join(', ')}.`)
  out.push(`- Lens: ${s.lens.name}. ${s.lens.description}`)
  if (r) {
    if (r.crossref) out.push(`- Cited work (Crossref, read ${r.asOf.slice(0, 10)}): "${r.crossref.title ?? r.crossref.doi}"${r.crossref.container ? `, ${r.crossref.container}` : ''}${r.crossref.year ? `, ${r.crossref.year}` : ''}${r.crossref.citedBy != null ? `, cited ${r.crossref.citedBy} times` : ''}. ${r.crossref.url}`)
    if (r.book) out.push(`- Cited book (Google Books): "${r.book.title ?? r.book.isbn}"${r.book.publisher ? `, ${r.book.publisher}` : ''}${r.book.year ? `, ${r.book.year}` : ''}${r.book.url ? `. ${r.book.url}` : ''}`)
    for (const w of r.wikidata) out.push(`- ${w.name} on Wikidata: ${w.qid}${w.description ? `, ${w.description}` : ''}${w.birthYear != null ? `, born ${w.birthYear}${w.deathYear != null ? `, died ${w.deathYear}` : ''}` : w.year != null ? `, dated ${w.year}` : ''}.`)
  }
  if (s.related.length) {
    out.push('', 'Beside it in the pool (claims sharing a name; read the ones your lens needs):', '')
    for (const x of s.related) out.push(`- ${curiousClaimLabel(x)} (${x.grade ? `grade ${x.grade}` : 'ungraded'}, ${x.nGroups} lineage${x.nGroups === 1 ? '' : 's'}; ${x.documentTitle ?? x.canonicalUrl})`)
  }
  out.push(
    '',
    `About the source: ${s.source.note}`,
    '',
    '### Do this first',
    '',
    `1. Read the evidence document itself at ${c.document.canonicalUrl}${archive ? ` (or its archive copy, ${archive})` : ''}: the quote in its context, the date, who wrote it and whom they cite. If you cannot reach it, say so in the research file and work from the archive copy or not at all.`,
    '2. Find a primary source: a contemporaneous document, an archive record, the original text, a dataset. The claim\'s grade turns on whether one exists.',
    '3. Count lineages, not articles. Every source you find goes in the Lineages table with the account it descends from; five articles from one wire story, book or interview are one source.',
    `4. Split the claim into its supported core and its embellishment, each with its own grade and claims log rows. ${c.grade === 'D' || c.grade === 'E' ? 'This claim is graded ' + c.grade + ': expect the embellishment to be most of it, and the page to report that it is repeated, not that it happened.' : 'Even a well-graded claim often carries a detail nobody checked.'}`,
    `5. Apply the ${s.lens.name} lens to this claim, not to ${s.theme.name.toLowerCase()} in general.`,
    `6. State the grade you would give after the research. The page prints the desk's ${curiousGradeLabel(c).toLowerCase()} and yours, and says why they differ if they do.`,
    `7. ${curiousCreditLine(s)}`,
  )
  let n = 8
  if (s.from) out.push(`${n++}. This spin pulls the thread from the previous spin's claim. Link back to that story and say how the two claims relate.`)
  if (c.flags.includes('contradiction')) out.push(`${n++}. Another approved claim contradicts this one. Both versions go on the page with their sources; the research says which the record favours, or that it cannot tell.`)
  if (r && (r.sources.errors.length || r.sources.notes.length)) out.push('', `Record notes: ${[...r.sources.notes, ...r.sources.errors.map((e) => `${e}: look it up by hand.`)].join(' ')}`)
  if (!r) out.push('', 'No live record on this spin: check Crossref, Google Books and Wikidata for the cited work and the entities yourself, and save an archive snapshot of the evidence document.')
  out.push(
    '',
    `Chart these if the data exists (8 or more points): ${curiousLensMetrics(s.lens.name).join(', ')}.`,
    'Start from: the evidence document, the primary sources you find, the cited work or book, the national libraries (Library of Congress, Europeana, Gallica, Trove) for contemporaneous reporting, Crossref and Google Books for scholarship, and a public dataset for any number the lens needs.',
  )
  return out
}

/** "## Your assignment": the spin, written as instructions. */
export function assignmentSection(spin: BriefSpin): string {
  const meta = RANDOMIZER_META[spin.randomizer]
  const s = spin.subject
  const body =
    s.randomizer === 'desk'
      ? deskAssignment(s)
      : s.randomizer === 'atlas'
        ? atlasAssignment(s)
        : s.randomizer === 'footshorts'
          ? footshortsAssignment(s)
          : s.randomizer === 'viznba'
            ? viznbaAssignment(s)
            : s.randomizer === 'ocw'
              ? ocwAssignment(s)
              : s.randomizer === 'landmark'
                ? landmarkAssignment(s)
                : s.randomizer === 'hundred'
                  ? hundredAssignment(s)
                  : s.randomizer === 'evidence'
                    ? evidenceAssignment(s)
                    : s.randomizer === 'frontier'
                      ? frontierAssignment(s)
                      : s.randomizer === 'curious'
                        ? curiousAssignment(s)
                        : epicsAssignment(s)
  const ready = insightReady(spin)
  const eli5 = isEli5Spin(spin)
  const lead = ready
    ? eli5
      ? [
          'The research for this spin is done. Its hero insight, the research finding, is approved and goes on the grown-ups card:',
          '',
          `> ${spin.heroInsight}`,
          '',
          'Build the story itself from the STORY INSIGHT and the STAND-IN TABLE in the research file at the end of this brief. If either is missing, write it there first. Everything on the page comes from the file. Skip to the deliverables.',
          '',
        ]
      : [
          'The research for this spin is done. Build from its hero insight, which is approved:',
          '',
          `> ${spin.heroInsight}`,
          '',
          'The research file is at the end of this brief. Everything on the page comes from it. Skip to the deliverables.',
          '',
        ]
    : []
  return [
    '## Your assignment',
    '',
    `Spin \`${spin.id}\` · ${spin.createdAt.slice(0, 10)} · seed ${spin.seed}`,
    `Randomizer: ${meta.name}. Format: ${meta.format}.`,
    '',
    ...lead,
    ...body,
  ].join('\n')
}

/** "## Research protocol": shared rules 0.2, 0.3 and 0.5. */
export function researchProtocolSection(spin: BriefSpin): string {
  const geoStatus =
    spin.randomizer === 'epics'
      ? '\n8. Give every place a status: Verified (archaeology or documentary evidence), Claimed (promoted by a community, state or tourism body without strong outside evidence), Symbolic (not meant as literal geography), or Lost (once identified, now unlocatable).'
      : spin.randomizer === 'atlas'
        ? '\n8. Give every place a status: Documented, Contested or Inferred.'
        : spin.randomizer === 'footshorts'
          ? '\n8. Transfer talk, injury timelines and dressing-room stories are Unverified until the club, the league or the player confirms them, or two independent outlets with named sourcing report them. A rumour never goes on the page as fact.'
          : spin.randomizer === 'viznba'
            ? '\n8. Trade talk, injury timelines and locker-room stories are Unverified until the team, the league or the player confirms them, or two independent outlets with named sourcing report them. A rumour never goes on the page as fact.'
            : spin.randomizer === 'ocw'
              ? '\n8. The resource is the primary source for what it says; quote it with its page or slide number. Anything about the world outside the resource (a number, a date, a history) follows the two-source rule like any other claim.'
              : spin.randomizer === 'landmark'
                ? '\n8. The work, or on a contribution spin each lead reading, is the primary source for what it says; cite it by page, figure, theorem or chapter. The official motivation or citation is quoted verbatim, never paraphrased inside quotation marks. Which paper or book the award rewarded is a claim like any other: Verified only when the citation, the background document or the awarder\'s list names it. On a contribution spin no title needs to have won: the page is about what the citation rewards, and a reading that the record does not tie to the award is called a lead reading, not logged as a failed claim. ' + LANDMARK_SWITCH_RULE
                : spin.randomizer === 'hundred'
                  ? '\n8. Hart\'s rank and his reasons are his opinion, not a fact: attribute them ("Hart argues"), and test them. Separate what contemporary sources document from what later tradition, legend or hagiography added, and label each. A religious claim is stated as what a tradition holds, never as fact or as falsehood.'
                  : spin.randomizer === 'evidence'
                    ? '\n8. The paper is the primary source for what it found; cite it by page, table or figure. The collection\'s summary is a lead, never a source. A causal word ("causes", "leads to", "makes") is Verified only for a randomized or natural experiment, and then only for its sample and period. Every effect size goes on the page with its unit and its sample, against a benchmark. A preprint or working paper is labelled as such wherever its finding appears.'
                    : spin.randomizer === 'frontier'
                      ? '\n8. The paper is the primary source for what it claims; cite it by table or figure, and the version you read. AI Daily\'s gate fields (area, headline, compute, scale, release) are leads, never sources. An arXiv preprint is labelled "preprint" wherever its result appears, and its claims are reported as claims ("the authors report") until an independent replication or a peer-reviewed version confirms them. A benchmark number goes on the page with its baseline and setting.'
                      : spin.randomizer === 'curious'
                        ? '\n8. Verify at the level of the claim, not the article. Split the anecdote into atomic claims and grade each. Two sources are independent only when neither descends from the other: a wire story and its reprints, a book and the articles that quote it, an interview and its retellings are one lineage and count once. The desk\'s grade is computed from the sources found so far; print it, and print your own if the research earns a different one, with the reason. A grade D or E claim is reported as repeated ("it is widely said that"), never as having happened. The evidence quote is the only verbatim text taken from a copyrighted source, and it stays under 300 characters.'
                        : ''
  const eli5Items = isEli5Spin(spin)
    ? `\n9. Because the reader is a five-year-old, add two more sections after HERO INSIGHT. \`STORY INSIGHT\`: the one thing the child should walk away knowing, in the format's own words; write the sentence a child would repeat to a parent, and if you cannot, pick a different insight. \`STAND-IN TABLE\`: one row per part of the stand-in, with columns Stand-in, Real thing, Claim row (for example: fibbing about hunger | private information | 5). A part of the stand-in with no claims log row does not go in the story. HERO INSIGHT is the research finding, for the research file and the grown-ups card; STORY INSIGHT is what the pages say.`
    : ''
  return `## Research protocol (forensic, lawyer grade)

1. Open the research file \`${researchFileName(spin)}\`. Start from the stub at the end of this brief.
2. Build the claims log first: one row per factual claim (claim, number or date, source URL, source type, confidence).
3. Two-source rule: any figure, date or causal claim needs two independent sources, or one primary source (a government statistic, a filing, a peer-reviewed paper, the original text).
4. Mark every claim Verified, Contested or Unverified. Unverified claims never go on the page or into the script.
5. Separate fact, interpretation and speculation in the write-up, and label each.
6. Record what you could not find. Gaps are part of the story.
7. End the file with a section called \`HERO INSIGHT\`: one sentence, the single most surprising and defensible finding, plus the three claims log rows that support it. It is the research finding: pick it for truth and surprise, not for how well it tells.${geoStatus}${eli5Items}

Sensitivity:
- Describe communities, religions and nations by what sources document, never by stereotype. Do not rank cultures.
- Label contested territory, contested history and religious claims as contested, and state the major positions fairly.
- Living people and ongoing conflicts: stick to the sourced record. No speculation.`
}

/** "## Deliverables": what to make, in what order, and where each goes. */
export function deliverablesSection(spin: BriefSpin, siteUrl: string): string {
  const site = siteUrl.replace(/\/$/, '')
  const gated = RANDOMIZER_META[spin.randomizer].gated
  const ready = insightReady(spin)
  const eli5 = isEli5Spin(spin)
  const gate = gated
    ? ready
      ? 'The hero insight is approved, so the page can go public.'
      : `A human approves the hero insight for ${RANDOMIZER_META[spin.randomizer].name} spins before anything goes public. Save the research file, then post the page as a draft; it can be published once the insight is approved in admin.`
    : `${RANDOMIZER_META[spin.randomizer].name} spins have no approval gate: once the hero insight is in the research file you can publish.`
  return `## Deliverables

Make them in this order. Nothing public is written before the hero insight.

A. **Research file** \`${researchFileName(spin)}\`: the claims log, gaps and the HERO INSIGHT section${eli5 ? ', plus the STORY INSIGHT and the STAND-IN TABLE' : ''}. Save it to the spin: the \`save_spin_research\` MCP tool with \`spinId: "${spin.id}"\`, or \`PUT ${site}/api/randomizer/spins/${spin.id}\` with JSON \`{ "research": "<markdown>" }\` and the publish token as a bearer. Otherwise hand it to the user with the page.
B. **One HTML story** built from the ${eli5 ? 'story insight and the stand-in table' : 'hero insight'}, in the format below.
C. **A reel script** (rules below), written from the ${eli5 ? 'story insight' : 'hero insight'} only.

${gate}`
}

function deskFormat(): string {
  return `## Format: editorial brief with charts

Structure it like a financial planner's report: skimmable, numbers first. These ten parts are required content, not a page order; the layout is yours.

1. **Headline** (one line, the claim) and **dek** (one line, why it matters now).
2. **Key numbers strip:** 3 to 4 headline stats, each with its period and source.
3. **Chart 1, the shape:** the main trend over time (line or bar).
4. **Chart 2, the split:** who holds the share, or where the exposure sits (bar, treemap or stacked bar).
5. **Chart 3, the stress point:** the metric that shows the risk or the change (annotated line, scatter or waterfall).
6. **What changed this week:** the Why Now items in three short lines.
7. **Lens read:** 150 words at most, applying the lens.
8. **Risks and counter-case.**
9. **What to watch next:** dated events or thresholds.
10. **Sources and claims log summary.**`
}

function footshortsFormat(s: FootshortsSubject): string {
  const subject = s.opponent ? `${s.team.name} and ${s.opponent.name}` : s.team.name
  return `## Format: football explainer with charts

Built like a good analysis piece: numbers first, skimmable, one argument. These parts are required content, not a page order; the layout is yours.

1. **Headline** (one line, the claim) and **dek** (one line, why it matters this week).
2. **Key numbers strip:** 3 to 4 headline stats for ${subject}, each with its period and source.
3. **Chart 1, the record:** results or the core metric over the recent matches (from the match context).
4. **Chart 2, the comparison:** ${s.opponent ? `${s.team.name} against ${s.opponent.name}` : `${s.team.name} against the rest of the ${s.competition.name}`} on the metric that matters for the angle.
5. **Chart 3, the turning point:** the match, minute or number where the story changes (annotated).
6. **What happened this week:** the Why Now items in three short lines.
7. **Angle read:** 150 words at most, applying the ${s.angle.name} angle.
8. **Counter-case:** the strongest argument against the thesis.
9. **What to watch next:** the next fixtures with dates, and the threshold that would prove the thesis wrong.
10. **Sources and claims log summary.**`
}

function viznbaFormat(s: ViznbaSubject): string {
  const subject = s.opponent ? `the ${s.team.name} and the ${s.opponent.name}` : `the ${s.team.name}`
  return `## Format: basketball explainer with charts

Built like a good analysis piece: numbers first, skimmable, one argument. These parts are required content, not a page order; the layout is yours.

1. **Headline** (one line, the claim) and **dek** (one line, why it matters this week).
2. **Key numbers strip:** 3 to 4 headline stats for ${subject}, each with its period and source.
3. **Chart 1, the record:** results or the core metric over the recent games (from the box scores).
4. **Chart 2, the comparison:** ${s.opponent ? `the ${s.team.name} against the ${s.opponent.name}` : `the ${s.team.name} against the rest of the ${s.conference.name}`} on the metric that matters for the angle.
5. **Chart 3, the turning point:** the game, quarter or number where the story changes (annotated).
6. **What happened this week:** the Why Now items in three short lines.
7. **Angle read:** 150 words at most, applying the ${s.angle.name} angle.
8. **Counter-case:** the strongest argument against the thesis.
9. **What to watch next:** the next games with dates, and the threshold that would prove the thesis wrong.
10. **Sources and claims log summary.**`
}

function ocwFormat(s: OcwSubject): string {
  return `## Format: study note with charts

Built like the best page of a study guide: one idea, explained so a reader who has not taken the course gets it, with the numbers that make it concrete. These parts are required content, not a page order; the layout is yours.

1. **Headline** (one line, the idea in plain words) and **dek** (one line, why a reader outside ${s.topic.name} should care).
2. **The resource:** what it is (${s.kind.name.toLowerCase()} from ${ocwCourseLabel(s.course)}), one line, linked.
3. **The one idea:** 150 words at most, from the resource, cited to its page or slide.
4. **Chart 1, the quantity:** the thing the resource is about, charted from real data (8 or more points), or the worked example's numbers.
5. **Chart 2, the comparison or the history:** the idea against its alternative, or how the number moved over time.
6. **Lens read:** 150 words at most, applying the ${s.lens.name} lens.
7. **Where it breaks:** the assumption the resource makes that does not always hold.
8. **Go further:** the course page and the resource's own references, linked.
9. **Credit:** ${ocwCreditLine(s)}
10. **Sources and claims log summary.**`
}

function landmarkFormat(s: LandmarkSubject): string {
  const a = s.award
  const focus = landmarkFocus(s)
  const awardPart = `2. **The award:** ${landmarkAwardLabel(s.prize, a.year)}, ${a.name}${a.coLaureates.length ? ` with ${a.coLaureates.join(', ')}` : ''}, and the ${a.motivation ? 'motivation' : 'citation'} quoted verbatim, linked to the laureate page.`
  if (focus === 'work') {
    return `## Format: landmark paper explainer with charts

Built like the best page of a journal club: one result, explained so a reader outside ${s.field.name.toLowerCase()} gets it, with the numbers that make it concrete and the award's own words beside it. These parts are required content, not a page order; the layout is yours.

1. **Headline** (one line, the result in plain words) and **dek** (one line, why a reader outside the field should care).
${awardPart}
3. **The work:** ${s.work!.title}${s.work!.year ? ` (${s.work!.year})` : ''}, linked (the free copy where there is one), labelled "named by the award".
4. **The one result:** 150 words at most, from the work, cited to its page, figure, theorem or chapter.
5. **Chart 1, the result:** the work's central figure or number, rebuilt from its own data (8 or more points), or the quantity it is about from a public dataset.
6. **Chart 2, the trail or the comparison:** citations by year from OpenAlex, or the result against what came before it.
7. **Lens read:** 150 words at most, applying the ${s.lens.name} lens.
8. **Where it breaks:** the assumption, limit or revision since, stated from the record.
9. **Go further:** the award's own account (${a.links.background ? 'the scientific background document and the lecture' : 'the citation'}) and the work's references, linked.
10. **Credit:** ${landmarkCreditLine(s)}
11. **Sources and claims log summary.**`
  }
  return `## Format: landmark contribution explainer with charts

Built like the best page of a journal club about a laureate's idea: what the prize rewarded, explained so a reader outside ${s.field.name.toLowerCase()} gets it, shown through the works that carry it, with the award's own words beside it. These parts are required content, not a page order; the layout is yours.

1. **Headline** (one line, the contribution in plain words) and **dek** (one line, why a reader outside the field should care).
${awardPart}
3. **The contribution:** 150 words at most: the idea or finding the citation rewards, in plain words, each claim cited to a lead reading's page, figure, theorem or chapter, or to the awarder's account.
4. **Lead readings:** two to four of the laureate's works that show it, linked (free copies where there are), each with one line on what it shows. Labelled "lead reading", never "the winning work", unless the awarder names it.
5. **Chart 1, the contribution:** the central number, figure or comparison the readings rest on (8 or more points), or the quantity they are about from a public dataset.
6. **Chart 2, the trail or the timeline:** citations by year of the key works from OpenAlex, or the key works on a timeline against the prize year.
7. **Lens read:** 150 words at most, applying the ${s.lens.name} lens to the contribution.
8. **Where it breaks:** the assumption, limit or revision since, stated from the record.
9. **Go further:** the award's own account and the lead readings, linked.
10. **Credit:** ${landmarkCreditLine(s)}
11. **Sources and claims log summary.**`
}

function hundredFormat(s: HundredSubject): string {
  const p = s.person
  const near = [s.neighbours.above, s.neighbours.below].filter((n): n is NonNullable<typeof n> => !!n).map((n) => `#${n.rank} ${n.name}`)
  return `## Format: influence profile with charts

Built like the best page of a reference book argued with: one person, what they changed, the numbers that show how far it reached, and whether the rank holds. These parts are required content, not a page order; the layout is yours.

1. **Headline** (one line, the claim about ${p.name}'s influence) and **dek** (one line, why it matters to a reader now).
2. **The rank:** #${p.rank} of 100 in ${s.book.author}'s list (${s.book.year}), between ${near.join(' and ')}, and Hart's case in one line, attributed.
3. **The life in a timeline:** dated points from birth to death, each sourced${p.flags.includes('legendary') ? ', with tradition and evidence marked apart' : ''}.
4. **Map:** where they lived and acted, and where the influence spread (coordinates from Wikidata and your research).
5. **Chart 1, the reach:** the measure of what they changed, over time (8 or more points).
6. **Chart 2, the comparison:** ${p.name} against the people ranked around them, or against the alternative Hart's "without them" test names.
7. **Lens read:** 150 words at most, applying the ${s.lens.name} lens.
8. **The counter-case:** the strongest argument that the rank is wrong, and who the list leaves out.
9. **Go further:** the person's own works or documents, the scholarly biography, linked.
10. **Credit:** ${hundredCreditLine(s)}
11. **Sources and claims log summary.**`
}

function atlasFormat(s: AtlasSubject): string {
  return `## Format: geography (route table)

The page is built around a route table, one row per place, in story order:

| Order | Place | Modern country | Lat, Lon | Era | What happened or what is there | Source | Status |

Status values: Documented, Contested, Inferred. Then, in this order:

1. **The through-line:** one paragraph on what travels or changes along the route.
2. **Map:** the places and the path between them (straight line, sea route or land route). Pick the map type that fits: route, cluster or border. Draw it from the coordinates in your route table.
3. **Then and now:** a two-column comparison for the key place.
4. **Numbers box:** 3 to 5 figures with sources.
5. **Counter-narrative:** the story ${s.country.name} tells about itself against the outside version, where they differ.
6. **Hero insight.**`
}

function epicsFormat(s: EpicsSubject): string {
  const meaning = s.epic.types.includes('Philosophical and spiritual')
    ? '5. **Meaning in the text:** required for this epic. Why the place appears at this point, citing scholarship.'
    : '5. **Meaning in the text:** optional for this epic.'
  return `## Format: geography, epic variant

The page is built around a route table, one row per place, in the order the text visits them:

| Order | Place | Modern country | Lat, Lon | Era | What happened or what is there | Text reference | Source | Status |

Status values: Verified, Claimed, Symbolic, Lost. Say up front what status most of ${s.epic.title}'s places carry. Then:

1. **The route in one paragraph.**
2. **Map:** the ordered points and the path, with status shown as marker style (and a legend that names all four).
3. **Text vs ground:** what the epic says against what is there now, for ${s.place.name}.
4. **Who claims it:** the identification history in three lines.
${meaning}
6. **Hero insight.**`
}

function evidenceFormat(s: EvidenceSubject): string {
  const st = s.study
  const other = s.related.find((x) => st.flags.includes('contested') || x.flags.includes('contested')) ?? s.related[0]
  return `## Format: evidence explainer with charts

Built like the best page of a science desk: one study, what it found, how much that is, what its design can and cannot show, and where the question stands now. These parts are required content, not a page order; the layout is yours.

1. **Headline** (one line, the finding at its true strength: "is linked to" for a correlational design) and **dek** (one line, why it matters to a reader now).
2. **The study card:** #${st.n} ${st.label}, the venue and year, the design (${s.design.name}), the sample in one line, a link to the paper${st.flags.includes('preprint') ? ', and "not yet peer-reviewed" beside it' : ''}.
3. **The finding in a number:** the headline effect with its unit, translated into everyday terms, and set against a benchmark.
4. **Chart 1, the effect in context:** this study's effect against the other studies on the same question (8 or more points where they exist).
5. **What the design can show:** ${s.design.can_show}. One short paragraph and, if it helps, a diagram of the design.
6. **Chart 2, the lens chart:** ${evidenceLensMetrics(s.lens.name)[0]}.
7. **Lens read:** 150 words at most, applying the ${s.lens.name} lens.
8. **The other side:** ${other ? `the strongest opposing or limiting study (start from #${other.n} ${other.label})` : 'the strongest opposing or limiting study you can find'}, stated fairly.
9. **Where it stands:** what the collection's theme verdict says now, and what to watch next.
10. **Go further:** the paper, its data or preregistration, the linked studies, all linked.
11. **Credit:** ${evidenceCreditLine(s).replace(/^Credit: /, '')}
12. **Sources and claims log summary.**`
}

function frontierFormat(s: FrontierSubject): string {
  const p = s.paper
  const other = s.related[0]
  return `## Format: paper explainer with charts

Built like the best page of a tech desk: one new paper, what it claims, how much that is, how strong the evidence is, what it would take to matter, and where it sits in the race. These parts are required content, not a page order; the layout is yours.

1. **Headline** (one line, the result at its true strength: "claims" or "reports" for an unreplicated preprint) and **dek** (one line, why it matters to a reader now).
2. **The paper card:** the title, the authors and their affiliations, the arXiv id and date, "preprint" beside it, a link to the paper${p.editions.length ? `, and a link to the ${s.source.series} edition that featured it` : ''}.
3. **The claim in a number:** the headline result with its unit and baseline, translated into plain terms.
4. **Chart 1, the result in context:** this paper's number against the other published results on the same benchmark or task (8 or more points where they exist).
5. **How strong is it:** the baseline, the settings, contamination risk and what was released, in one short paragraph.
6. **Chart 2, the lens chart:** ${frontierLensMetrics(s.lens.name)[0]}.
7. **Lens read:** 150 words at most, applying the ${s.lens.name} lens.
8. **Beside it:** ${other ? `the closest related work (start from ${other.arxivId}, "${other.title}")` : 'the closest prior or competing work'}, and how this paper differs.
9. **What it would take:** what has to happen for the result to matter outside the paper (a replication, a release, a product), and what to watch.
10. **Go further:** the paper, its code or weights if released, the benchmark, the related work, all linked.
11. **Credit:** ${frontierCreditLine(s).replace(/^Credit: /, '')}
12. **Sources and claims log summary.**`
}

function curiousFormat(s: CuriousSubject): string {
  const c = s.claim
  const other = s.related[0]
  return `## Format: claim check with charts

Built like the best page of a fact desk: one claim, where it came from, who says so, what the record actually supports, and a grade printed where the reader can see it. These parts are required content, not a page order; the layout is yours.

1. **Headline** (one line, the claim at its true strength: "it is said that" for a grade D claim, a plain statement for grade A) and **dek** (one line, why it matters or why it is curious).
2. **The claim card:** the claim, its kind, era, theme and place, the desk's ${curiousGradeLabel(c).toLowerCase()} as a badge with the grade's meaning, and your grade beside it if it differs.
3. **The evidence:** the verbatim quote (at most 300 characters, the only quoted text from the document), the document it comes from, dated and linked, with its archive copy.
4. **Chart 1, the lineage:** the sources found, by year, each marked by the account it descends from (a tree where one copied another, never a flat count). The footer says how many sources and how many independent lineages.
5. **Core and embellishment:** the part the record supports and the part that grew on it, each with its grade and its earliest source.
6. **Chart 2, the lens chart:** ${curiousLensMetrics(s.lens.name)[0]}.
7. **Lens read:** 150 words at most, applying the ${s.lens.name} lens.
8. **Who says so:** the source types (archive, press, memoir, scholarship, web), what each could know, and where they differ.
9. **Beside it:** ${other ? `the closest related claim in the pool (start from "${curiousClaimLabel(other, 60)}")` : 'the closest related claim or the version of the story the sources argue with'}, and how it bears on this one.
10. **What would settle it:** the document, dataset or record that would move the grade, and where it might be.
11. **Go further:** the evidence document and its archive copy, the primary sources, the cited work or book, all linked.
12. **Credit:** ${curiousCreditLine(s).replace(/^Credit: /, '')}
13. **Sources and claims log summary.**`
}

/** "## Format: …": the randomizer's output format, as required content. */
export function formatSection(spin: BriefSpin): string {
  if (isEli5Spin(spin)) return eli5Format(spin)
  const s = spin.subject
  if (s.randomizer === 'footshorts') return footshortsFormat(s)
  if (s.randomizer === 'viznba') return viznbaFormat(s)
  if (s.randomizer === 'ocw') return ocwFormat(s)
  if (s.randomizer === 'landmark') return landmarkFormat(s)
  if (s.randomizer === 'hundred') return hundredFormat(s)
  if (s.randomizer === 'evidence') return evidenceFormat(s)
  if (s.randomizer === 'frontier') return frontierFormat(s)
  if (s.randomizer === 'curious') return curiousFormat(s)
  return s.randomizer === 'desk' ? deskFormat() : s.randomizer === 'atlas' ? atlasFormat(s) : epicsFormat(s)
}

/** Extra bullets for the brief's Charts section. */
export function chartRules(spin: BriefSpin): string[] {
  if (isEli5Spin(spin)) {
    return [
      'Picture story rules: the Charts rules above apply only to beat 6 and to the one picture count, if there is one. The pictures are illustrations, not charts: no axes, units or source lines on them.',
    ]
  }
  if (spin.randomizer === 'desk') {
    return [
      'Desk series rules: one message per chart, the title states the takeaway, axis units labelled, source and date in the footer, nothing decorative.',
      'Use the same palette for every chart on the page, in the same roles, so the series reads as one.',
    ]
  }
  if (spin.randomizer === 'footshorts') {
    return [
      'Football series rules: one message per chart, the title states the takeaway, the competition and season on every chart, source in the footer.',
      'Match numbers come from the match context verbatim. Give each club its own colour consistently (use its crest colour when it reads on the background), and grey for the rest of the league.',
    ]
  }
  if (spin.randomizer === 'viznba') {
    return [
      'Basketball series rules: one message per chart, the title states the takeaway, the season (and regular season or playoffs) on every chart, source in the footer.',
      'Game numbers come from the box scores verbatim. Give each team its own colour consistently (the team colour in the brief reads on a dark background), and grey for the rest of the league.',
    ]
  }
  if (spin.randomizer === 'ocw') {
    return [
      'Study-note series rules: one message per chart, the title states the takeaway, axis units labelled, source and date in the footer, nothing decorative.',
      'A chart of the resource\'s own numbers (a worked example, a table in the notes) says so in its footer and cites the page; a chart from a public dataset names the dataset.',
    ]
  }
  if (spin.randomizer === 'landmark') {
    return [
      'Landmark series rules: one message per chart, the title states the takeaway, axis units labelled, source and date in the footer, nothing decorative.',
      'A chart rebuilt from the work\'s own figure or table says so in its footer and cites the page; the citation chart names OpenAlex and the read date; a chart from a public dataset names the dataset.',
    ]
  }
  if (spin.randomizer === 'hundred') {
    return [
      'Influence series rules: one message per chart, the title states the takeaway, axis units labelled, source and date in the footer, nothing decorative.',
      'Draw the map with D3-geo from your timeline\'s coordinates. A number about the past names its source and how it was estimated (a census, a scholarly estimate); the pageviews chart names Wikimedia and the read date.',
    ]
  }
  if (spin.randomizer === 'evidence') {
    return [
      'Evidence series rules: one message per chart, the title states the takeaway at the strength the design allows, effect sizes on a labelled scale (SD, r, odds or risk ratio, points), the sample size in the footer with the source, nothing decorative.',
      'Every estimate is drawn with its confidence interval where the paper reports one; studies of different designs are marked apart (shape or label), never averaged by eye. A number from a paper\'s table cites the table; the citation chart names OpenAlex and the read date.',
    ]
  }
  if (spin.randomizer === 'curious') {
    return [
      'Claim series rules: one message per chart, the title states the takeaway at the strength the grade allows, the grade and the source count in the footer with the source, nothing decorative.',
      'The lineage chart draws descent, never a flat count: sources that descend from one account hang off it. A number from a source cites it by page or table; a figure from a public dataset names the dataset and the read date.',
    ]
  }
  if (spin.randomizer === 'frontier') {
    return [
      'Paper series rules: one message per chart, the title states the takeaway at the strength a preprint allows, the benchmark and its metric on every chart, the source (paper table, leaderboard, dataset) and date in the footer, nothing decorative.',
      'This paper\'s point is marked apart from the others (colour or label) and its setting matches theirs, or the chart says how it differs. A number from a paper\'s table cites the table; a compute or energy figure names its source and every assumption.',
    ]
  }
  return [
    'Render the route as a map with D3-geo: the places from your route table as ordered points, joined by the path type you chose.',
    spin.randomizer === 'epics'
      ? 'Show each place\'s status (Verified, Claimed, Symbolic, Lost) as its marker style, with a legend. Symbolic places have no honest coordinates: list them beside the map instead of pinning them.'
      : 'Show each place\'s status (Documented, Contested, Inferred) as its marker style, with a legend.',
  ]
}

/**
 * The Content section, replacing the generic one: the claims log raises the
 * bar. `extra` adds site rules (footshorts: how to use the match context).
 */
export function contentSection(desk: string, extra: string[] = []): string {
  return `## Content

- Every claim on the page traces to a Verified row in your claims log. Unverified claims stay off the page.
- Label contested claims as contested and state the major positions fairly.
- Keep fact, interpretation and speculation distinguishable on the page.
- End with a "Sources and claims log" section: the sources as links, and the claims log summarised (how many claims, how many verified, what stayed contested, what you could not find).
- Byline "${desk}" plus the date.
- Write plainly. No hype. Lead with the finding. No em dashes anywhere in the page.${extra.map((l) => `\n- ${l}`).join('')}`
}

/** The Content section for a picture story: the claims log stays in the research file. */
export function eli5ContentSection(desk: string): string {
  return `## Content

- Every beat maps to a row of the stand-in table, and every row of that table to a Verified claim: the stand-in simplifies the record, it never changes it. Unverified claims stay off the page.
- The page ends with the "For grown-ups" card, not a "Sources and claims log" section: the sources as links and one line on the claims log (how many claims, how many verified).
- Byline "${desk}" plus the date, in the grown-ups card.
- Write for the child: short, warm, concrete. No em dashes anywhere in the page.`
}

/** "## Reel script": playbook 0.4. */
export function reelScriptSection(eli5 = false): string {
  return `## Reel script

A short vertical video script, written from the ${eli5 ? 'story insight' : 'hero insight'} only. Everything else stays in the research file for comments and follow-ups.

- First 3 seconds: the surprising claim or the concrete stake. Never open with the topic name.
- One idea per reel. If a second idea appears, it becomes its own spin.
- Close with the "so what" for the viewer, not a recap.
- Short, spoken sentences. No em dashes. No unverified claim.

Give it to the user with the page, or append it to the research file under \`## Reel script\`.`
}

/** The playbook's quality checklist (5), appended to "Before you post". */
export function checklistSection(spin: BriefSpin): string {
  const items = [
    'The hero insight is one sentence and traces to two sources or one primary source.',
    spin.randomizer === 'desk' || spin.randomizer === 'footshorts' || spin.randomizer === 'viznba' || spin.randomizer === 'ocw' || spin.randomizer === 'landmark' || spin.randomizer === 'hundred' || spin.randomizer === 'evidence' || spin.randomizer === 'frontier' || spin.randomizer === 'curious'
      ? 'Every chart has a takeaway title, units and a source.'
      : 'Every place has a status label.',
    ...(spin.randomizer === 'footshorts' ? ['Every score, minute and stat matches the match context; no rumour is stated as fact.'] : []),
    ...(spin.randomizer === 'viznba' ? ['Every score and stat line matches the box scores; no rumour is stated as fact.'] : []),
    ...(spin.randomizer === 'ocw' ? ['The resource and the course page are linked, the CC BY-NC-SA credit names the course, the instructors and the term, and nothing on the page is sponsored.'] : []),
    ...(spin.randomizer === 'landmark' ? ['The work (or the lead readings) and the laureate page are linked, the motivation or citation is quoted verbatim, no title is called the winning work unless the award names it, and the credit names the data sources.'] : []),
    ...(spin.randomizer === 'evidence'
      ? ['Every number matches the paper (page or table), not the collection\'s summary; the causal language matches the design; a preprint is labelled; the opposing study is on the page; the credit links the paper itself.']
      : []),
    ...(spin.randomizer === 'frontier'
      ? ['Every number matches the paper (table or figure), not AI Daily\'s gate; the result is labelled a preprint and reported as a claim; its baseline and setting are stated; the related work is on the page; the credit links the arXiv page itself.']
      : []),
    ...(spin.randomizer === 'curious'
      ? ['The grade printed on the page is the desk\'s, or yours with the reason it differs; every source is traced to its lineage and lineages are counted, not articles; the embellished part is labelled and never asserted; a grade D or E claim is reported as repeated, not as fact; the evidence document and its archive copy are linked.']
      : []),
    ...(spin.randomizer === 'hundred' ? ["Hart's rank and reasons are attributed to him and tested, not repeated; his text is paraphrased, not copied; tradition and record are labelled apart; the credit names the book and the data sources."] : []),
    'Contested claims are labelled and both sides stated fairly.',
    'The first 3 seconds of the script open on the surprising claim.',
    'No em dashes. No unverified claims on the page or in the script.',
  ]
  if (isEli5Spin(spin)) {
    items.splice(
      1,
      1,
      'Six beats at most; beats 1 to 5 have 20 words or fewer each and about 100 words in all. Count them.',
      'Read beats 1 to 5 aloud as if to a five-year-old: every word is one they know, there is no year, percentage or big number, and the pictures alone tell the story.',
      'The stand-in is the same, in the same colours, in every beat, and beat 5 says where it stops being true.',
      'The story insight is a sentence a child would repeat to a parent, every part of the stand-in has a row in the stand-in table, and every row points at a Verified claim.',
      'The timeline, map, ranking charts, counter-case and claims log are in the research file and the grown-ups card, not in the story.',
    )
  }
  return `Then the playbook's checklist:\n${items.map((i) => `- [ ] ${i}`).join('\n')}`
}

/** Extra lines for the Posting section: tie the page to the spin. */
export function postingLines(spin: BriefSpin): string {
  const app = RANDOMIZER_META[spin.randomizer].app
  const appArg = app === 'vizmaya-fyi' ? '' : ` with \`app: "${app}"\``
  return `Tie the page to this spin so the log knows what shipped: pass \`spinId: "${spin.id}"\` to \`publish_html_story\`${appArg}, or add \`&spin=${spin.id}\` to the HTTP publish URL.${
    RANDOMIZER_META[spin.randomizer].gated && !insightReady(spin)
      ? ' Until the hero insight is approved, a publish request for this spin saves a draft.'
      : ''
  }`
}

/** The research file (when saved) or the stub, appended as the brief's last section. */
export function researchAppendix(spin: BriefSpin): string {
  if (spin.researchMd?.trim()) {
    return `# Research file

This is the research saved for spin \`${spin.id}\`. It is the page's evidence.

${spin.researchMd.trim().replace(/^(#{1,5}) /gm, (_m, h: string) => `${h}# `)}`
  }
  return `# Research stub

Start \`${researchFileName(spin)}\` from this. Fill it, then save it to the spin.

\`\`\`markdown
${researchStub(spin)}\`\`\``
}
