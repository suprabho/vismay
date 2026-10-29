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
  fixtureSummary,
  footshortsAngleMetrics,
  gameSummary,
  hundredCreditLine,
  hundredLensMetrics,
  hundredLife,
  hundredRankLabel,
  LANDMARK_WORK_LEVEL_LABEL,
  landmarkAwardLabel,
  landmarkCreditLine,
  landmarkLensMetrics,
  landmarkWorkBasisLabel,
  ocwCourseLabel,
  ocwCreditLine,
  ocwLensMetrics,
  researchFileName,
  researchStub,
  viznbaAngleMetrics,
} from './stub'
import {
  RANDOMIZER_META,
  type AtlasSubject,
  type DeskSubject,
  type EpicsSubject,
  type FootshortsFixtureRef,
  type FootshortsSubject,
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
  return (s.randomizer === 'hundred' || s.randomizer === 'landmark' || s.randomizer === 'ocw') && s.lens.name === ELI5_LENS
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
      real: `the ${landmarkAwardLabel(s.prize, s.award.year)} and the work it rewarded`,
      credit: landmarkCreditLine(s),
    }
  }
  if (s.randomizer === 'ocw') {
    return { who: `the idea in ${ocwCourseLabel(s.course)}`, real: 'the resource and its course page', credit: ocwCreditLine(s) }
  }
  return { who: 'the subject', real: 'the record', credit: '' }
}

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
3. **The trick:** what ${who} figured out, told in the scene. Name the real person or idea once, here.
4. **Why it helps:** what is different because of it, in the scene or in the child's own day. One or two sentences.
5. **Where the picture stops:** one sentence a child can follow on where the stand-in is not the real thing ("Real science is much bigger than a bath tub.").
6. **For grown-ups:** the one beat in adult words, set apart as a small card at the end: ${real} in two or three plain lines, the hero insight in one, the sources as links, and the credit. ${credit}

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

