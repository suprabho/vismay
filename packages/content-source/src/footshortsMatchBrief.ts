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
import type { StandingRowInput } from './footshortsBlocks'
import {
  fetchCompetitionNames,
  fetchFixtureEvents,
  fetchFixturesByIds,
  fetchMatchFacts,
  fetchMatchStories,
  fetchStandingsFromDb,
  fetchTeamSchedules,
  fetchUpcomingCompetitionFixtures,
  type FixtureSchedules,
  type MatchFactsRow,
  type MatchStoryRow,
  type TeamSchedule,
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
  cap = MAX_COMMENTARY,
): string[] {
  if (events.length === 0) return []
  const eventMinutes = new Set(events.map((e) => e.minute))
  const picks = stories
    .filter((c) => c.kind === 'commentary' && c.minute != null && eventMinutes.has(c.minute))
    .slice(0, cap)
  if (picks.length === 0) return []
  return picks.map((c) => {
    const team = c.side === 'home' ? homeName : c.side === 'away' ? awayName : null
    const prefix = [clock(c.minute, c.extra_minute), team].filter(Boolean).join(' ')
    return `- ${prefix ? `**${prefix}** — ` : ''}${c.body}`
  })
}

/** Pre-match insights + the match preview — build-up context, for a fixture
 *  that hasn't been played (or a story that wants the framing). */
function previewLines(stories: MatchStoryRow[], cap = Infinity): string[] {
  return stories
    .filter((c) => c.kind === 'pre_match_insight' || c.kind === 'match_preview')
    .slice(0, cap)
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

// ═══════════════════════════════════════════════════════════════════════════
// Match CONTEXT — the HTML-story flavour of the brief
// ═══════════════════════════════════════════════════════════════════════════
//
// Same tables, different reader. The compose brief above is tuned for the
// story pipeline: `fs:` fences for the graft and hard caps so six matches fit a
// 12k-character per-source prompt budget. An HTML story has neither — the
// agent reads the whole thing once and designs its own page — so this one
// carries everything a match can tell: the full Opta stat set for EVERY
// match, the whole timeline, every insight, the commentary on the key moments,
// the build-up cards, and what the compose brief leaves out altogether: each
// team's form coming in and schedule after, the league table, and the
// competition's next fixtures. No fences, no identifiers in prose except the
// public URLs the page should link to.

/** Insight cards per match — effectively all of them; Opta rarely writes more. */
const CONTEXT_MAX_INSIGHTS = 40
/** Commentary lines on timeline-event minutes per match. */
const CONTEXT_MAX_COMMENTARY = 30
/** Build-up cards (match preview + pre-match insights) per match. */
const CONTEXT_MAX_PREVIEW = 12
/** Each team's results before / fixtures after the match. */
const CONTEXT_SCHEDULE_LIMIT = 6
/** The competition's next fixtures after the latest match in the brief. */
const CONTEXT_NEXT_UP = 10
/**
 * Most matches one context covers: a club's whole run across competitions, or
 * several matchdays. The compose brief's {@link MAX_BRIEF_MATCHES} (6) guards
 * the story pipeline's 12k-per-source prompt budget; an HTML story has no such
 * budget — the agent reads the whole thing once — so the costs here are the
 * reads (one events query per match, one schedule query per team, one table
 * per competition) and the brief's length: a fully scraped match runs to
 * roughly 10k characters, so forty is on the order of 100k tokens.
 */
export const MAX_CONTEXT_MATCHES = 40

export interface MatchContextOptions {
  /** Editorial intent — surfaced at the top so the agent writes to it. */
  prompt?: string
  /** The footshorts site, for the match and team links. Default https://footshorts.com. */
  siteUrl?: string
}

/** "Sat 20 Sep" — UTC, deterministic. */
function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`
}

/** "20:00 UTC" */
function shortTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`
}

/** W / D / L from one team's point of view, or '' before the match is played. */
function resultLetter(f: FixtureRowInput, teamSlug: string | null | undefined): string {
  if (!teamSlug || f.status !== 'finished' || f.home_score == null || f.away_score == null) return ''
  const isHome = f.home?.slug === teamSlug
  const isAway = f.away?.slug === teamSlug
  if (!isHome && !isAway) return ''
  const mine = isHome ? f.home_score : f.away_score
  const theirs = isHome ? f.away_score : f.home_score
  return mine > theirs ? 'W' : mine < theirs ? 'L' : 'D'
}

