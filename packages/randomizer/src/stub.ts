/**
 * The research file a spin starts (playbook 0.2, 0.3, 4): reel results
 * pre-filled, the right template (editorial, geography or epic), an empty
 * claims log, and the HERO INSIGHT section everything public is written from.
 * Footshorts spins get a football template: the news, the match record from
 * the snapshot, the table, the angle read and the data pull. NBA Desk spins
 * get the same in basketball terms: the game log and the standings. OCW Desk
 * spins get a study template: what the resource says, where it sits in the
 * course, the lens read, the data pull and the credit line. Landmark Desk
 * spins get a paper template: the award and its motivation, the work and how
 * it was tied to the award, what the award rewarded, the lens read, the data
 * pull with the citation record, and the credit line. The 100 Desk spins get
 * a life template: the rank and Hart's case, the life on the record, the
 * influence in numbers, the lens read, the counter-case and the credit line.
 *
 * Pure, so admin can offer "Copy research stub" without a round trip.
 */

import { FOOTSHORTS, VIZNBA } from './datasets'
import { slugify } from './text'
import {
  RANDOMIZER_META,
  type AtlasSubject,
  type DeskSubject,
  type EpicsSubject,
  type FootshortsFixtureRef,
  type FootshortsSubject,
  type HundredLifeEvent,
  type HundredPerson,
  type HundredSubject,
  type LandmarkPrize,
  type LandmarkSubject,
  type LandmarkWorkLevel,
  type OcwSubject,
  type SpinRecord,
  type ViznbaGameRef,
  type ViznbaSubject,
} from './types'

export type StubSpin = Pick<SpinRecord, 'id' | 'seed' | 'randomizer' | 'subject' | 'createdAt' | 'reels'>

export const HERO_INSIGHT_HEADING = 'HERO INSIGHT'
const HERO_PLACEHOLDER = '_One sentence: the single most surprising finding you can defend._'

function primaryName(spin: Pick<SpinRecord, 'subject'>): string {
  const s = spin.subject
  if (s.randomizer === 'desk') return s.sub.name
  if (s.randomizer === 'atlas') return s.pair ? `${s.country.name} and ${s.pair.name}` : s.country.name
  if (s.randomizer === 'footshorts' || s.randomizer === 'viznba') return s.opponent ? `${s.team.name} v ${s.opponent.name}` : s.team.name
  if (s.randomizer === 'ocw') return `${s.course.number} ${s.file.title}`
  if (s.randomizer === 'landmark') return s.award.name
  if (s.randomizer === 'hundred') return s.person.name
  return s.epic.title
}

/** `YYYY-MM-DD_<randomizer>_<primary-reel-value>.md` (playbook 0.2). */
export function researchFileName(spin: Pick<SpinRecord, 'subject' | 'createdAt' | 'randomizer'>): string {
  return `${spin.createdAt.slice(0, 10)}_${spin.randomizer}_${slugify(primaryName(spin))}.md`
}

function deskTemplate(s: DeskSubject): string[] {
  const window = s.freshness.days === null ? 'any date (Evergreen)' : `the ${s.freshness.window}`
  return [
    '## Why Now',
    '',
    `The three most recent developments for ${s.sub.name}, inside ${window}. The lens goes on the newest.`,
    s.freshness.name === 'Evergreen'
      ? ''
      : 'If nothing happened in that window, move to the next one (Breaking, then Developing, then Evergreen) and say so here.',
    '',
    '| # | Date | Development | Source |',
    '|---|------|-------------|--------|',
    '| 1 | | | |',
    '| 2 | | | |',
    '| 3 | | | |',
    '',
    '## Structural context',
    '',
    'How the segment works, in one paragraph. Where the money and the choke points sit.',
    '',
    `## Lens read: ${s.lens.name}`,
    '',
    `${s.lens.description} Applied to the newest development, not to the segment in general.`,
    '',
    '## Data pull',
    '',
    'At least 8 data points per series where possible, from primary sources.',
    '',
    '| Metric | Period | Value | Unit | Source |',
    '|--------|--------|-------|------|--------|',
    ...s.sub.key_metrics.map((m) => `| ${m} | | | | |`),
    '',
    `Start from: ${s.sub.primary_sources.join(', ')}.`,
    '',
    '## Counter-case',
    '',
    'The strongest argument against the thesis.',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === ''))
}