**Not on this page** (they stay in the research file): the timeline, the map, the ranking comparison, the counter-case, the method and the claims log.`
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

function landmarkAssignment(s: LandmarkSubject): string[] {
  const a = s.award
  const w = s.work
  const account = a.links.background
    ? `the scientific background document (${a.links.background})${a.links.lecture ? ` and the prize lecture (${a.links.lecture})` : ''}`
    : `the citation on the ${s.prize.awarder} list (${s.prize.url})`
  const out = [
    `- Field: ${s.field.name} › Prize: ${s.prize.name} (${s.prize.awarder}; ${LANDMARK_WORK_LEVEL_LABEL[s.prize.works]}). ${s.prize.note}`,
    `- Award: ${a.name}, ${landmarkAwardLabel(s.prize, a.year)}${a.share ? `, share ${a.share}` : ''}${a.coLaureates.length ? `, with ${a.coLaureates.join(', ')}` : ''}. ${a.url}`,
    a.motivation ? `- Motivation, verbatim: "${a.motivation}"` : `- Motivation: none on record here. Quote the citation from the official list verbatim: ${s.prize.url}`,
  ]
  if (w) {
    out.push(
      `- Work: ${w.title}${w.year ? ` (${w.year}${w.venue ? `, ${w.venue}` : ''})` : w.venue ? ` (${w.venue})` : ''}. ${w.url}${w.doi ? ` (DOI ${w.doi})` : ''}. ${w.oaUrl ? `Free to read: ${w.oaUrl} (${w.oaStatus ?? 'open'}).` : 'No free copy on record.'}`,
      `- ${landmarkWorkBasisLabel(s)}`,
    )
  } else {
    out.push(`- Work: ${landmarkWorkBasisLabel(s)}`)
  }
  out.push(`- Lens: ${s.lens.name}. ${s.lens.description}`)
  const links = [
    a.links.summary ? `prize summary ${a.links.summary}` : null,
    a.links.background ? `scientific background ${a.links.background}` : null,
    a.links.lecture ? `prize lecture ${a.links.lecture}` : null,
    a.links.wikipedia ? `Wikipedia ${a.links.wikipedia}` : null,
  ].filter(Boolean)
  if (links.length) out.push(`- Links: ${links.join('; ')}.`)
  out.push(
    '',
    '### Do this first',
    '',
    w
      ? '1. Read the work end to end (the free copy linked above, or the DOI). It is the only source for what the page says the work says: cite it by page, figure, theorem or chapter.'
      : `1. Reconstruct the prize-winning work from ${account}: the paper or book the award rewarded, with its DOI or ISBN. Say on the page that it was reconstructed. Then read it end to end and cite it by page, figure, theorem or chapter.`,
    `2. Read the award's own account, ${account}: what the committee rewarded, in its words, and the references it cites.`,
  )
  let n = 3
  if (w?.representative) {
    out.push(`${n++}. Confirm the work. The award's account decides which paper or book won; if it names another, switch to it and say so in the research file. If you cannot tell, the page keeps the label "representative work".`)
  }
  out.push(`${n++}. Apply the ${s.lens.name} lens to the work itself, not to ${a.name}'s career or to ${s.field.name.toLowerCase()} in general.`)
  out.push(`${n++}. ${landmarkCreditLine(s)} The motivation is quoted verbatim and never altered.`)
  if (s.sequence) out.push(`${n++}. This spin follows the previous one: the same prize, the year before. Link back to that story and do not re-explain the prize.`)
  if (s.related.length) {
    out.push('', 'Other works the loader found (context, and the candidates for the switch above):')
    for (const r of s.related.slice(0, 8)) out.push(`- [${r.title}](${r.url})${r.year ? ` (${r.year})` : ''}, ${r.basis === 'citation' ? 'named by the award' : r.basis === 'notable' ? 'a notable work' : r.basis === 'book' ? 'a book from around the prize year' : 'top-cited'}${r.oaUrl ? ', free to read' : ''}`)
  }
  const others = s.pool.laureates.filter((name) => name !== a.name).slice(0, 12)
  if (others.length) out.push('', `Other ${s.prize.name} laureates of ${s.era.name} (context, not to cover): ${others.join(', ')}${s.pool.laureates.length > 13 ? ` and ${s.pool.laureates.length - 13} more` : ''}.`)
  if (w?.countsByYear.length) {
    out.push('', `Citations by year (OpenAlex, read ${s.pool.asOf.slice(0, 10)}): ${w.countsByYear.map((c) => `${c.year}: ${c.citations}`).join(', ')}. Cited ${w.citedBy?.toLocaleString('en-US') ?? '?'} times in all${w.fwci !== null ? `, FWCI ${w.fwci}` : ''}${w.topOnePercent ? ', top 1% of its field and year' : ''}.`)
  }
  if (s.pool.sources.notes.length) out.push('', `Loader notes: ${s.pool.sources.notes.join(' ')}`)
  out.push(
    '',
    `Chart these if the data exists (8 or more points): ${landmarkLensMetrics(s.lens.name).join(', ')}.`,
    'Start from: the work, the award\'s own account (the background document, the lecture or the citation), OpenAlex for the citation record, and a public dataset for anything about the world.',
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
                  : epicsAssignment(s)
  const ready = insightReady(spin)
  const lead = ready
    ? [
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
                ? '\n8. The work is the primary source for what it says; cite it by page, figure, theorem or chapter. The official motivation is quoted verbatim, never paraphrased inside quotation marks. Which paper or book the award rewarded is a claim like any other: Verified only when the citation, the background document or the awarder\'s list names it; otherwise the page says "representative work".'
                : spin.randomizer === 'hundred'
                  ? '\n8. Hart\'s rank and his reasons are his opinion, not a fact: attribute them ("Hart argues"), and test them. Separate what contemporary sources document from what later tradition, legend or hagiography added, and label each. A religious claim is stated as what a tradition holds, never as fact or as falsehood.'
                  : ''
  return `## Research protocol (forensic, lawyer grade)

1. Open the research file \`${researchFileName(spin)}\`. Start from the stub at the end of this brief.
2. Build the claims log first: one row per factual claim (claim, number or date, source URL, source type, confidence).
3. Two-source rule: any figure, date or causal claim needs two independent sources, or one primary source (a government statistic, a filing, a peer-reviewed paper, the original text).
4. Mark every claim Verified, Contested or Unverified. Unverified claims never go on the page or into the script.
5. Separate fact, interpretation and speculation in the write-up, and label each.
6. Record what you could not find. Gaps are part of the story.
7. End the file with a section called \`HERO INSIGHT\`: one sentence, the single most surprising and defensible finding, plus the three claims log rows that support it.${geoStatus}

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
  const gate = gated
    ? ready
      ? 'The hero insight is approved, so the page can go public.'
      : `A human approves the hero insight for ${RANDOMIZER_META[spin.randomizer].name} spins before anything goes public. Save the research file, then post the page as a draft; it can be published once the insight is approved in admin.`
    : `${RANDOMIZER_META[spin.randomizer].name} spins have no approval gate: once the hero insight is in the research file you can publish.`
  return `## Deliverables

Make them in this order. Nothing public is written before the hero insight.

A. **Research file** \`${researchFileName(spin)}\`: the claims log, gaps and the HERO INSIGHT section. Save it to the spin: the \`save_spin_research\` MCP tool with \`spinId: "${spin.id}"\`, or \`PUT ${site}/api/randomizer/spins/${spin.id}\` with JSON \`{ "research": "<markdown>" }\` and the publish token as a bearer. Otherwise hand it to the user with the page.
B. **One HTML story** built from the hero insight, in the format below.
C. **A reel script** (rules below), written from the hero insight only.

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
  return `## Format: landmark paper explainer with charts

Built like the best page of a journal club: one result, explained so a reader outside ${s.field.name.toLowerCase()} gets it, with the numbers that make it concrete and the award's own words beside it. These parts are required content, not a page order; the layout is yours.

1. **Headline** (one line, the result in plain words) and **dek** (one line, why a reader outside the field should care).
2. **The award:** ${landmarkAwardLabel(s.prize, a.year)}, ${a.name}${a.coLaureates.length ? ` with ${a.coLaureates.join(', ')}` : ''}, and the motivation quoted verbatim, linked to the laureate page.
3. **The work:** ${s.work ? `${s.work.title}${s.work.year ? ` (${s.work.year})` : ''}, linked (the free copy where there is one)` : 'the paper or book you reconstructed, linked'}, with the label it carries: ${s.work && !s.work.representative ? 'named by the award' : 'representative work, unless the award\'s account confirms it'}.
4. **The one result:** 150 words at most, from the work, cited to its page, figure, theorem or chapter.
5. **Chart 1, the result:** the work's central figure or number, rebuilt from its own data (8 or more points), or the quantity it is about from a public dataset.
6. **Chart 2, the trail or the comparison:** citations by year from OpenAlex, or the result against what came before it.
7. **Lens read:** 150 words at most, applying the ${s.lens.name} lens.
8. **Where it breaks:** the assumption, limit or revision since, stated from the record.
9. **Go further:** the award's own account (${a.links.background ? 'the scientific background document and the lecture' : 'the citation'}) and the work's references, linked.
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

/** "## Format: …": the randomizer's output format, as required content. */
export function formatSection(spin: BriefSpin): string {
  if (isEli5Spin(spin)) return eli5Format(spin)
  const s = spin.subject
  if (s.randomizer === 'footshorts') return footshortsFormat(s)
  if (s.randomizer === 'viznba') return viznbaFormat(s)
  if (s.randomizer === 'ocw') return ocwFormat(s)
  if (s.randomizer === 'landmark') return landmarkFormat(s)
  if (s.randomizer === 'hundred') return hundredFormat(s)
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

- Every beat is true to a Verified row in your claims log: the stand-in simplifies the record, it never changes it. Unverified claims stay off the page.
- The page ends with the "For grown-ups" card, not a "Sources and claims log" section: the sources as links and one line on the claims log (how many claims, how many verified).
- Byline "${desk}" plus the date, in the grown-ups card.
- Write for the child: short, warm, concrete. No em dashes anywhere in the page.`
}

/** "## Reel script": playbook 0.4. */
export function reelScriptSection(): string {
  return `## Reel script

A short vertical video script, written from the hero insight only. Everything else stays in the research file for comments and follow-ups.

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
    spin.randomizer === 'desk' || spin.randomizer === 'footshorts' || spin.randomizer === 'viznba' || spin.randomizer === 'ocw' || spin.randomizer === 'landmark' || spin.randomizer === 'hundred'
      ? 'Every chart has a takeaway title, units and a source.'
      : 'Every place has a status label.',
    ...(spin.randomizer === 'footshorts' ? ['Every score, minute and stat matches the match context; no rumour is stated as fact.'] : []),
    ...(spin.randomizer === 'viznba' ? ['Every score and stat line matches the box scores; no rumour is stated as fact.'] : []),
    ...(spin.randomizer === 'ocw' ? ['The resource and the course page are linked, the CC BY-NC-SA credit names the course, the instructors and the term, and nothing on the page is sponsored.'] : []),
    ...(spin.randomizer === 'landmark' ? ['The work and the laureate page are linked, the motivation is quoted verbatim, a representative work is labelled as such, and the credit names the data sources.'] : []),
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
