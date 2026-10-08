/**
 * The research file a spin starts (playbook 0.2, 0.3, 4): reel results
 * pre-filled, the right template (editorial, geography or epic), an empty
 * claims log, and the HERO INSIGHT section everything public is written from.
 * Footshorts spins get a football template: the news, the match record from
 * the snapshot, the table, the angle read and the data pull. NBA Desk spins
 * get the same in basketball terms: the game log and the standings.
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