function atlasTemplate(s: AtlasSubject): string[] {
  const countries = s.pair ? `${s.country.name} or ${s.pair.name}` : s.country.name
  return [
    '## Route table',
    '',
    `4 to 8 named places inside ${countries}, in story order, using the ${s.frame.name} frame. Status: Documented, Contested or Inferred.`,
    '',
    '| Order | Place | Modern country | Lat, Lon | Era | What happened or what is there | Source | Status |',
    '|-------|-------|----------------|----------|-----|--------------------------------|--------|--------|',
    ...[1, 2, 3, 4].map((n) => `| ${n} | | ${s.country.name} | | | | | |`),
    '',
    '## Numbers',
    '',
    'Population, migration flows, trade volumes, language speakers: census, UN, World Bank or national statistics.',
    '',
    '| Figure | Value | Year | Source |',
    '|--------|-------|------|--------|',
    '| | | | |',
    '',
    `## The shift (${s.lens.name})`,
    '',
    'What the culture looked like before and after the key movement or event.',
    '',
    '## Insider voice',
    '',
    `One primary or scholarly source from within ${s.country.name} or the community, not only outside commentary.`,
    '',
    '## Counter-narrative',
    '',
    'The version the country or group tells about itself, against the external one, if they differ.',
  ]
}

function epicsTemplate(s: EpicsSubject): string[] {
  const route = s.episode.places
  return [
    '## Passage',
    '',
    `${s.episode.name}. Edition and translation: ___. Line or verse numbers: ___.`,
    '',
    '## Route table',
    '',
    'Every place the episode names, in text order. Status: Verified, Claimed, Symbolic or Lost.',
    '',
    '| Order | Place | Modern country | Lat, Lon | Era | What happened or what is there | Text reference | Source | Status |',
    '|-------|-------|----------------|----------|-----|--------------------------------|----------------|--------|--------|',
    ...route.map(
      (p, i) =>
        `| ${i + 1} | ${p.name} | ${p.modern} | | | | ${p.text_ref ?? ''} | | ${p.status} (starting point, verify) |`,
    ),
    '',
    `## Who claims ${s.place.name}`,
    '',
    'Who first proposed the identification, when, on what evidence, and who disputes it.',
    '',
    '## What is there today',
    '',
    'What stands there now, who visits, and any heritage, tourism or political investment.',
    '',
    '## Meaning in the text',
    '',
    s.epic.types.includes('Philosophical and spiritual')
      ? 'Required: why this place appears at this point in the text, citing scholarship.'
      : 'Optional: what the place does for the story at this point.',
  ]
}

/** "Arsenal 2-1 Chelsea · Premier League · 2026-10-04 · FINISHED" */
export function fixtureSummary(f: FootshortsFixtureRef): string {
  const score = f.homeScore !== null && f.awayScore !== null ? ` ${f.homeScore}-${f.awayScore} ` : ' v '
  return `${f.home}${score}${f.away} · ${f.kickoff.slice(0, 10)} · ${f.status}`
}

/** The angle's data pull: the numbers worth charting for it. */
export const FOOTSHORTS_ANGLE_METRICS: Record<string, string[]> = {
  Tactics: ['xG for and against per match', 'Possession and field tilt', 'Shots and big chances', 'PPDA or pressing actions'],
  'Form vs numbers': ['Points per game, rolling', 'xG difference per match', 'Goals minus xG', 'Table position by matchday'],
  Manager: ['Points per game by manager', 'Results since appointment', 'Starting XI changes per match', 'Substitution timing'],
  'Squad and injuries': ['Players unavailable per match', 'Minutes by player', 'Results with and without key players', 'Squad age profile'],
  'Money and transfers': ['Net spend by window', 'Wage bill and wages to revenue', 'Revenue by stream', 'Reported fees in and out'],
  'Breakout player': ['Minutes, goals and assists', 'xG and xA per 90', 'Progressive actions per 90', 'Share of team output'],
  'Rivalry and history': ['Head-to-head record', 'Goals in the fixture by era', 'Results at each ground', 'Points gap over time'],
  'Fans and the city': ['Average attendance and capacity', 'Ticket and season-ticket prices', 'Ownership timeline', 'Home vs away record'],
  Stakes: ['Table position by matchday', 'Points gap to the line that matters', 'Remaining fixtures and difficulty', 'Prize money at stake'],
  'Discipline and officiating': ['Cards per match', 'Penalties for and against', 'VAR overturns', 'Suspensions and matches missed'],
}

export function footshortsAngleMetrics(angle: string): string[] {
  return FOOTSHORTS_ANGLE_METRICS[angle] ?? ['Results', 'xG for and against', 'Table position']
}

