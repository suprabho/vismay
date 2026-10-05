/**
 * Build a "match brief" for one or more fixtures — a per-match fact sheet (the
 * full Opta stat set) plus the event timeline, with embedded `fs:` viz
 * directives. This is fed to the compose pipeline as a SOURCE: the model
 * (steered by the footshorts pack) places fs:match-card / fs:match-timeline
 * layers, and the fs graft (story-pipeline graftSectionBody) swaps in the exact
 * config the brief carries — so the model never invents a scoreline, a minute,
 * or a scorer.
 *
 * The fact sheet is what lets a story say WHY a result happened (17 shots for
 * 1.8 xG is a different story from 4 shots for 1.8 xG); the timeline is the
 * order those beats happened in; and Opta's own INSIGHTS say what the match
 * means against the rest of the season — the one thing none of our other
 * sources can derive ("Valencia have attempted 22 shots in this game, their
 * highest total in a single match in the Primera División this season").
 *
 * OPTA FACTS, COMPOSE-WIDE: the match-centre scraper promotes 13 labels to
 * `opta_match_facts` columns and banks every OTHER label the six Opta stat
 * tables reported into `raw_stats` (see migration 20260824000001). The admin
 * Match facts tab reads the columns alone; this brief expands `raw_stats` too,
 * so composing gets the whole stat set — shots off target, blocks, duels,
 * tackles, saves, crosses, whatever that match's page carried — with no
 * re-scrape and no new surface to break when a label is renamed.
 *
 * Mirrors @vismay/f1-viz's telemetry brief (the vizf1 analogue) in shape and in
 * role: markdown in, markdown out, every figure sourced from our own tables.
 * SERVER-ONLY — the readers it calls use the service-role Supabase client.
 */

import {
  buildMatchCardBlock,
  buildMatchTimelineBlock,
  type EventTypeFilter,
  type FixtureEventInput,
  type FixtureRowInput,
} from './footshortsBlocks'
import {
  fetchCompetitionNames,
  fetchFixtureEvents,
  fetchFixturesByIds,
  fetchMatchFacts,
  fetchMatchStories,
  type MatchFactsRow,
  type MatchStoryRow,
} from './footshortsData'

/** Most matches one brief covers — past this the per-source prompt budget
 *  (12k chars in story-pipeline's prompts.ts) starts truncating the fences. */
export const MAX_BRIEF_MATCHES = 6

/**
 * Up to this many matches get the deep-dive treatment — the whole ~40-label Opta
 * stat set, every insight, the full timeline. Past it the brief keeps the core
 * facts, the top insights and the decisive events, which is what a round-up is
 * actually written from.
 *
 * ONE, not two: measured against real fixtures, a two-match deep dive ran to
 * 17k of prose against the 12k per-source cap (prompts.ts), so the second
 * match's facts were silently truncated away. A single match comes in at ~8.6k.
 */
const FULL_STAT_SET_MAX_MATCHES = 1

/** Insight cards per match on a one- or two-match deep dive. Opta already
 *  self-selects these as notable, so the cap is about prompt budget. */
const MAX_INSIGHTS = 12
/** …and across a round-up, where six matches' worth would eat the budget alone.
 *  At 4/8 a six-match brief measured 11.8k of prose against the 12k per-source
 *  cap — correct but with no headroom, so one wordier match would truncate the
 *  last one's facts. 3/6 leaves ~3k of slack. */
const MAX_INSIGHTS_ROUNDUP = 3
/** Timeline bullets per match in a round-up; a deep dive prints the lot. */
const MAX_TIMELINE_ROUNDUP = 6
/** Commentary lines per match. The raw feed runs to ~100 cards (far past the
 *  whole per-source budget), so only the lines on a timeline-event minute are
 *  kept — the beats a story is actually built from, with the detail the event
 *  row can't carry ("BLOCK! … Jon Aramburu was on hand"). */
const MAX_COMMENTARY = 10

/** Optional editorial focus that steers the brief before it grounds a story. */
export interface MatchBriefFocus {
  /** Editorial intent — surfaced at the top of the brief and read by every pass. */
  prompt?: string
  /** Narrows the `fs:match-timeline` block the graft will apply. */
  eventFilter?: EventTypeFilter
}

