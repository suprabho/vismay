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

import { fixtureSummary, footshortsAngleMetrics, gameSummary, researchFileName, researchStub, viznbaAngleMetrics } from './stub'
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

export type BriefSpin = Pick<
  SpinRecord,
  'id' | 'seed' | 'randomizer' | 'subject' | 'createdAt' | 'reels' | 'status' | 'heroInsight' | 'researchMd'
>

/** Research is done and nothing public waits on a human any more. */
function insightReady(spin: BriefSpin): boolean {
  if (!spin.heroInsight) return false
  return spin.status === 'approved' || spin.status === 'published' || !RANDOMIZER_META[spin.randomizer].gated
}

function deskAssignment(s: DeskSubject): string[] {
  const out = [
    `- Industry: ${s.industry.name}`,
    `- Sub-industry: ${s.sub.name} (heat ${s.sub.heat})`,
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
  const s = spin.subject
  if (s.randomizer === 'footshorts') return footshortsFormat(s)
  if (s.randomizer === 'viznba') return viznbaFormat(s)
  return s.randomizer === 'desk' ? deskFormat() : s.randomizer === 'atlas' ? atlasFormat(s) : epicsFormat(s)
}

/** Extra bullets for the brief's Charts section. */
export function chartRules(spin: BriefSpin): string[] {
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
    spin.randomizer === 'desk' || spin.randomizer === 'footshorts' || spin.randomizer === 'viznba'
      ? 'Every chart has a takeaway title, units and a source.'
      : 'Every place has a status label.',
    ...(spin.randomizer === 'footshorts' ? ['Every score, minute and stat matches the match context; no rumour is stated as fact.'] : []),
    ...(spin.randomizer === 'viznba' ? ['Every score and stat line matches the box scores; no rumour is stated as fact.'] : []),
    'Contested claims are labelled and both sides stated fairly.',
    'The first 3 seconds of the script open on the surprising claim.',
    'No em dashes. No unverified claims on the page or in the script.',
  ]
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