function footshortsTemplate(s: FootshortsSubject): string[] {
  const window = s.freshness.days === null ? 'any date (Evergreen)' : `the ${s.freshness.window}`
  const fixtures = [...s.team.recent, ...s.team.upcoming, ...(s.opponent ? [...s.opponent.recent, ...s.opponent.upcoming] : [])]
  const byId = new Map(fixtures.map((f) => [f.id, f]))
  const attached = s.fixtureIds.map((id) => byId.get(id)).filter((f): f is FootshortsFixtureRef => !!f)
  const subject = s.opponent ? `${s.team.name} and ${s.opponent.name}` : s.team.name
  return [
    '## Why Now',
    '',
    `The three most recent developments for ${subject}, inside ${window}. The angle goes on the newest.`,
    s.freshness.name === 'Evergreen'
      ? ''
      : 'If nothing happened in that window, move to the next one (Matchday, then Running story, then Evergreen) and say so here.',
    '',
    '| # | Date | Development | Source |',
    '|---|------|-------------|--------|',
    '| 1 | | | |',
    '| 2 | | | |',
    '| 3 | | | |',
    '',
    '## Match record',
    '',
    attached.length
      ? 'From the match context in the brief. Copy scores and minutes from it verbatim.'
      : 'No fixtures were on file at spin time. Source every result.',
    '',
    '| Date | Competition | Match | Status | What it shows |',
    '|------|-------------|-------|--------|---------------|',
    ...(attached.length
      ? attached.map((f) => `| ${f.kickoff.slice(0, 10)} | ${FOOTSHORTS.competitions.find((c) => c.slug === f.competition)?.name ?? f.competition} | ${f.home} v ${f.away}${f.homeScore !== null && f.awayScore !== null ? ` (${f.homeScore}-${f.awayScore})` : ''} | ${f.status} | |`)
      : ['| | | | | |']),
    '',
    `## Where they stand (${s.competition.name})`,
    '',
    'Position, points, goal difference and the gap to the line that matters, from the table in the match context or the competition.',
    '',
    `## Angle read: ${s.angle.name}`,
    '',
    `${s.angle.description} Applied to the newest development, not to the club in general.`,
    '',
    '## Data pull',
    '',
    'At least 8 data points per series where possible: match data from the context, money from club accounts.',
    '',
    '| Metric | Period | Value | Unit | Source |',
    '|--------|--------|-------|------|--------|',
    ...footshortsAngleMetrics(s.angle.name).map((m) => `| ${m} | | | | |`),
    '',
    '## Counter-case',
    '',
    'The strongest argument against the thesis.',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === ''))
}

/** "Boston Celtics 112 @ New York Knicks 108 · 2026-10-04 · final", or "… @ … · 2026-10-30 · scheduled". */
export function gameSummary(g: ViznbaGameRef): string {
  const played = g.homeScore !== null && g.awayScore !== null && g.state !== 'pre'
  const match = played ? `${g.away} ${g.awayScore} @ ${g.home} ${g.homeScore}` : `${g.away} @ ${g.home}`
  const state = g.state === 'post' ? 'final' : g.state === 'in' ? 'live' : 'scheduled'
  return `${match} · ${g.date.slice(0, 10)} · ${g.season ? `${g.season}, ` : ''}${state}`
}

/** The angle's data pull: the numbers worth charting for it. */
export const VIZNBA_ANGLE_METRICS: Record<string, string[]> = {
  'Rotation and scheme': ['Minutes by player per game', 'Pace and possessions', 'Shot diet: rim, mid-range, three', 'Defensive rating by lineup'],
  'Form vs numbers': ['Point differential per game', 'Net rating, rolling 10 games', 'Clutch record', 'Win percentage vs expected from point differential'],
  'Star watch': ['Points, rebounds and assists per game', 'Usage rate and true shooting', 'Minutes per game', 'Net rating on and off the floor'],
  'Coach and front office': ['Record by coach', 'Rotation changes per game', 'Trades and signings with dates', 'Draft picks owned and owed'],
  'Injuries and load': ['Games missed by player', 'Minutes per game for the top six', 'Record on back-to-backs', 'Record with and without the star'],
  'Cap and trades': ['Payroll against the cap, the tax and the aprons', 'Contracts by year', 'Picks owned and owed', 'Reported trade terms'],
  'Rookies and development': ['Minutes by rookies and second-years', 'Per-36 production', 'Draft position against output', 'G League assignments'],
  'Rivalry and history': ['Head-to-head record', 'Playoff series between them', 'Point differential in the matchup', 'Results by era'],
  Stakes: ['Standings position by date', 'Games back of the line that matters', 'Remaining schedule strength', 'Lottery or seeding odds'],
  'Fans and the city': ['Average attendance and capacity', 'Ticket prices', 'Ownership timeline', 'Home and road record'],
}

export function viznbaAngleMetrics(angle: string): string[] {
  return VIZNBA_ANGLE_METRICS[angle] ?? ['Results', 'Point differential', 'Standings position']
}