/**
 * One-line JSON: the prose passes cap each source at 12k chars, and pretty-
 * printed fences spend that budget on whitespace before the facts. `type` is
 * dropped — the info-string is authoritative and `parseDirectiveBody`
 * back-fills it, exactly as the recap worker's `fsFence` does.
 */
function fence(type: string, cfg: Record<string, unknown>): string {
  const { type: _drop, ...body } = cfg
  return '```' + type + '\n' + JSON.stringify(body) + '\n```'
}

const EN_DASH = '–'

/** Title-case a slug as a last-resort competition name. */
function slugName(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function sideName(f: FixtureRowInput, side: 'home' | 'away'): string {
  return (
    (side === 'home' ? f.home?.name ?? f.home_team_name : f.away?.name ?? f.away_team_name) ?? 'TBD'
  )
}

/** "Arsenal 2 – 1 Chelsea" for a played match, "Arsenal v Chelsea" otherwise. */
function scoreline(f: FixtureRowInput): string {
  const home = sideName(f, 'home')
  const away = sideName(f, 'away')
  const played = f.status === 'finished' && f.home_score != null && f.away_score != null
  return played ? `${home} ${f.home_score} ${EN_DASH} ${f.away_score} ${away}` : `${home} v ${away}`
}

/** "Saturday 12 April 2026, 14:00 UTC" — UTC so the brief is deterministic. */
function kickoffLine(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`
}

const STATUS_LABEL: Record<string, string> = {
  finished: 'full time',
  live: 'in progress',
  scheduled: 'not yet played',
  postponed: 'postponed',
  cancelled: 'cancelled',
}

function fmt(n: number | null | undefined, suffix = ''): string {
  if (n == null) return '—'
  const v = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
  return `${v}${suffix}`
}

/** A "value (secondary)" cell — "17 (7)" for shots (on target), "612 (89.4%)"
 *  for passes (accuracy). Either half may be missing. */
function pairCell(
  primary: number | null,
  secondary: number | null,
  secondarySuffix = '',
): string {
  if (primary == null && secondary == null) return '—'
  if (secondary == null) return fmt(primary)
  if (primary == null) return `— (${fmt(secondary, secondarySuffix)})`
  return `${fmt(primary)} (${fmt(secondary, secondarySuffix)})`
}

/**
 * The modeled-column fact table — the 13 promoted Opta stats, home vs away,
 * with the "of which" pairs folded into one cell so the table reads like a
 * match report rather than a column dump.
 */
function factsTable(home: MatchFactsRow, away: MatchFactsRow, homeName: string, awayName: string): string[] {
  const all: Array<[string, string, string]> = [
    ['Expected goals (xG)', fmt(home.xg), fmt(away.xg)],
    ['Shots (on target)', pairCell(home.shots, home.shots_on_target), pairCell(away.shots, away.shots_on_target)],
    ['Possession', fmt(home.possession, '%'), fmt(away.possession, '%')],
    ['Passes (accuracy)', pairCell(home.passes, home.pass_accuracy, '%'), pairCell(away.passes, away.pass_accuracy, '%')],
    ['Big chances (missed)', pairCell(home.big_chances, home.big_chances_missed), pairCell(away.big_chances, away.big_chances_missed)],
    ['Corners', fmt(home.corners), fmt(away.corners)],
    ['Fouls conceded', fmt(home.fouls), fmt(away.fouls)],
    ['Yellow / red cards', `${fmt(home.yellow_cards)} / ${fmt(home.red_cards)}`, `${fmt(away.yellow_cards)} / ${fmt(away.red_cards)}`],
    ['Offsides', fmt(home.offsides), fmt(away.offsides)],
  ]
  // Drop a stat neither side reported, so a thin scrape reads as a short table
  // rather than a wall of em-dashes.
  const rows = all.filter(([, h, a]) => h !== '—' || a !== '—')
  if (rows.length === 0) return []
  const lines = [`| Stat | ${homeName} | ${awayName} |`, '|---|---|---|']
  for (const [label, h, a] of rows) lines.push(`| ${label} | ${h} | ${a} |`)
  return lines
}

/**
 * Labels whose value is a RATE, not a count. The scraper strips the page's `%`
 * sign (parseStatNumber keeps digits only), so "Crossing accuracy 5.3" would
 * otherwise read as five completed crosses. These put the unit back.
 */
const PERCENT_LABEL = /\(%\)|accuracy|proportion|success rate|\brate\b/i

/**
 * The REST of what Opta reported — every `raw_stats` label the scraper didn't
 * promote to a column, union of both sides, alphabetical. This is the
 * compose-only expansion: the same scrape, read in full.
 *
 * Values are printed as Opta reported them, with `%` restored on the labels
 * that name themselves a rate. Opta also reports some *shares* under
 * count-shaped labels ("Aerial duels won 57.7" is a percentage, "Corners won 8"
 * is a count) and the stored number can't tell them apart — hence the caution
 * line the caller prints above this table rather than a guessed unit.
 */
function extraFactsTable(
  home: MatchFactsRow,
  away: MatchFactsRow,
  homeName: string,
  awayName: string,
): string[] {
  const labels = Array.from(
    new Set([...Object.keys(home.raw_stats ?? {}), ...Object.keys(away.raw_stats ?? {})]),
  ).sort((a, b) => a.localeCompare(b))
  if (labels.length === 0) return []
  const lines = [`| Stat | ${homeName} | ${awayName} |`, '|---|---|---|']
  for (const label of labels) {
    const suffix = PERCENT_LABEL.test(label) ? '%' : ''
    const h = home.raw_stats?.[label]
    const a = away.raw_stats?.[label]
    // Opta's own label spelling, capitalised for the table's first column.
    const title = label.charAt(0).toUpperCase() + label.slice(1)
    lines.push(`| ${title} | ${fmt(h ?? null, suffix)} | ${fmt(a ?? null, suffix)} |`)
  }
  return lines
}

/** An event as one timeline bullet: "45+2' — Yellow Card, Chelsea: Reece James". */
function eventLine(e: FixtureEventInput, homeName: string, awayName: string): string {
  const minute = e.extra_minute ? `${e.minute}+${e.extra_minute}'` : `${e.minute}'`
  const team = e.side === 'home' ? homeName : e.side === 'away' ? awayName : null
  const what = e.detail ?? (e.type === 'subst' ? 'Substitution' : e.type)
  const who = e.player_name ?? ''
  // On a substitution `assist_name` is the player coming ON, not an assister.
  const second =
    e.assist_name == null
      ? ''
      : e.type === 'subst'
        ? ` — ${e.assist_name} on`
        : ` (assist: ${e.assist_name})`
  const subject = e.type === 'subst' && who ? `${who} off` : who
  return `- ${minute} — ${what}${team ? `, ${team}` : ''}${subject ? `: ${subject}` : ''}${second}`
}

/** The empty-side stand-in, so the table renderer can assume two rows. */
function emptyFacts(fixtureId: string, side: 'home' | 'away'): MatchFactsRow {
  return {
    fixture_id: fixtureId,
    side,
    xg: null,
    shots: null,
    shots_on_target: null,
    possession: null,
    passes: null,
    pass_accuracy: null,
    big_chances: null,
    big_chances_missed: null,
    corners: null,
    fouls: null,
    yellow_cards: null,
    red_cards: null,
    offsides: null,
    raw_stats: null,
  }
}

/** "90+6'" / "26'" / "" for the build-up cards. */
function clock(minute: number | null, extra: number | null): string {
  if (minute == null) return ''
  return extra ? `${minute}+${extra}'` : `${minute}'`
}

/**
 * Opta's INSIGHTS for a match — the season-context lines ("Valencia have
 * attempted 22 shots in this game, their highest total in a single match in the
 * Primera División this season"). These are the single most valuable thing the
 * match centre carries for a story: they're the only source we hold that knows
 * what a match means against the rest of the season, and they're pre-written as
 * standalone facts. Newest first, as the page orders them.
 */
function insightLines(
  stories: MatchStoryRow[],
  homeName: string,
  awayName: string,
  cap: number,
): string[] {
  const picks = stories.filter((c) => c.kind === 'insight').slice(0, cap)
  if (picks.length === 0) return []
  return picks.map((c) => {
    const team = c.side === 'home' ? homeName : c.side === 'away' ? awayName : null
    const at = clock(c.minute, c.extra_minute)
    const prefix = [at, team].filter(Boolean).join(' ')
    return `- ${prefix ? `**${prefix}** — ` : ''}${c.body}`
  })
}

/**
 * The commentary lines worth carrying: those on a minute the timeline already
 * records an event for. The feed is a full play-by-play — dumping it would
 * spend the whole per-source budget on one match — but the lines ALONGSIDE a
 * goal, card or substitution are exactly the colour the event row lacks.
 */
function commentaryLines(
  stories: MatchStoryRow[],
  events: FixtureEventInput[],
  homeName: string,
  awayName: string,
): string[] {
  if (events.length === 0) return []
  const eventMinutes = new Set(events.map((e) => e.minute))
  const picks = stories
    .filter((c) => c.kind === 'commentary' && c.minute != null && eventMinutes.has(c.minute))
    .slice(0, MAX_COMMENTARY)
  if (picks.length === 0) return []
  return picks.map((c) => {
    const team = c.side === 'home' ? homeName : c.side === 'away' ? awayName : null
    const prefix = [clock(c.minute, c.extra_minute), team].filter(Boolean).join(' ')
    return `- ${prefix ? `**${prefix}** — ` : ''}${c.body}`
  })
}

/** Pre-match insights + the match preview — build-up context, for a fixture
 *  that hasn't been played (or a story that wants the framing). */
function previewLines(stories: MatchStoryRow[]): string[] {
  return stories
    .filter((c) => c.kind === 'pre_match_insight' || c.kind === 'match_preview')
    .map((c) => `- ${c.body}`)
}

/** The competition line a match sits under — "Premier League · matchday 35". */
function competitionLine(f: FixtureRowInput, name: string): string {
  if (f.stage && f.stage !== 'REGULAR_SEASON' && f.stage !== 'LEAGUE_STAGE') {
    const stage = f.stage
      .toLowerCase()
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
    return `${name} · ${stage}`
  }
  if (f.matchday != null) return `${name} · matchday ${f.matchday}`
  return name
}

/**
 * Build the brief. `fixtureIds` are the matches the compose picker ticked, in
 * any order (the brief emits them in kickoff order); more than
 * {@link MAX_BRIEF_MATCHES} are dropped so the fences survive the prompt budget.
 *
 * Throws only when no fixture resolves — a match with neither Opta facts nor
 * events still earns its section (the scoreline and the match card are real).
 */
export async function buildMatchBrief(
  fixtureIds: string[],
  focus: MatchBriefFocus = {},
): Promise<string> {
  const ids = Array.from(new Set(fixtureIds.filter(Boolean))).slice(0, MAX_BRIEF_MATCHES)
  if (ids.length === 0) throw new Error('buildMatchBrief: no fixture ids')

  const fixtures = await fetchFixturesByIds(ids)
  if (fixtures.length === 0) throw new Error('buildMatchBrief: no such fixtures')

  const resolved = fixtures.map((f) => f.id)
  const [factRows, names, storyRows, ...eventLists] = await Promise.all([
    fetchMatchFacts(resolved),
    fetchCompetitionNames(fixtures.map((f) => f.competition_slug)),
    fetchMatchStories(resolved),
    ...resolved.map((id) => fetchFixtureEvents(id)),
  ])

  const factsBy = new Map<string, { home: MatchFactsRow | null; away: MatchFactsRow | null }>()
  for (const row of factRows) {
    const slot = factsBy.get(row.fixture_id) ?? { home: null, away: null }
    slot[row.side] = row
    factsBy.set(row.fixture_id, slot)
  }
  const eventsBy = new Map<string, FixtureEventInput[]>()
  resolved.forEach((id, i) => {
    eventsBy.set(id, eventLists[i] ?? [])
  })
  const storiesBy = new Map<string, MatchStoryRow[]>()
  for (const c of storyRows) {
    const list = storiesBy.get(c.fixture_id)
    if (list) list.push(c)
    else storiesBy.set(c.fixture_id, [c])
  }

  const compName = (f: FixtureRowInput) =>
    names.get(f.competition_slug) ?? slugName(f.competition_slug)
  const filter = focus.eventFilter && focus.eventFilter !== 'all' ? focus.eventFilter : undefined
  const withFullStatSet = fixtures.length <= FULL_STAT_SET_MAX_MATCHES

  const lines: string[] = []

  // ── Header ────────────────────────────────────────────────────────────────
  const single = fixtures.length === 1
  const comps = Array.from(new Set(fixtures.map((f) => compName(f))))
  lines.push(
    single
      ? `# Match brief — ${scoreline(fixtures[0]!)} (${comps[0]})`
      : `# Match brief — ${fixtures.length} matches (${comps.join(', ')})`,
  )
  lines.push('')
  lines.push(
    single
      ? `${competitionLine(fixtures[0]!, comps[0]!)} · ${kickoffLine(fixtures[0]!.kickoff_at)}.`
      : `${fixtures.length} matches from ${comps.join(', ')}, in kickoff order.`,
  )
  lines.push('')

  // Editorial intent (the picker's text prompt) — steers angle/outline/section
  // generation; the model reads it as part of this source.
  if (focus.prompt && focus.prompt.trim()) {
    lines.push(`> **Editorial focus:** ${focus.prompt.trim()}`)
    lines.push('')
  }

  lines.push(
    'Match-data brief. Every figure below comes from footshorts’ own match tables — the Opta ' +
      'match-centre stat set, the event timeline, and Opta’s own insights and commentary. Use ' +
      'these numbers and minutes verbatim; never ' +
      'round a scoreline, invent a scorer, or attribute a goal to a minute the timeline does not ' +
      'carry. Ready-made `fs:` visual blocks for every match are collected at the END of this ' +
      'brief: place an fs:match-card or fs:match-timeline layer where a beat calls for one and ' +
      'the app swaps in that match\'s real config.',
  )
  lines.push('')

  // ── One section per match ─────────────────────────────────────────────────
  for (const f of fixtures) {
    const homeName = sideName(f, 'home')
    const awayName = sideName(f, 'away')
    const name = compName(f)
    const facts = factsBy.get(f.id) ?? { home: null, away: null }
    const events = eventsBy.get(f.id) ?? []

    lines.push(`## ${scoreline(f)}`)
    lines.push('')
    lines.push(
      [competitionLine(f, name), kickoffLine(f.kickoff_at), STATUS_LABEL[f.status] ?? f.status]
        .filter(Boolean)
        .join(' · ') + '.',
    )
    lines.push('')

    const home = facts.home ?? emptyFacts(f.id, 'home')
    const away = facts.away ?? emptyFacts(f.id, 'away')
    const core = factsTable(home, away, homeName, awayName)
    if (core.length) {
      lines.push('### Match facts')
      lines.push('')
      lines.push(...core)
      lines.push('')
    } else {
      lines.push(
        '_No Opta match facts for this fixture — the match centre has not been scraped for it. ' +
          'Build this beat on the scoreline and the timeline only._',
      )
      lines.push('')
    }

    // The full stat set runs to ~40 labels per match. It's the point of a
    // one- or two-match deep dive, but across a round-up it would spend the
    // per-source budget (12k chars, story-pipeline prompts.ts) before the later
    // matches' fences — which the graft needs — ever reach the model.
    const extra = withFullStatSet ? extraFactsTable(home, away, homeName, awayName) : []
    if (extra.length) {
      lines.push('### Opta — full stat set')
      lines.push('')
      lines.push(
        '_Everything else the Opta match centre reported for this match, in its own labels. ' +
          'Use these for the specific claim a beat makes (blocks, duels, tackles, crosses) rather ' +
          'than listing them. Some are percentages: a figure is a SHARE wherever the two sides ' +
          'add up to 100 (aerial duels won, duels success rate) — never write one of those as a ' +
          'count of actions._',
      )
      lines.push('')
      lines.push(...extra)
      lines.push('')
    }

    if (events.length) {
      // A round-up gets the decisive beats; a deep dive gets the whole timeline.
      const shown = withFullStatSet ? events : events.slice(0, MAX_TIMELINE_ROUNDUP)
      lines.push('### Timeline')
      lines.push('')
      for (const e of shown) lines.push(eventLine(e, homeName, awayName))
      if (shown.length < events.length) {
        lines.push(`- _…and ${events.length - shown.length} further event(s)._`)
      }
      lines.push('')
    }

    const stories = storiesBy.get(f.id) ?? []
    // Opta's own insights — always worth the budget, even in a round-up: they
    // are the only season context in the brief, and each is a standalone fact.
    const insights = insightLines(
      stories,
      homeName,
      awayName,
      withFullStatSet ? MAX_INSIGHTS : MAX_INSIGHTS_ROUNDUP,
    )
    if (insights.length) {
      lines.push('### Opta insights')
      lines.push('')
      lines.push(
        '_Opta\'s own notes on what this match means against the rest of the season. Each is a ' +
          'complete, checked fact — quote one rather than deriving your own season claim, which ' +
          'the tables above cannot support._',
      )
      lines.push('')
      lines.push(...insights)
      lines.push('')
    }
    // Commentary is the play-by-play; only the lines on an event minute earn
    // their place, and only in a deep dive (see withFullStatSet).
    const commentary = withFullStatSet ? commentaryLines(stories, events, homeName, awayName) : []
    if (commentary.length) {
      lines.push('### Commentary on the key moments')
      lines.push('')
      lines.push(
        '_Opta\'s live commentary for the minutes the timeline above records an event — the ' +
          'detail behind each beat. Paraphrase; never quote it as someone\'s words._',
      )
      lines.push('')
      lines.push(...commentary)
      lines.push('')
    }
    // Build-up cards: only meaningful for a match that hasn't been played.
    if (f.status !== 'finished') {
      const preview = previewLines(stories)
      if (preview.length) {
        lines.push('### Before the match')
        lines.push('')
        lines.push(...preview)
        lines.push('')
      }
    }

    lines.push(
      'Visuals available for this match: an `fs:match-card` (the result card)' +
        (events.length
          ? ' and an `fs:match-timeline` (its goals, cards and substitutions).'
          : '.') +
        ' Both are collected at the end of this brief.',
    )
    lines.push('')
  }

  // ── Visual blocks, LAST ────────────────────────────────────────────────
  // A timeline fence embeds every event inline, so interleaving the blocks per
  // match pushed most of them past the prose passes' 12k per-source cap — a
  // six-match brief landed only 4 of its 12 blocks inside the budget, and the
  // graft had nothing to fill the later sections with. The graft reads the FULL
  // source text rather than the truncated prompt, so from down here every block
  // still lands while the facts the model actually reads stay inside the budget.
  // (@vismay/f1-viz's telemetry brief parks its position-chart series last for
  // exactly this reason.)
  lines.push('## Visual blocks')
  lines.push('')
  lines.push(
    'Ready-made configs, one group per match. Place the layer where the beat belongs and the app ' +
      'swaps in the exact config below — for `fs:match-timeline` emit `events: []` and the real ' +
      'events are filled in. Never quote a fixture id or any other identifier from these in prose.',
  )
  lines.push('')
  for (const f of fixtures) {
    const homeName = sideName(f, 'home')
    const awayName = sideName(f, 'away')
    const events = eventsBy.get(f.id) ?? []
    lines.push(`### ${scoreline(f)}`)
    lines.push('')
    // `layout` is left out, as the recap worker's card fence is — the graft
    // REPLACES a layer's whole config (only caption/title survive), so a layout
    // here would override whatever the model chose for the beat. Omitted, the
    // card falls back to the module default, `score`: the result card, which is
    // what a match brief is nearly always about.
    const { layout: _layout, ...card } = buildMatchCardBlock(f, { competitionName: compName(f) })
    lines.push(fence('fs:match-card', card))
    lines.push('')
    if (events.length) {
      // `home`/`away` are carried PAST the module (parseConfig ignores them) so
      // the fs graft can tell one match's timeline from another's: a timeline
      // config is otherwise just an events array, and graftSectionBody scores a
      // directive against the section's prose by exactly these fields. Without
      // them a 2-match brief grafts the first timeline into every section.
      lines.push(
        fence('fs:match-timeline', {
          home: homeName,
          away: awayName,
          ...buildMatchTimelineBlock(events, { filter: filter ?? 'all' }),
        }),
      )
      lines.push('')
    }
  }

  return lines.join('\n')
}