/** One schedule row: "Sat 20 Sep · Premier League · Arsenal 2 – 0 Tottenham (W)". */
function scheduleLine(
  f: FixtureRowInput,
  teamSlug: string | null | undefined,
  compName: (f: FixtureRowInput) => string,
): string {
  const played = f.status === 'finished' && f.home_score != null && f.away_score != null
  const letter = resultLetter(f, teamSlug)
  const when = played ? shortDate(f.kickoff_at) : `${shortDate(f.kickoff_at)}, ${shortTime(f.kickoff_at)}`
  const status = !played && f.status !== 'scheduled' ? ` (${STATUS_LABEL[f.status] ?? f.status})` : ''
  return `- ${when} · ${compName(f)} · ${scoreline(f)}${letter ? ` (${letter})` : ''}${status}`
}

function teamLines(f: FixtureRowInput, site: string): string[] {
  const out: string[] = []
  for (const side of ['home', 'away'] as const) {
    const ref = side === 'home' ? f.home : f.away
    const name = sideName(f, side)
    const bits = [`**${name}** (${side})`]
    if (ref?.crest_url) bits.push(`crest: ${ref.crest_url}`)
    if (ref?.primary_color) bits.push(`colour: \`${ref.primary_color}\``)
    if (ref?.slug) bits.push(`footshorts page: ${site}/team/${ref.slug}`)
    out.push(`- ${bits.join(' · ')}`)
  }
  return out
}

function scheduleSection(
  f: FixtureRowInput,
  schedules: FixtureSchedules | undefined,
  compName: (f: FixtureRowInput) => string,
): string[] {
  if (!schedules) return []
  const lines: string[] = []
  for (const side of ['home', 'away'] as const) {
    const s: TeamSchedule | null = schedules[side]
    if (!s) continue
    const name = sideName(f, side)
    const slug = s.team?.slug ?? (side === 'home' ? f.home?.slug : f.away?.slug)
    if (s.recent.length === 0 && s.upcoming.length === 0) continue
    lines.push(`**${name}**`)
    lines.push('')
    if (s.recent.length) {
      const form = s.recent
        .map((r) => resultLetter(r, slug))
        .filter(Boolean)
        .reverse()
        .join(' ')
      lines.push(`Coming in${form ? ` (form, oldest first: ${form})` : ''}:`)
      lines.push('')
      for (const r of s.recent) lines.push(scheduleLine(r, slug, compName))
      lines.push('')
    }
    if (s.upcoming.length) {
      lines.push('Next up:')
      lines.push('')
      for (const r of s.upcoming) lines.push(scheduleLine(r, slug, compName))
      lines.push('')
    }
  }
  return lines
}

/**
 * The league table, with the match's two teams marked. For a group phase only
 * the groups the two teams sit in are printed; a league table is printed whole
 * (20 rows is what a table story needs).
 */
function standingsSection(
  rows: StandingRowInput[],
  f: FixtureRowInput,
  compName: string,
): string[] {
  if (rows.length === 0) return []
  const mine = new Set([f.home?.slug, f.away?.slug].filter(Boolean) as string[])
  const groups = new Map<string, StandingRowInput[]>()
  for (const r of rows) {
    const key = r.group_label ?? ''
    const list = groups.get(key)
    if (list) list.push(r)
    else groups.set(key, [r])
  }
  const lines: string[] = []
  for (const [label, list] of groups) {
    if (label && !list.some((r) => mine.has(r.team?.slug ?? r.team_id))) continue
    lines.push(`**${label ? `${compName} · ${label}` : compName}**${label ? '' : ' (full table)'}`)
    lines.push('')
    lines.push('| # | Team | P | W | D | L | GF | GA | GD | Pts | Form |')
    lines.push('|---|---|---|---|---|---|---|---|---|---|---|')
    for (const r of list) {
      const slug = r.team?.slug ?? r.team_id
      const name = r.team?.name ?? slugName(r.team_id)
      const mark = mine.has(slug) ? ' ◀' : ''
      const gd = r.goal_difference > 0 ? `+${r.goal_difference}` : String(r.goal_difference)
      lines.push(
        `| ${r.position} | ${name}${mark} | ${r.played} | ${r.won} | ${r.draw} | ${r.lost} | ${r.goals_for} | ${r.goals_against} | ${gd} | ${r.points} | ${r.form ?? ''} |`,
      )
    }
    lines.push('')
  }
  if (lines.length) lines.push('_◀ marks the teams in this match. Form is the last five, oldest first, as the source reports it._', '')
  return lines
}

/**
 * Build the match context for an HTML-story brief. Same entry contract as
 * {@link buildMatchBrief}: `fixtureIds` in any order, emitted in kickoff order,
 * capped at {@link MAX_CONTEXT_MATCHES}; throws only when no fixture resolves.
 *
 * SERVER-ONLY (service-role reads).
 */