function viznbaTemplate(s: ViznbaSubject): string[] {
  const window = s.freshness.days === null ? 'any date (Evergreen)' : `the ${s.freshness.window}`
  const games = [...s.team.recent, ...s.team.upcoming, ...(s.opponent ? [...s.opponent.recent, ...s.opponent.upcoming] : [])]
  const byId = new Map(games.map((g) => [g.id, g]))
  const attached = s.gameIds.map((id) => byId.get(id)).filter((g): g is ViznbaGameRef => !!g)
  const subject = s.opponent ? `the ${s.team.name} and the ${s.opponent.name}` : `the ${s.team.name}`
  const conference = VIZNBA.conferences.find((c) => c.slug === s.conference.slug)?.name ?? s.conference.name
  return [
    '## Why Now',
    '',
    `The three most recent developments for ${subject}, inside ${window}. The angle goes on the newest.`,
    s.freshness.name === 'Evergreen'
      ? ''
      : 'If nothing happened in that window, move to the next one (Last night, then This week, then Evergreen) and say so here.',
    '',
    '| # | Date | Development | Source |',
    '|---|------|-------------|--------|',
    '| 1 | | | |',
    '| 2 | | | |',
    '| 3 | | | |',
    '',
    '## Game log',
    '',
    attached.length
      ? 'From the box scores in the brief. Copy scores and stat lines from them verbatim.'
      : 'No games were on the schedule at spin time. Source every result.',
    '',
    '| Date | Game | Result | What it shows |',
    '|------|------|--------|---------------|',
    ...(attached.length
      ? attached.map((g) => `| ${g.date.slice(0, 10)} | ${g.away} @ ${g.home} | ${g.state === 'pre' ? 'scheduled' : `${g.awayScore}-${g.homeScore}`} | |`)
      : ['| | | | |']),
    '',
    `## Where they stand (${conference}, ${s.team.division} division)`,
    '',
    'Record, conference seed, games back of the line that matters (the top six, the play-in, the lottery) and the remaining schedule, from NBA.com or ESPN standings.',
    '',
    `## Angle read: ${s.angle.name}`,
    '',
    `${s.angle.description} Applied to the newest development, not to the franchise in general.`,
    '',
    '## Data pull',
    '',
    'At least 8 data points per series where possible: game data from the box scores and NBA.com stats, money from team announcements and the reported cap sheet.',
    '',
    '| Metric | Period | Value | Unit | Source |',
    '|--------|--------|-------|------|--------|',
    ...viznbaAngleMetrics(s.angle.name).map((m) => `| ${m} | | | | |`),
    '',
    '## Counter-case',
    '',
    'The strongest argument against the thesis.',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === ''))
}

/** "8.03SC Physics III: Vibrations and Waves (Fall 2016)" */
export function ocwCourseLabel(c: Pick<OcwSubject['course'], 'number' | 'title' | 'semester' | 'year'>): string {
  const term = [c.semester, c.year].filter(Boolean).join(' ')
  return `${c.number} ${c.title}${term ? ` (${term})` : ''}`
}

/** The credit OCW's CC BY-NC-SA 4.0 licence asks for, written out. */
export function ocwCreditLine(s: Pick<OcwSubject, 'course'>): string {
  const c = s.course
  const term = [c.semester, c.year].filter(Boolean).join(' ')
  const who = c.instructors.length ? `, ${c.instructors.join(', ')}` : ''
  return `Credit: "Source: MIT OpenCourseWare, ${c.number} ${c.title}${who}${term ? `, ${term}` : ''}. Licence: CC BY-NC-SA 4.0" with a link to ${c.url}.`
}

/** What to chart per OCW lens, when the data exists. */
export const OCW_LENS_METRICS: Record<string, string[]> = {
  'The one idea': ['the quantity the idea predicts, against what is observed', 'the idea\'s key parameter across the cases the resource names', 'the resource\'s own table or worked example'],
  'Work the problem': ['the worked solution\'s intermediate values, step by step', 'the answer as the inputs change (a sensitivity line)', 'the same problem across the resource\'s cases'],
  'Chart it': ['the quantity the resource is about, over time, from a public dataset', 'the same quantity across countries, firms or materials', 'the quantity against the driver the resource says explains it'],
  'Where it came from': ['the idea\'s milestones on a timeline, dated and sourced', 'the measured value of the key quantity as instruments improved', 'how often the idea appears in the literature by decade'],
  'Why it matters now': ['the number in this month\'s news, over the last 10 years', 'the resource\'s quantity for the case in the news against the textbook case', 'the forecast the idea makes against the latest reading'],
  'Across the river': ['the same quantity as each field measures it', 'the two fields\' key parameters side by side', 'the outcomes each field\'s model predicts for one shared case'],
  "Explain like I'm 5": ['the quantity in everyday units (steps, spoons, minutes), as a picture chart', 'the everyday stand-in against the real thing, side by side', 'the one number that changes when the idea is switched on and off'],
}

export function ocwLensMetrics(lens: string): string[] {
  return OCW_LENS_METRICS[lens] ?? ['the quantity the resource is about, over time', 'the same quantity across cases', 'the resource\'s own numbers']
}

