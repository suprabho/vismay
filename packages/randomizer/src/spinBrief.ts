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

import { researchFileName, researchStub } from './stub'
import { RANDOMIZER_META, type AtlasSubject, type DeskSubject, type EpicsSubject, type SpinRecord } from './types'

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

/** "## Your assignment": the spin, written as instructions. */
export function assignmentSection(spin: BriefSpin): string {
  const meta = RANDOMIZER_META[spin.randomizer]
  const s = spin.subject
  const body = s.randomizer === 'desk' ? deskAssignment(s) : s.randomizer === 'atlas' ? atlasAssignment(s) : epicsAssignment(s)
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
    : 'The Desk has no approval gate: once the hero insight is in the research file you can publish.'
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
  return [
    'Render the route as a map with D3-geo: the places from your route table as ordered points, joined by the path type you chose.',
    spin.randomizer === 'epics'
      ? 'Show each place\'s status (Verified, Claimed, Symbolic, Lost) as its marker style, with a legend. Symbolic places have no honest coordinates: list them beside the map instead of pinning them.'
      : 'Show each place\'s status (Documented, Contested, Inferred) as its marker style, with a legend.',
  ]
}

/** The Content section, replacing the generic one: the claims log raises the bar. */
export function contentSection(desk: string): string {
  return `## Content

- Every claim on the page traces to a Verified row in your claims log. Unverified claims stay off the page.
- Label contested claims as contested and state the major positions fairly.
- Keep fact, interpretation and speculation distinguishable on the page.
- End with a "Sources and claims log" section: the sources as links, and the claims log summarised (how many claims, how many verified, what stayed contested, what you could not find).
- Byline "${desk}" plus the date.
- Write plainly. No hype. Lead with the finding. No em dashes anywhere in the page.`
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
    spin.randomizer === 'desk'
      ? 'Every chart has a takeaway title, units and a source.'
      : 'Every place has a status label.',
    'Contested claims are labelled and both sides stated fairly.',
    'The first 3 seconds of the script open on the surprising claim.',
    'No em dashes. No unverified claims on the page or in the script.',
  ]
  return `Then the playbook's checklist:\n${items.map((i) => `- [ ] ${i}`).join('\n')}`
}

/** Extra lines for the Posting section: tie the page to the spin. */
export function postingLines(spin: BriefSpin): string {
  return `Tie the page to this spin so the log knows what shipped: pass \`spinId: "${spin.id}"\` to \`publish_html_story\`, or add \`&spin=${spin.id}\` to the HTTP publish URL.${
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
