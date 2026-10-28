import type { CupFixture } from '@footshorts/shared/espnCups'
import type { EspnMatchDetail, EspnSideFacts, EspnTimelineEntry } from '@footshorts/shared/espnMatch'

/**
 * The HTML-story brief's context for domestic cup matches from the private
 * Cup fixtures import (admin_espn_cup_fixtures + the extracted ESPN match
 * detail): per match the scoreline, round, shootout and ESPN's notes, both
 * teams with crest and colour, ESPN's team statistics (or the counts derived
 * from the timeline when ESPN sent none), the timeline, the line-ups and the
 * commentary at the key moments. The cup analogue of buildMatchContext in
 * @vismay/content-source/footshortsMatchBrief, in the same markdown shape.
 *
 * Pure: the caller reads the rows (./espnCups buildCupMatchContext).
 */

export interface CupContextTeam {
  name: string
  crestUrl: string | null
  color: string | null
  /** The footshorts team page, when the ESPN name resolves to one of our teams. */
  pageUrl: string | null
}

export interface CupContextMatch {
  fixture: CupFixture
  cupName: string
  seasonLabel: string
  home: CupContextTeam
  away: CupContextTeam
  /** The extracted ESPN match detail; null until it has been extracted. */
  detail: EspnMatchDetail | null
}

/** Most commentary lines per match: the ones at the timeline's key minutes. */
const MAX_COMMENTARY = 30

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Not played yet',
  live: 'In play',
  finished: 'Full time',
  postponed: 'Postponed',
  cancelled: 'Cancelled',
  suspended: 'Suspended',
  unknown: 'Status unknown',
}

function played(f: CupFixture): boolean {
  return f.home_score != null && f.away_score != null
}

export function cupScoreline(f: CupFixture): string {
  if (!played(f)) return `${f.home_team_name} v ${f.away_team_name}`
  const pens =
    f.home_penalties != null && f.away_penalties != null ? ` (${f.home_penalties}–${f.away_penalties} pens)` : ''
  return `${f.home_team_name} ${f.home_score}–${f.away_score} ${f.away_team_name}${pens}`
}

function kickoffLine(f: CupFixture): string {
  if (!f.kickoff_at) return 'Date TBC'
  const d = new Date(f.kickoff_at)
  const date = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  if (!f.kickoff_time_confirmed) return `${date}, time TBC`
  return `${date}, ${d.toISOString().slice(11, 16)} UTC`
}