function ocwTemplate(s: OcwSubject): string[] {
  const term = [s.course.semester, s.course.year].filter(Boolean).join(' ')
  return [
    '## The resource',
    '',
    `${s.file.title} (${s.kind.name}, ${s.file.contentType}): ${s.file.url}`,
    `From ${s.course.number} ${s.course.title}${term ? ` (${term})` : ''}: ${s.course.url}`,
    '',
    '## The one idea',
    '',
    'Two sentences: what the resource turns on, for a reader who has not taken the course.',
    '',
    '## What the resource says',
    '',
    'Its own structure, section by section (or problem by problem), each cited to a page, slide or timestamp.',
    '',
    '| Part | Says | Page, slide or time |',
    '|------|------|---------------------|',
    '| | | |',
    '',
    '## Where it sits in the course',
    '',
    'From the course page: the session, what came before it, what it leads to, and the textbook or paper it draws on.',
    s.siblings.length ? `Other ${s.kind.name.toLowerCase()} files seen: ${s.siblings.slice(0, 8).map((f) => f.title).join('; ')}.` : '',
    '',
    `## Lens read: ${s.lens.name}`,
    '',
    `${s.lens.description} Applied to the resource, not to ${s.topic.name} in general.`,
    '',
    '## Data pull',
    '',
    'At least 8 data points per series where possible: the resource\'s own numbers (cited to the page), then a public dataset for anything about the world.',
    '',
    '| Metric | Period or case | Value | Unit | Source |',
    '|--------|----------------|-------|------|--------|',
    ...ocwLensMetrics(s.lens.name).map((m) => `| ${m} | | | | |`),
    '',
    '## Where it breaks',
    '',
    'The assumption the resource makes that does not always hold, and a case where it fails.',
    '',
    '## Credit',
    '',
    ocwCreditLine(s),
  ].filter((l, i, a) => !(l === '' && a[i - 1] === ''))
}

/* ---------- Landmark Desk ---------- */

/** What a prize's citation names, for the reels and the brief. */
export const LANDMARK_WORK_LEVEL_LABEL: Record<LandmarkWorkLevel, string> = {
  paper: 'the citation names the paper',
  book: 'the citation names the book',
  result: 'the citation names a result',
  body: 'the citation names a body of work',
}

/** "Nobel Prize in Physics 2020", "Gödel Prize 2019" */
export function landmarkAwardLabel(prize: Pick<LandmarkPrize, 'name'>, year: number): string {
  return `${prize.name} ${year}`
}

/** The one-line licence reminder the draw fires. */
export function landmarkLicenceNote(prize: Pick<LandmarkPrize, 'source' | 'awarder'>): string {
  return prize.source.kind === 'nobel'
    ? 'Prize data is CC0 from Nobel Prize Outreach: quote the motivation verbatim, never alter it, and link to nobelprize.org rather than rehosting its documents. Work metadata is CC0 from OpenAlex and Wikidata. Link the paper; do not rehost it.'
    : `Prize data is CC0 from Wikidata; the citation is quoted from the ${prize.awarder} list, linked. Work metadata is CC0 from OpenAlex and Wikidata. Link the paper or book; do not rehost it.`
}

/** The credit the page carries, written out. */
export function landmarkCreditLine(s: Pick<LandmarkSubject, 'prize' | 'award' | 'work'>): string {
  const prizeData = s.prize.source.kind === 'nobel' ? 'Nobel Prize Outreach AB (api.nobelprize.org, CC0)' : `Wikidata (CC0) and the ${s.prize.awarder} list`
  const workData = s.work ? (s.work.basis === 'book' ? 'Open Library' : 'OpenAlex (CC0) and Wikidata (CC0)') : null
  const free = s.work?.oaUrl ? '; free-to-read link via Unpaywall and OpenAlex' : ''
  const links = [s.award.url, s.work?.url].filter(Boolean).join(' and ')
  return `Credit: "Prize data: ${prizeData}.${workData ? ` Work metadata: ${workData}${free}.` : ''} The motivation is quoted verbatim." with links to ${links}.`
}

/** What to chart per Landmark lens, when the data exists. */
export const LANDMARK_LENS_METRICS: Record<string, string[]> = {
  'Why it won': ['the quantity the motivation names, as the work measured it', 'the work\'s key result against what the field expected before it', 'years from publication to prize, for this prize\'s laureates of the era'],
  'One figure': ['the work\'s central figure or table, rebuilt from its own numbers', 'the key parameter across the cases the work reports', 'the result against the prediction it tested'],
  'What it replaced': ['the measured value before and after the work, by year', 'how often the old and the new idea appear in the literature by decade', 'the evidence each side had, as a count of studies'],
  'Read it today': ['the work\'s shape (sections, figures, equations, references), as a picture chart', 'the one quantity the key passage turns on, in everyday units', 'citations by year, from OpenAlex (the counts in the brief)'],
  'Citation trail': ['citations by year, from OpenAlex (the counts in the brief)', 'the citing fields, as a share', 'the lag from publication to prize for the laureates of this prize'],
  'Missing names': ['the authors of the work and of the work it built on, on a timeline', 'the co-authors\' and rivals\' citations over the same years', 'the share of the award year\'s citations each name received'],
  "Explain like I'm 5": ['the quantity in everyday units (steps, spoons, minutes), as a picture chart', 'the everyday stand-in against the real thing, side by side', 'the one number that changes when the result is switched on and off'],
}

export function landmarkLensMetrics(lens: string): string[] {
  return LANDMARK_LENS_METRICS[lens] ?? ['the quantity the work is about, over time', 'citations by year, from OpenAlex', 'the work\'s own numbers']
}