export async function buildMatchContext(
  fixtureIds: string[],
  { prompt, siteUrl = 'https://footshorts.com' }: MatchContextOptions = {},
): Promise<string> {
  const site = siteUrl.replace(/\/$/, '')
  const ids = Array.from(new Set(fixtureIds.filter(Boolean))).slice(0, MAX_CONTEXT_MATCHES)
  if (ids.length === 0) throw new Error('buildMatchContext: no fixture ids')

  const fixtures = await fetchFixturesByIds(ids)
  if (fixtures.length === 0) throw new Error('buildMatchContext: no such fixtures')
  const resolved = fixtures.map((f) => f.id)

  // One standings read per competition+season, and the competition's next
  // fixtures after the latest match in the brief.
  const compSeasons = Array.from(new Set(fixtures.map((f) => `${f.competition_slug}::${f.season}`)))
  const latestKickoff = fixtures.reduce((m, f) => (f.kickoff_at > m ? f.kickoff_at : m), fixtures[0]!.kickoff_at)

  const [factRows, storyRows, schedules, standingsList, nextUpList, ...eventLists] = await Promise.all([
    fetchMatchFacts(resolved),
    fetchMatchStories(resolved),
    fetchTeamSchedules(resolved, { limit: CONTEXT_SCHEDULE_LIMIT }),
    Promise.all(
      compSeasons.map(async (key) => {
        const [slug, season] = key.split('::') as [string, string]
        return [key, await fetchStandingsFromDb(slug, season).catch(() => [] as StandingRowInput[])] as const
      }),
    ),
    Promise.all(
      compSeasons.map(async (key) => {
        const [slug, season] = key.split('::') as [string, string]
        return [key, await fetchUpcomingCompetitionFixtures(slug, season, latestKickoff, CONTEXT_NEXT_UP).catch(() => [])] as const
      }),
    ),
    ...resolved.map((id) => fetchFixtureEvents(id)),
  ])
  const standingsBy = new Map(standingsList)
  const nextUpBy = new Map(nextUpList)

  // Competition names for everything the context mentions — the matches, both
  // teams' schedules (other competitions), and the next-up list.
  const compSlugs = new Set<string>(fixtures.map((f) => f.competition_slug))
  for (const s of schedules.values()) {
    for (const side of [s.home, s.away]) {
      for (const f of [...(side?.recent ?? []), ...(side?.upcoming ?? [])]) compSlugs.add(f.competition_slug)
    }
  }
  const names = await fetchCompetitionNames(Array.from(compSlugs))
  const compName = (f: FixtureRowInput) => names.get(f.competition_slug) ?? slugName(f.competition_slug)

  const factsBy = new Map<string, { home: MatchFactsRow | null; away: MatchFactsRow | null }>()
  for (const row of factRows) {
    const slot = factsBy.get(row.fixture_id) ?? { home: null, away: null }
    slot[row.side] = row
    factsBy.set(row.fixture_id, slot)
  }
  const eventsBy = new Map<string, FixtureEventInput[]>()
  resolved.forEach((id, i) => eventsBy.set(id, eventLists[i] ?? []))
  const storiesBy = new Map<string, MatchStoryRow[]>()
  for (const c of storyRows) {
    const list = storiesBy.get(c.fixture_id)
    if (list) list.push(c)
    else storiesBy.set(c.fixture_id, [c])
  }

  const lines: string[] = []
  const single = fixtures.length === 1
  const comps = Array.from(new Set(fixtures.map(compName)))
  lines.push(
    single
      ? `# Match context — ${scoreline(fixtures[0]!)} (${comps[0]})`
      : `# Match context — ${fixtures.length} matches (${comps.join(', ')})`,
  )
  lines.push('')
  lines.push(
    single
      ? `${competitionLine(fixtures[0]!, comps[0]!)} · ${kickoffLine(fixtures[0]!.kickoff_at)}.`
      : `${fixtures.length} matches from ${comps.join(', ')}, in kickoff order.`,
  )
  lines.push('')
  if (prompt && prompt.trim()) {
    lines.push(`> **Editorial focus:** ${prompt.trim()}`)
    lines.push('')
  }
  lines.push(
    'Every figure below comes from footshorts’ own match tables: the Opta match-centre stat set, ' +
      'the event timeline, Opta’s own insights and commentary (all via theanalyst.com), and the ' +
      'fixtures and standings (via football-data.org). Use the numbers, minutes and names verbatim. ' +
      'Times are UTC. Where a section is missing, that data was never captured for the match — ' +
      'write around the gap rather than filling it.',
  )
  lines.push('')

  for (const f of fixtures) {
    const homeName = sideName(f, 'home')
    const awayName = sideName(f, 'away')
    const name = compName(f)
    const facts = factsBy.get(f.id) ?? { home: null, away: null }
    const events = eventsBy.get(f.id) ?? []
    const stories = storiesBy.get(f.id) ?? []

    lines.push(`## ${scoreline(f)}`)
    lines.push('')
    lines.push(
      [competitionLine(f, name), kickoffLine(f.kickoff_at), STATUS_LABEL[f.status] ?? f.status, f.venue ?? '']
        .filter(Boolean)
        .join(' · ') + '.',
    )
    lines.push('')
    lines.push(`Footshorts match page: ${site}/match/${f.id}`)
    lines.push('')

    lines.push('### Teams')
    lines.push('')
    lines.push(...teamLines(f, site))
    lines.push('')

    const home = facts.home ?? emptyFacts(f.id, 'home')
    const away = facts.away ?? emptyFacts(f.id, 'away')
    const core = factsTable(home, away, homeName, awayName)
    if (core.length) {
      lines.push('### Match facts')
      lines.push('')
      lines.push(...core)
      lines.push('')
    } else if (f.status === 'finished') {
      lines.push(
        '_No Opta match facts for this fixture — the match centre has not been scraped for it. ' +
          'Build this match on the scoreline, the timeline and the schedule context only._',
      )
      lines.push('')
    }

    const extra = extraFactsTable(home, away, homeName, awayName)
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
      lines.push('### Timeline')
      lines.push('')
      lines.push(
        '_Every goal, card and substitution, in match order. "assist:" names the assister; on a ' +
          'substitution the first name goes off and the second comes on._',
      )
      lines.push('')
      for (const e of events) lines.push(eventLine(e, homeName, awayName))
      lines.push('')
    }

    const insights = insightLines(stories, homeName, awayName, CONTEXT_MAX_INSIGHTS)
    if (insights.length) {
      lines.push('### Opta insights')
      lines.push('')
      lines.push(
        '_Opta\'s own notes on what this match means against the rest of the season, newest first. ' +
          'Each is a complete, checked fact — quote one rather than deriving your own season claim, ' +
          'which the tables above cannot support._',
      )
      lines.push('')
      lines.push(...insights)
      lines.push('')
    }

    const commentary = commentaryLines(stories, events, homeName, awayName, CONTEXT_MAX_COMMENTARY)
    if (commentary.length) {
      lines.push('### Commentary on the key moments')
      lines.push('')
      lines.push(
        '_Opta\'s live commentary for the minutes the timeline records an event — the detail ' +
          'behind each beat, newest first. Paraphrase; never present it as someone\'s quoted words._',
      )
      lines.push('')
      lines.push(...commentary)
      lines.push('')
    }

    const preview = previewLines(stories, CONTEXT_MAX_PREVIEW)
    if (preview.length) {
      lines.push('### Before the match')
      lines.push('')
      lines.push('_The build-up as Opta framed it before kick-off: the preview and pre-match insights._')
      lines.push('')
      lines.push(...preview)
      lines.push('')
    }

    const sched = scheduleSection(f, schedules.get(f.id), compName)
    if (sched.length) {
      lines.push('### Form and schedule')
      lines.push('')
      lines.push(
        '_Each side\'s matches in the weeks either side of this one, across every competition we ' +
          'hold. Results are read from that team\'s point of view._',
      )
      lines.push('')
      lines.push(...sched)
    }

    const table = standingsSection(standingsBy.get(`${f.competition_slug}::${f.season}`) ?? [], f, name)
    if (table.length) {
      lines.push('### Table')
      lines.push('')
      lines.push(
        '_The standings as last ingested — they may already include this result; check played ' +
          'counts before saying what the match changed._',
      )
      lines.push('')
      lines.push(...table)
    }
  }

  // The competition's next fixtures, once per competition.
  for (const key of compSeasons) {
    const next = nextUpBy.get(key) ?? []
    if (next.length === 0) continue
    const [slug] = key.split('::') as [string, string]
    lines.push(`## Next up in ${names.get(slug) ?? slugName(slug)}`)
    lines.push('')
    for (const f of next) lines.push(scheduleLine(f, null, compName))
    lines.push('')
  }

  lines.push('## Sources')
  lines.push('')
  lines.push('- Match facts, insights and commentary: Opta, via the theanalyst.com match centre.')
  lines.push('- Fixtures, results, schedules and standings: football-data.org.')
  lines.push(`- Match pages: ${site}/match/<id> (linked above); team pages: ${site}/team/<slug>.`)
  lines.push('')

  return lines.join('\n')
}