function teamLine(side: 'Home' | 'Away', t: CupContextTeam): string {
  const bits = [`**${side}: ${t.name}**`]
  if (t.color) bits.push(`colour ${t.color.startsWith('#') ? t.color : `#${t.color}`}`)
  if (t.crestUrl) bits.push(`crest ${t.crestUrl}`)
  if (t.pageUrl) bits.push(`team page ${t.pageUrl}`)
  return `- ${bits.join(' · ')}`
}

const FACT_ROWS: Array<[keyof Omit<EspnSideFacts, 'raw_stats'>, string, string?]> = [
  ['possession', 'Possession', '%'],
  ['shots', 'Shots'],
  ['shots_on_target', 'Shots on target'],
  ['corners', 'Corners'],
  ['fouls', 'Fouls'],
  ['offsides', 'Offsides'],
  ['saves', 'Saves'],
  ['passes', 'Passes'],
  ['pass_accuracy', 'Pass accuracy', '%'],
  ['yellow_cards', 'Yellow cards'],
  ['red_cards', 'Red cards'],
]

function factsTable(d: EspnMatchDetail, home: string, away: string): string[] {
  const rows: string[] = []
  if (d.facts) {
    for (const [key, label, unit = ''] of FACT_ROWS) {
      const h = d.facts.home[key]
      const a = d.facts.away[key]
      if (h == null && a == null) continue
      rows.push(`| ${label} | ${h ?? '—'}${h != null ? unit : ''} | ${a ?? '—'}${a != null ? unit : ''} |`)
    }
  } else {
    const h = d.derived.home
    const a = d.derived.away
    rows.push(`| Goals | ${h.goals} | ${a.goals} |`)
    if (h.penalties_scored || a.penalties_scored) rows.push(`| Penalties scored | ${h.penalties_scored} | ${a.penalties_scored} |`)
    if (h.penalties_missed || a.penalties_missed) rows.push(`| Penalties missed | ${h.penalties_missed} | ${a.penalties_missed} |`)
    rows.push(`| Yellow cards | ${h.yellow_cards} | ${a.yellow_cards} |`)
    rows.push(`| Red cards | ${h.red_cards} | ${a.red_cards} |`)
    rows.push(`| Substitutions | ${h.substitutions} | ${a.substitutions} |`)
  }
  if (!rows.length) return []
  return [`| | ${home} | ${away} |`, '| --- | --- | --- |', ...rows]
}

const TIMELINE_KINDS = new Set(['goal', 'own-goal', 'penalty-goal', 'penalty-missed', 'yellow-card', 'red-card', 'substitution', 'var'])

function timelineLine(e: EspnTimelineEntry): string {
  const team = e.team_name ? ` (${e.team_name})` : ''
  const who = e.player ? ` — ${e.player}` : ''
  const second = e.secondary ? (e.kind === 'substitution' ? ` replaces ${e.secondary}` : ` (assist: ${e.secondary})`) : ''
  return `- ${e.clock_label || '?'}${team} ${e.label}${who}${second}`
}

function lineupLines(name: string, l: { formation: string | null; starters: { name: string; jersey: string | null; position: string | null; subbed_out: boolean }[]; bench: { name: string; subbed_in: boolean }[] }): string[] {
  if (!l.starters.length) return []
  const xi = l.starters.map((p) => `${p.name}${p.position ? ` (${p.position})` : ''}${p.subbed_out ? ' ↓' : ''}`).join(', ')
  const on = l.bench.filter((p) => p.subbed_in).map((p) => p.name)
  return [
    `- **${name}**${l.formation ? ` (${l.formation})` : ''}: ${xi}.${on.length ? ` On from the bench: ${on.join(', ')}.` : ''}`,
  ]
}

/** Commentary at the minutes the timeline marks, in match order, capped. */
function commentaryLines(d: EspnMatchDetail): string[] {
  const keyClocks = new Set(d.timeline.filter((e) => TIMELINE_KINDS.has(e.kind)).map((e) => e.clock_label))
  return d.commentary
    .filter((c) => keyClocks.has(c.clock_label))
    .sort((a, b) => a.sequence - b.sequence)
    .slice(0, MAX_COMMENTARY)
    .map((c) => `- ${c.clock_label}: ${c.text}`)
}

export function formatCupMatchContext(matches: CupContextMatch[], { prompt }: { prompt?: string } = {}): string {
  if (!matches.length) throw new Error('no cup matches')
  const ordered = [...matches].sort((a, b) => (a.fixture.kickoff_at ?? '').localeCompare(b.fixture.kickoff_at ?? ''))
  const cups = Array.from(new Set(ordered.map((m) => m.cupName)))
  const lines: string[] = []
  lines.push(
    ordered.length === 1
      ? `# Cup match context — ${cupScoreline(ordered[0]!.fixture)} (${cups[0]})`
      : `# Cup match context — ${ordered.length} matches (${cups.join(', ')})`,
  )
  lines.push('')
  if (prompt?.trim()) {
    lines.push(`> **Editorial focus:** ${prompt.trim()}`)
    lines.push('')
  }
  lines.push(
    'These domestic cup matches come from ESPN (its scoreboard and match summary), imported into ' +
      'footshorts’ private admin tables. Use the scores, minutes and names verbatim. Times are UTC. ' +
      'There is no footshorts match page for them: do not link one. Where a section is missing, ESPN ' +
      'did not send it or the match detail has not been extracted — write around the gap rather than ' +
      'filling it.',
  )
  lines.push('')

  for (const m of ordered) {
    const f = m.fixture
    const d = m.detail
    lines.push(`## ${cupScoreline(f)}`)
    lines.push('')
    const status = STATUS_LABEL[f.status] ?? f.status
    lines.push(
      [
        `${m.cupName} ${m.seasonLabel}${f.round_label ? `, ${f.round_label}` : ''}`,
        kickoffLine(f),
        f.status_detail && f.status_detail !== status ? `${status} (${f.status_detail})` : status,
        f.venue ?? d?.venue ?? '',
      ]
        .filter(Boolean)
        .join(' · ') + '.',
    )
    const extra = [
      d?.attendance != null ? `Attendance ${d.attendance.toLocaleString('en-GB')}` : '',
      d?.referee ? `Referee ${d.referee}` : '',
    ].filter(Boolean)
    if (extra.length) lines.push(`${extra.join(' · ')}.`)
    for (const note of f.notes ?? []) lines.push(`ESPN note: ${note}`)
    lines.push('')

    lines.push('### Teams')
    lines.push('')
    lines.push(teamLine('Home', m.home))
    lines.push(teamLine('Away', m.away))
    lines.push('')

    if (!d) {
      lines.push(
        f.status === 'finished'
          ? '_The ESPN match detail has not been extracted for this match: only the scoreline and round above are known._'
          : '_Not played yet: a preview. Only the tie, the date and the venue above are known._',
      )
      lines.push('')
      continue
    }

    const facts = factsTable(d, m.home.name, m.away.name)
    if (facts.length) {
      lines.push(d.facts ? '### Match facts (ESPN team statistics)' : '### Match counts (from the timeline)')
      lines.push('')
      if (!d.facts) {
        lines.push('_ESPN sent no team statistics for this match (usual for cup ties): these counts are read off the timeline._')
        lines.push('')
      }
      lines.push(...facts)
      lines.push('')
    }

    const timeline = d.timeline.filter((e) => TIMELINE_KINDS.has(e.kind))
    if (timeline.length) {
      lines.push('### Timeline')
      lines.push('')
      lines.push('_Every goal, penalty, card, substitution and VAR call, in match order._')
      lines.push('')
      for (const e of timeline) lines.push(timelineLine(e))
      lines.push('')
    }
    if (f.home_penalties != null && f.away_penalties != null) {
      lines.push(
        `_Decided on penalties, ${f.home_penalties}–${f.away_penalties}. ESPN does not list the kicks: do not name takers._`,
      )
      lines.push('')
    }

    if (d.lineups) {
      const xi = [...lineupLines(m.home.name, d.lineups.home), ...lineupLines(m.away.name, d.lineups.away)]
      if (xi.length) {
        lines.push('### Line-ups')
        lines.push('')
        lines.push('_Starters (↓ = substituted off), then the substitutes who came on._')
        lines.push('')
        lines.push(...xi)
        lines.push('')
      }
    }

    const commentary = commentaryLines(d)
    if (commentary.length) {
      lines.push('### Commentary on the key moments')
      lines.push('')
      lines.push('_ESPN’s live commentary at the minutes the timeline records an event. Paraphrase; never present it as someone’s quoted words._')
      lines.push('')
      lines.push(...commentary)
      lines.push('')
    }
  }

  lines.push('## Sources')
  lines.push('')
  lines.push('- Cup fixtures, scores, timeline, line-ups and commentary: ESPN (scoreboard and match summary).')
  lines.push('')
  return lines.join('\n')
}