/** "Named by the award record", "Representative work: the laureate's most-cited paper before the prize (OpenAlex)". */
export function landmarkWorkBasisLabel(s: Pick<LandmarkSubject, 'work' | 'award'>): string {
  const w = s.work
  if (!w) return 'No work resolved: reconstruct the prize-winning work from the award citation and the background document, and say so.'
  if (w.basis === 'citation' && w.type === 'subject') return 'Named by the award record (Wikidata "for work") as a subject, not a publication: find the paper or book that established it and read that.'
  if (w.basis === 'citation') return 'Named by the award record (Wikidata "for work"): the prize-winning work.'
  if (w.basis === 'notable') return `Representative work: listed as a notable work of ${s.award.name} on Wikidata, not named by the award. Label it so.`
  if (w.basis === 'top-cited') return `Representative work: ${s.award.name}'s most-cited work before the prize on OpenAlex, not named by the award. Label it so.`
  return `Representative work: ${s.award.name}'s book from around the prize year on Open Library, not confirmed as the winning title. Check the prize's list.`
}

function landmarkTemplate(s: LandmarkSubject): string[] {
  const a = s.award
  const w = s.work
  const links = [
    ['Laureate page', a.url],
    ['Prize summary', a.links.summary],
    ['Scientific background', a.links.background],
    ['Prize lecture', a.links.lecture],
    ['Wikipedia', a.links.wikipedia],
  ].filter((l): l is [string, string] => !!l[1])
  return [
    '## The award',
    '',
    `${landmarkAwardLabel(s.prize, a.year)}, ${s.prize.awarder}. Laureate: ${a.name}${a.share ? ` (share ${a.share})` : ''}${a.coLaureates.length ? `, with ${a.coLaureates.join(', ')}` : ''}.`,
    a.motivation ? `Motivation, verbatim: "${a.motivation}"` : `No motivation on record here: quote the citation from the official list (${s.prize.url}) verbatim.`,
    links.length ? `Links: ${links.map(([k, v]) => `${k}: ${v}`).join('; ')}.` : '',
    '',
    '## The work',
    '',
    w
      ? `${w.title}${w.year ? ` (${w.year}${w.venue ? `, ${w.venue}` : ''})` : w.venue ? ` (${w.venue})` : ''}: ${w.url}${w.doi ? ` · DOI ${w.doi}` : ''}${w.oaUrl ? ` · free to read: ${w.oaUrl} (${w.oaStatus ?? 'open'})` : ' · no free copy on record'}.`
      : 'None resolved. Candidates, from the citation and the background document:',
    landmarkWorkBasisLabel(s),
    s.related.length ? `Other works the loader found: ${s.related.map((r) => `${r.title}${r.year ? ` (${r.year})` : ''}`).join('; ')}.` : '',
    '',
    '## The one result',
    '',
    'Two sentences: what the work shows, for a reader outside the field.',
    '',
    '## What the work says',
    '',
    'Its own structure, section by section (or chapter by chapter), each cited to a page, figure, theorem or section.',
    '',
    '| Part | Says | Page, figure or section |',
    '|------|------|-------------------------|',
    '| | | |',
    '',
    '## What the award rewarded',
    '',
    'The motivation against the work: which result, where in the work it is, what the motivation leaves out, and (for a representative work) whether the citation or the background document names another paper or book instead.',
    '',
    `## Lens read: ${s.lens.name}`,
    '',
    `${s.lens.description} Applied to the work, not to ${a.name}'s career or to ${s.field.name.toLowerCase()} in general.`,
    '',
    '## Data pull',
    '',
    'At least 8 data points per series where possible: the work\'s own numbers (cited to the page), the citation record below, then a public dataset for anything about the world.',
    '',
    '| Metric | Period or case | Value | Unit | Source |',
    '|--------|----------------|-------|------|--------|',
    ...landmarkLensMetrics(s.lens.name).map((m) => `| ${m} | | | | |`),
    w?.countsByYear.length ? '' : '',
    w?.countsByYear.length ? `Citations by year (OpenAlex, read ${s.pool.asOf.slice(0, 10)}): ${w.countsByYear.map((c) => `${c.year}: ${c.citations}`).join(', ')}.` : '',
    w?.citedBy !== null && w?.citedBy !== undefined ? `Cited ${w.citedBy.toLocaleString('en-US')} times in all${w.fwci !== null ? `; FWCI ${w.fwci}` : ''}${w.topOnePercent ? '; top 1% of its field and year' : ''} (OpenAlex).` : '',
    '',
    '## Where it breaks, and what came after',
    '',
    'The assumption or claim that did not hold up, the revisions and replications since, any retraction nearby, and the result\'s limits.',
    '',
    '## Credit',
    '',
    landmarkCreditLine(s),
  ].filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
}

/* ---------- The 100 Desk ---------- */

/** An astronomical year (0 is 1 BCE) as a reader writes it: "1643", "384 BCE". */
export function hundredYear(year: number): string {
  return year > 0 ? String(year) : `${1 - year} BCE`
}

/** "1643 to 1727", "c. 384 BCE to 322 BCE", "dates not on record": the life from the dataset's years. */
export function hundredLife(p: Pick<HundredPerson, 'born' | 'died'>): string {
  if (p.born === null && p.died === null) return 'dates not on record'
  const c = (p.born ?? p.died!) < 1000 ? 'c. ' : ''
  if (p.born === null) return `died ${c}${hundredYear(p.died!)}`
  if (p.died === null || p.died === p.born) return `${c}${hundredYear(p.born)}`
  return `${c}${hundredYear(p.born)} to ${hundredYear(p.died)}`
}

/** "#31 of 100 in Hart's The 100 (1992)" */
export function hundredRankLabel(s: Pick<HundredSubject, 'person' | 'book'>): string {
  return `#${s.person.rank} of 100 in ${s.book.author}'s The 100 (${s.book.year} edition)`
}

/** The credit the page carries, written out. */
export function hundredCreditLine(s: Pick<HundredSubject, 'book' | 'person' | 'profile'>): string {
  const image = s.profile?.imagePage ? ` Portrait: Wikimedia Commons (${s.profile.imagePage}), under the licence on its file page.` : ''
  return `Credit: "Ranking: ${s.book.author}, ${s.book.title} (${s.book.publisher}, ${s.book.year}). Life data: Wikidata (CC0). Page views: Wikimedia (CC0).${image}" with links to ${s.profile?.wikipediaUrl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(s.person.wiki.replace(/ /g, '_'))}`} and https://www.wikidata.org/wiki/${s.person.wikidata}.`
}

/** What to chart per The 100 lens, when the data exists. */
export const HUNDRED_LENS_METRICS: Record<string, string[]> = {
  'The case for the rank': ['the reach of what they changed (followers, users, territory, people under it) over time', 'the same measure for the people ranked just above and below', 'English Wikipedia views by month (the counts in the brief)'],
  'Without them': ['the dates of the rivals and near-misses who had the same idea or aim, on a timeline', 'what the record shows with and without the person (adoption, territory, output) by decade', 'how long until someone else did it, where someone did'],
  'Reach in numbers': ['the headline reach measure by century or decade', 'its split by region today', 'English Wikipedia views by month and Wikipedia editions with an article (the counts in the brief)'],
  'Map of a life': ['the dated places of the life, in order (birth and death coordinates are in the brief)', 'distance travelled or territory held over the life', 'where the influence reached by a dated point'],
  'Myth and record': ['when each source about the person was written, against when they lived', 'the claims by layer: contemporary, near-contemporary, later tradition', 'how the story grew: mentions by century'],
  'Who is missing': ['the collaborators, rivals and predecessors on a timeline', "the list's people by region, domain and sex, against the world's population at their time", 'what the change cost or gave the people it happened to, in numbers'],
  "Explain like I'm 5": ['the change in everyday units (days, steps, people in a classroom), as a picture chart', 'before and after the person, side by side', 'the one number that shows the change'],
}

export function hundredLensMetrics(lens: string): string[] {
  return HUNDRED_LENS_METRICS[lens] ?? ['the reach of what they changed, over time', 'the people ranked just above and below on the same measure', 'English Wikipedia views by month']
}

function hundredTemplate(s: HundredSubject): string[] {
  const p = s.person
  const pr = s.profile
  const place = (e: HundredLifeEvent | null) =>
    e ? [e.date, e.place, e.lat !== null && e.lon !== null ? `${e.lat.toFixed(3)}, ${e.lon.toFixed(3)}` : null].filter(Boolean).join(', ') : 'not on record'
  const near = [s.neighbours.above ? `#${s.neighbours.above.rank} ${s.neighbours.above.name}` : null, s.neighbours.below ? `#${s.neighbours.below.rank} ${s.neighbours.below.name}` : null].filter(Boolean)
  return [
    '## The rank',
    '',
    `${hundredRankLabel(s)}${p.hart_name !== p.name ? `, printed as "${p.hart_name}"` : ''}. Ranked for: ${s.domain.name.toLowerCase()}. Neighbours: ${near.join(' and ')}.`,
    ...(p.note ? [`Up front: ${p.note}`] : []),
    '',
    "Hart's case for the rank, in your own words (his text is copyrighted: paraphrase it, quote a phrase at most, and cite the page):",
    '',
    '## The life on the record',
    '',
    `Wikidata ${p.wikidata}${pr?.description ? `: ${pr.description}` : ''}. Born: ${place(pr?.born ?? null)}. Died: ${place(pr?.died ?? null)}.`,
    '',
    '| Year | Place | Lat, Lon | What happened | Source | Status |',
    '|------|-------|----------|---------------|--------|--------|',
    '| | | | | | |',
    '',
    '## What they changed',
    '',
    'Two sentences: the change, for a reader who has never heard of them.',
    '',
    '## Influence in numbers',
    '',
    'At least 8 data points per series where possible.',
    '',
    '| Metric | Period or case | Value | Unit | Source |',
    '|--------|----------------|-------|------|--------|',
    ...hundredLensMetrics(s.lens.name).map((m) => `| ${m} | | | | |`),
    pr?.pageviews.length ? '' : '',
    pr?.pageviews.length ? `English Wikipedia views by month (Wikimedia, read ${pr.asOf.slice(0, 10)}): ${pr.pageviews.map((v) => `${v.month}: ${v.views}`).join(', ')}.` : '',
    pr?.sitelinks ? `Wikipedia editions with an article: ${pr.sitelinks}.` : '',
    '',
    `## Lens read: ${s.lens.name}`,
    '',
    `${s.lens.description} Applied to ${p.name}, not to ${s.domain.name.toLowerCase()} in general.`,
    '',
    '## The counter-case',
    '',
    'The strongest argument that the rank is too high or too low, from the record, and what the ranking leaves out.',
    '',
    '## Credit',
    '',
    hundredCreditLine(s),
  ].filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
}

/** The research MD a spin starts from. */
export function researchStub(spin: StubSpin): string {
  const meta = RANDOMIZER_META[spin.randomizer]
  const s = spin.subject
  const reels = Object.entries(spin.reels).map(([key, r]) => {
    const label = meta.reels.find((d) => d.key === key)?.label ?? key
    return `- ${label}: ${r.value}${r.sub ? ` (${r.sub})` : ''}`
  })
  const template =
    s.randomizer === 'desk'
      ? deskTemplate(s)
      : s.randomizer === 'atlas'
        ? atlasTemplate(s)
        : s.randomizer === 'footshorts'
          ? footshortsTemplate(s)
          : s.randomizer === 'viznba'
            ? viznbaTemplate(s)
            : s.randomizer === 'ocw'
              ? ocwTemplate(s)
              : s.randomizer === 'landmark'
                ? landmarkTemplate(s)
                : s.randomizer === 'hundred'
                  ? hundredTemplate(s)
                  : epicsTemplate(s)
  return [
    `# ${primaryName(spin)}: ${meta.name} research`,
    '',
    `File: ${researchFileName(spin)}`,
    `Spin: ${spin.id} · seed ${spin.seed} · ${spin.createdAt.slice(0, 10)}`,
    '',
    ...reels,
    '',
    '> Build the claims log first. Any figure, date or causal claim needs two independent sources, or one primary source',
    s.randomizer === 'footshorts'
      ? '> (official match data, a club or league statement, club accounts). Mark each claim Verified, Contested or'
      : s.randomizer === 'viznba'
        ? '> (an official box score, NBA.com stats, a team or league statement). Mark each claim Verified, Contested or'
        : s.randomizer === 'ocw'
          ? '> (the resource itself with its page or slide, a government statistic, a peer-reviewed paper). Mark each claim Verified, Contested or'
          : s.randomizer === 'landmark'
            ? '> (the work itself with its page or figure, the award\'s own documents, a peer-reviewed paper). Mark each claim Verified, Contested or'
            : s.randomizer === 'hundred'
              ? '> (a contemporary document, the original text, a scholarly biography, a census or survey). Mark each claim Verified, Contested or'
              : '> (government statistic, filing, peer-reviewed paper, original text). Mark each claim Verified, Contested or',
    '> Unverified. Unverified claims never reach the page or the script.',
    '',
    ...template,
    '',
    '## Claims log',
    '',
    '| # | Claim | Number or date | Source URL | Source type | Confidence | Status |',
    '|---|-------|----------------|------------|-------------|------------|--------|',
    '| 1 | | | | | | Unverified |',
    '',
    '## Fact, interpretation, speculation',
    '',
    '### Fact',
    '',
    '### Interpretation',
    '',
    '### Speculation',
    '',
    '## Gaps',
    '',
    'What I could not find. Gaps are part of the story.',
    '',
    `## ${HERO_INSIGHT_HEADING}`,
    '',
    HERO_PLACEHOLDER,
    '',
    'Supporting claims (claims log rows):',
    '1.',
    '2.',
    '3.',
    '',
  ].join('\n')
}

/**
 * The hero insight sentence from a research file: the first real line under
 * the HERO INSIGHT heading. Null while it is missing or still the placeholder.
 */
export function extractHeroInsight(markdown: string): string | null {
  const lines = markdown.split('\n')
  const start = lines.findIndex((l) => /^#{1,6}\s*hero insight\s*:?\s*$/i.test(l.trim()))
  if (start < 0) return null
  for (const raw of lines.slice(start + 1)) {
    const line = raw.trim()
    if (/^#{1,6}\s/.test(line)) break
    if (!line || line === HERO_PLACEHOLDER) continue
    if (/^supporting claims/i.test(line)) break
    const text = line.replace(/^(?:>\s*|[-*]\s+|\d+\.\s+)/, '').replace(/^\*\*(.*)\*\*$/, '$1').trim()
    return text || null
  }
  return null
}
