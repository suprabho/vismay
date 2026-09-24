/**
 * Build a "telemetry brief" for one session — a race fact sheet plus the
 * session's key telemetry moments, with embedded `f1:` viz directives. This is
 * fed to the compose pipeline as a SOURCE: the model (steered by the F1 pack)
 * places f1:telemetry-clip / f1:track-3d / f1:position-chart layers, and the f1
 * graft (story-pipeline graftSectionBody, namespace 'f1') swaps in the exact
 * config the brief carries — so the model never invents session keys, lap
 * windows, or position series.
 *
 * The fact sheet (result, safety-car windows, pit stops, position series) is
 * what lets a story say WHY the order changed; the moments are the beats worth
 * a clip. Editorial focus RANKS moments (drivers, constructors, prompt
 * keywords) — it never deletes the race-defining ones.
 *
 * Pure: takes a Supabase client + sessionKey (+ optional editorial focus) and
 * returns markdown — no client construction, no other I/O. Lives in
 * @vismay/f1-viz behind the server-only `./telemetry-brief` subpath (NOT the
 * package barrel) so browser/render bundles never pull it; the worker CLI and
 * the admin compose route both call it.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  abbr,
  analyseRace,
  deriveSignals,
  positionAt,
  type DriverRow,
  type LapRow,
  type RaceAnalysis,
  type Signal,
  type SignalKind,
  type StintRow,
} from './signals'

const MAX_CLIPS = 5
/** No more than this many clips of one kind — keeps the moments varied. */
const MAX_PER_KIND = 2
/** PostgREST caps a response at 1000 rows; a full race is ~1,250 lap rows. */
const LAP_PAGE = 1000
/** Lanes in the position chart when no drivers are in focus. */
const DEFAULT_LANES = 6

/** Optional editorial focus that steers the brief before it grounds a story. */
export interface BriefFocus {
  /** Rank moments involving these car numbers first; chart their positions. */
  driverNumbers?: number[]
  /** Same, for every driver on these constructors (teamName or teamId). */
  constructors?: string[]
  /** Editorial intent — surfaced at the top of the brief and used to rank moments. */
  prompt?: string
}

/** Session-roster entry — DriverRow (used by signals) plus team id + colour. */
interface BriefDriver extends DriverRow {
  teamId?: string
  teamColour?: string
  headshotUrl?: string | null
  firstName?: string
  lastName?: string
}

interface SessionResult {
  driverNumber: number
  abbreviation?: string
  position: number | null
  classifiedPosition?: string | null
  status?: string | null
  points?: number | null
  dnf?: boolean
  q1TimeSec?: number | null
  q2TimeSec?: number | null
  q3TimeSec?: number | null
}

interface SessionRow {
  session_key: string
  season: number
  round: number | null
  session_type: string
  session_name: string | null
  gp_name: string | null
  circuit_name: string | null
  drivers: BriefDriver[] | null
  stints: StintRow[] | null
  session_results: SessionResult[] | null
}

/** One-line JSON: the prose passes cap each source at 12k chars, and pretty-
 *  printed fences spent that budget on whitespace before the key moments. */
function fence(type: string, cfg: Record<string, unknown>): string {
  return '```' + type + '\n' + JSON.stringify(cfg) + '\n```'
}

function clipFence(sessionKey: string, s: Signal): string {
  return fence('f1:telemetry-clip', {
    sessionKey,
    lapFrom: s.lapFrom,
    lapTo: s.lapTo,
    driverNumbers: s.driverNumbers.slice(0, 3),
    focalDriverNumber: s.focalDriverNumber,
    caption: s.title,
  })
}

/** Car numbers in focus = explicit drivers ∪ drivers on the named constructors. */
function focusDriverNumbers(drivers: BriefDriver[], focus: BriefFocus): Set<number> {
  const set = new Set<number>(focus.driverNumbers ?? [])
  const wanted = (focus.constructors ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean)
  if (wanted.length) {
    for (const d of drivers) {
      const team = (d.teamName ?? '').toLowerCase()
      const id = (d.teamId ?? '').toLowerCase()
      if ((team && wanted.includes(team)) || (id && wanted.includes(id))) set.add(d.driverNumber)
    }
  }
  return set
}

/** Prompt words that pull a kind of moment up the ranking. */
const PROMPT_KIND_HINTS: Array<[RegExp, SignalKind[]]> = [
  [/\b(vsc|safety.?car|sc|caution|neutrali[sz]ed)\b/i, ['neutralised_pit']],
  [/\b(pit|stop|strateg|undercut|overcut|box)/i, ['neutralised_pit', 'pit_window']],
  [/\b(lead|win|victory|leader)/i, ['lead_change', 'neutralised_pit']],
  [/\b(stuck|behind|team.?orders?|held up|train)/i, ['stuck_behind']],
  [/\b(battle|fight|overtak|duel|hunt)/i, ['close_battle', 'stuck_behind']],
  [/\b(tyre|tire|deg|graining|wear)/i, ['tyre_deg']],
  [/\b(pace|fastest|quick)/i, ['fastest_lap', 'pace_drop']],
]

/**
 * Re-rank (never filter) signals for the editorial focus: a moment involving a
 * focus driver, a driver the prompt names, or a kind the prompt asks about
 * moves up. The race-defining moments stay in the brief either way.
 */
function rankForFocus(
  signals: Signal[],
  focusSet: Set<number>,
  drivers: BriefDriver[],
  prompt: string,
): Signal[] {
  const named = new Set<number>()
  const p = prompt.toLowerCase()
  if (p) {
    for (const d of drivers) {
      const words = [d.abbreviation, d.lastName, d.fullName?.split(' ').pop()]
        .filter((w): w is string => !!w && w.length >= 3)
        .map((w) => w.toLowerCase())
      if (words.some((w) => new RegExp(`\\b${w}\\b`).test(p))) named.add(d.driverNumber)
    }
  }
  const kinds = new Set<SignalKind>()
  for (const [re, ks] of PROMPT_KIND_HINTS) if (re.test(prompt)) ks.forEach((k) => kinds.add(k))
  const touches = (s: Signal, set: Set<number>) => s.driverNumbers.some((n) => set.has(n))
  const wanted = new Set([...focusSet, ...named])
  // A moment made up entirely of the drivers the editor asked about (e.g. a
  // head-to-head between both focus cars) beats one that merely includes one.
  const all = (s: Signal) => wanted.size > 0 && s.driverNumbers.every((n) => wanted.has(n))
  const score = (s: Signal) =>
    s.priority +
    (touches(s, focusSet) ? 0.3 : 0) +
    (touches(s, named) ? 0.2 : 0) +
    (all(s) && s.driverNumbers.length > 1 ? 0.2 : 0) +
    (kinds.has(s.kind) ? 0.25 : 0)
  return [...signals].sort((a, b) => score(b) - score(a))
}

async function fetchLaps(sb: SupabaseClient, sessionKey: string): Promise<LapRow[]> {
  const out: LapRow[] = []
  for (let from = 0; ; from += LAP_PAGE) {
    const { data, error } = await sb
      .from('vizf1_telemetry_laps')
      .select('driver_number, lap, lap_time_sec, sectors, compound, min_gap_to_ahead_m, avg_speed, position, events')
      .eq('session_key', sessionKey)
      .order('lap', { ascending: true })
      .order('driver_number', { ascending: true })
      .range(from, from + LAP_PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as LapRow[]
    out.push(...rows)
    if (rows.length < LAP_PAGE) return out
  }
}

const fmtTime = (s: number | null | undefined) => {
  if (s == null) return '—'
  const m = Math.floor(s / 60)
  const sec = (s - m * 60).toFixed(3).padStart(6, '0')
  return m > 0 ? `${m}:${sec}` : sec
}

function driverName(drivers: BriefDriver[], dn: number): string {
  const d = drivers.find((x) => x.driverNumber === dn)
  if (!d) return `#${dn}`
  const first = d.firstName ?? ''
  const last = d.lastName ?? d.fullName ?? ''
  return `${first} ${last}`.trim() || abbr(drivers, dn)
}

function resultTable(s: SessionRow, drivers: BriefDriver[], a: RaceAnalysis | null, isRace: boolean): string[] {
  const results = (s.session_results ?? []).slice()
  if (results.length === 0) return []
  results.sort((x, y) => (x.position ?? 99) - (y.position ?? 99))
  const lines: string[] = []
  if (isRace) {
    lines.push('| Pos | Driver | Team | After lap 1 | Status | Pts |')
    lines.push('|---|---|---|---|---|---|')
    for (const r of results) {
      const d = drivers.find((x) => x.driverNumber === r.driverNumber)
      const lap1 = a ? positionAt(a, r.driverNumber, 1) : null
      const pos = r.position ?? (r.classifiedPosition && /^\d+$/.test(r.classifiedPosition) ? r.classifiedPosition : '—')
      lines.push(
        `| ${pos} | ${driverName(drivers, r.driverNumber)} (${abbr(drivers, r.driverNumber)}) | ${d?.teamName ?? ''} | ${lap1 ? `P${lap1}` : '—'} | ${r.status ?? ''} | ${r.points ?? 0} |`,
      )
    }
    lines.push('')
    lines.push('_"After lap 1" is the running order at the end of the opening lap — not the starting grid._')
  } else {
    lines.push('| Pos | Driver | Team | Q1 | Q2 | Q3 |')
    lines.push('|---|---|---|---|---|---|')
    for (const r of results) {
      const d = drivers.find((x) => x.driverNumber === r.driverNumber)
      lines.push(
        `| ${r.position ?? '—'} | ${driverName(drivers, r.driverNumber)} (${abbr(drivers, r.driverNumber)}) | ${d?.teamName ?? ''} | ${fmtTime(r.q1TimeSec)} | ${fmtTime(r.q2TimeSec)} | ${fmtTime(r.q3TimeSec)} |`,
      )
    }
  }
  return lines
}

/**
 * The cars the position chart draws: the focus drivers plus everyone in the
 * top two moments and the winner — or, with no focus, the top finishers.
 */
function laneDrivers(s: SessionRow, focusSet: Set<number>, a: RaceAnalysis, top: Signal[]): number[] {
  const finishers = (s.session_results ?? [])
    .filter((r) => r.position != null)
    .sort((x, y) => x.position! - y.position!)
    .map((r) => r.driverNumber)
  const order = finishers.length
    ? finishers
    : [...a.byDriver.keys()].sort((x, y) => (positionAt(a, x, a.totalLaps) ?? 99) - (positionAt(a, y, a.totalLaps) ?? 99))
  const lanes = new Set<number>()
  if (order[0] != null) lanes.add(order[0])
  focusSet.forEach((dn) => lanes.add(dn))
  for (const sig of top.slice(0, 2)) sig.driverNumbers.forEach((dn) => lanes.add(dn))
  for (const dn of order) {
    if (lanes.size >= DEFAULT_LANES) break
    lanes.add(dn)
  }
  // Draw in finishing order so the legend reads like the result.
  const rank = (dn: number) => {
    const i = order.indexOf(dn)
    return i < 0 ? 99 : i
  }
  return [...lanes].filter((dn) => a.byDriver.has(dn)).sort((x, y) => rank(x) - rank(y)).slice(0, 8)
}

/** Pit-table rows: the charted cars, the focus cars, and the top-10 finishers. */
function pitTableDrivers(s: SessionRow, focusSet: Set<number>, lanes: number[]): Set<number> {
  const set = new Set<number>([...focusSet, ...lanes])
  for (const r of s.session_results ?? []) if (r.position != null && r.position <= 10) set.add(r.driverNumber)
  return set
}

interface ChartWindow {
  lapFrom: number
  lapTo: number
  highlight: string[]
}

/**
 * An f1:position-chart block. Full race by default; with `win`, zoomed to that
 * lap range with the moment's drivers highlighted — the visual for an ORDER
 * moment (a pit cycle, a safety-car swing). Only the points the window needs
 * travel: the last one at/before its start (pins the opening position) and
 * everything inside it.
 */
function positionChartFence(
  s: SessionRow,
  drivers: BriefDriver[],
  a: RaceAnalysis,
  lanes: number[],
  win?: ChartWindow,
): string {
  const gp = s.gp_name || s.circuit_name || s.session_key
  const bands = a.windows
    .filter((w) => !win || (w.lapTo >= win.lapFrom && w.lapFrom <= win.lapTo))
    .map((w) => ({ from: w.lapFrom, to: w.lapTo, label: 'SC / VSC' }))
  return fence('f1:position-chart', {
    raceLabel: `${s.season} ${gp}`,
    totalLaps: a.totalLaps,
    ...(win
      ? { lapFrom: win.lapFrom, lapTo: win.lapTo, ...(win.highlight.length ? { highlight: win.highlight } : {}) }
      : {}),
    ...(bands.length ? { bands } : {}),
    lanes: lanes.map((dn) => {
      const d = drivers.find((x) => x.driverNumber === dn)
      const name = driverName(drivers, dn)
      // Only the laps either side of a position change (plus the first and
      // last). The chart draws straight lines between points, so keeping the
      // lap BEFORE each change holds a flat stint flat instead of drawing a
      // slow slide — at a fraction of the every-lap size.
      let points = (a.byDriver.get(dn) ?? [])
        .filter((l) => l.position != null)
        .filter(
          (l, i, arr) =>
            i === 0 ||
            i === arr.length - 1 ||
            l.position !== arr[i - 1]!.position ||
            l.position !== arr[i + 1]!.position,
        )
        .map((l) => ({ lap: l.lap, position: l.position as number }))
      if (win) {
        const before = points.filter((p) => p.lap <= win.lapFrom).at(-1)
        points = [...(before ? [before] : []), ...points.filter((p) => p.lap > win.lapFrom && p.lap <= win.lapTo)]
      }
      return {
        driverId: name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
        driverCode: d?.abbreviation ?? null,
        driverName: name,
        color: d?.teamColour ?? '#8e8e99',
        // End-of-line avatar; the chart falls back to a code monogram without it.
        headshotUrl: d?.headshotUrl ?? null,
        points,
      }
    }),
  })
}

/** Laps either side of an order moment, so the chart shows the before and after. */
const ORDER_PAD_BEFORE = 3
const ORDER_PAD_AFTER = 4
/** Most lines a zoomed chart draws — beyond this the swing gets lost. */
const ORDER_MAX_LANES = 6

/**
 * The zoomed chart for an ORDER moment: the window around it, and the cars
 * that ran at or ahead of the moment's drivers there (the group the swing
 * reshuffled), with the moment's own drivers highlighted.
 */
function orderChart(
  sig: Signal,
  a: RaceAnalysis,
  drivers: BriefDriver[],
): { lanes: number[]; win: ChartWindow } {
  const lapFrom = Math.max(1, sig.lapFrom - ORDER_PAD_BEFORE)
  const lapTo = Math.min(a.totalLaps, sig.lapTo + ORDER_PAD_AFTER)
  const bestIn = (dn: number) => {
    let best = Infinity
    for (let lap = lapFrom; lap <= lapTo; lap++) {
      const p = positionAt(a, dn, lap)
      if (p != null && p < best) best = p
    }
    return best
  }
  const worstFocus = Math.max(
    ...sig.driverNumbers.map((dn) => {
      let worst = 0
      for (let lap = lapFrom; lap <= lapTo; lap++) worst = Math.max(worst, positionAt(a, dn, lap) ?? 0)
      return worst
    }),
  )
  const group = [...a.byDriver.keys()]
    .map((dn) => ({ dn, best: bestIn(dn) }))
    .filter((x) => x.best <= worstFocus || sig.driverNumbers.includes(x.dn))
    .sort((x, y) => x.best - y.best)
  const lanes = [...new Set([...sig.driverNumbers, ...group.map((x) => x.dn)])].slice(0, ORDER_MAX_LANES)
  return {
    lanes,
    win: { lapFrom, lapTo, highlight: sig.driverNumbers.map((dn) => abbr(drivers, dn)) },
  }
}

export async function buildTelemetryBrief(
  sb: SupabaseClient,
  sessionKey: string,
  focus: BriefFocus = {},
): Promise<string> {
  const { data: sess, error: sErr } = await sb
    .from('vizf1_telemetry_sessions')
    .select('session_key, season, round, session_type, session_name, gp_name, circuit_name, drivers, stints, session_results')
    .eq('session_key', sessionKey)
    .maybeSingle()
  if (sErr) throw sErr
  if (!sess) throw new Error(`No telemetry session "${sessionKey}"`)
  const s = sess as SessionRow

  const laps = await fetchLaps(sb, sessionKey)
  const drivers = (s.drivers ?? []) as BriefDriver[]
  const stints = s.stints ?? []
  const focusSet = focusDriverNumbers(drivers, focus)
  const analysis = analyseRace(laps, stints)
  const isRace = /^(R|S)$/i.test(s.session_type) // race or sprint
  const signals = rankForFocus(
    deriveSignals(laps, stints, drivers, analysis),
    focusSet,
    drivers,
    focus.prompt ?? '',
  )

  const lanes = isRace && analysis.totalLaps > 1 ? laneDrivers(s, focusSet, analysis, signals) : []
  const gp = s.gp_name || s.circuit_name || sessionKey
  const sessionLabel = s.session_name || s.session_type
  const lines: string[] = []
  lines.push(`# Telemetry brief — ${gp} ${s.season} (${s.session_type})`)
  lines.push('')
  lines.push(
    [
      `${s.season} ${gp}`,
      s.round != null ? `round ${s.round}` : null,
      s.circuit_name ? `at ${s.circuit_name}` : null,
      sessionLabel,
      analysis.totalLaps ? `${analysis.totalLaps} laps` : null,
    ]
      .filter(Boolean)
      .join(' · ') + '.',
  )
  lines.push('')
  // Editorial intent (the picker's text prompt) — steers angle/outline/section
  // generation; the model reads it as part of this source.
  if (focus.prompt && focus.prompt.trim()) {
    lines.push(`> **Editorial focus:** ${focus.prompt.trim()}`)
    lines.push('')
  }
  lines.push(
    'Timing-data brief. Every figure below comes from the lap-by-lap timing feed. Pit-lane laps, ' +
      'the opening lap and safety-car/VSC laps are slow by design — never describe them as a driver ' +
      'losing pace. The fenced `f1:` blocks are ready-made visuals: when you place an f1:telemetry-clip, ' +
      'f1:track-3d or f1:position-chart layer, use one of these blocks exactly. Never quote session ' +
      'keys or other identifiers from the blocks in prose.',
  )
  lines.push('')

  const table = resultTable(s, drivers, laps.length ? analysis : null, isRace)
  if (table.length) {
    lines.push(`## ${isRace ? 'Result' : 'Classification'}`)
    lines.push('')
    lines.push(...table)
    lines.push('')
  }

  if (isRace && (analysis.windows.length || analysis.redFlagLaps.length)) {
    lines.push('## Safety car / VSC / red flag')
    lines.push('')
    if (analysis.windows.length) {
      lines.push(
        '_Timing data marks a safety car and a VSC the same way: call a neutralisation whatever the ' +
          'other sources call it, or just "the neutralisation" — never explain the data gap to readers._',
      )
      lines.push('')
    }
    for (const lap of analysis.redFlagLaps) {
      lines.push(
        `- Lap ${lap}: race suspended (red flag) — the whole field pitted and changed tyres; those are not strategic stops.`,
      )
    }
    for (const w of analysis.windows) {
      lines.push(
        `- ${w.lapFrom === w.lapTo ? `Lap ${w.lapFrom}` : `Laps ${w.lapFrom}–${w.lapTo}`}: race neutralised.`,
      )
    }
    lines.push('')
  }

  if (isRace && analysis.pitStops.length) {
    lines.push('## Pit stops')
    lines.push('')
    lines.push('| Driver | Lap | Tyres | Pit-lane loss | Under SC/VSC | Position before → after |')
    lines.push('|---|---|---|---|---|---|')
    const shown = pitTableDrivers(s, focusSet, lanes)
    const hidden = analysis.pitStops.filter((p) => !shown.has(p.driverNumber)).length
    for (const p of analysis.pitStops.filter((x) => shown.has(x.driverNumber))) {
      const before = positionAt(analysis, p.driverNumber, p.lap - 1)
      const after = positionAt(analysis, p.driverNumber, p.lap + 1)
      const tyres = [p.compoundFrom, p.compoundTo].filter(Boolean).map((c) => c!.toLowerCase()).join(' → ')
      lines.push(
        `| ${abbr(drivers, p.driverNumber)} | ${p.lap} | ${tyres || '—'} | ${p.lossSec != null ? `${p.lossSec.toFixed(1)}s` : '—'} | ${p.neutralised ? 'yes' : 'no'} | ${before ? `P${before}` : '—'} → ${after ? `P${after}` : '—'} |`,
      )
    }
    if (hidden) lines.push('', `_${hidden} further stop${hidden === 1 ? '' : 's'} by cars outside the top 10 omitted._`)
    lines.push('')
  }

  // One beat per event: an ORDER moment whose window overlaps one already
  // picked (the SC swing, the lead change it caused, the slow stop inside it)
  // folds its facts into that moment instead of repeating the same chart.
  const perKind = new Map<SignalKind, number>()
  const clips: Array<{ sig: Signal; also: string[] }> = []
  for (const sig of signals) {
    if (clips.length >= MAX_CLIPS) break
    if (sig.visual === 'order') {
      const host = clips.find(
        (c) => c.sig.visual === 'order' && c.sig.lapFrom <= sig.lapTo + 2 && sig.lapFrom <= c.sig.lapTo + 2,
      )
      if (host) {
        host.also.push(sig.detail)
        continue
      }
    }
    const n = perKind.get(sig.kind) ?? 0
    if (n >= MAX_PER_KIND) continue
    perKind.set(sig.kind, n + 1)
    clips.push({ sig, also: [] })
  }
  if (clips.length) {
    lines.push('## Key moments (most story-worthy first)')
    lines.push('')
    for (const { sig, also } of clips) {
      lines.push(`### ${sig.title}`)
      lines.push('')
      lines.push([sig.detail, ...also].join(' '))
      lines.push('')
      if (sig.visual === 'order' && isRace) {
        const { lanes: group, win } = orderChart(sig, analysis, drivers)
        lines.push(
          `Visual: the running order, laps ${win.lapFrom}–${win.lapTo} (a telemetry clip cannot show a pit call or a position change).`,
        )
        lines.push('')
        lines.push(positionChartFence(s, drivers, analysis, group, win))
      } else {
        lines.push(clipFence(sessionKey, sig))
      }
      lines.push('')
    }
  }

  if (lanes.length) {
    lines.push('## Position by lap')
    lines.push('')
    lines.push(
      `An f1:position-chart block (running order every lap for ${lanes.map((dn) => abbr(drivers, dn)).join(', ')}) ` +
        'closes this brief — the visual for any beat about how the order changed (pit cycles, safety ' +
        'car, overtakes).',
    )
    lines.push('')
  }

  // One immersive 3D lap, following the top-ranked moment's focal car.
  const lead = signals[0]
  if (lead) {
    lines.push(`## A lap around ${gp} in 3D`)
    lines.push('')
    lines.push(`An immersive pass of the circuit, following ${abbr(drivers, lead.focalDriverNumber)}.`)
    lines.push('')
    lines.push(
      fence('f1:track-3d', {
        sessionKey,
        focalDriverNumber: lead.focalDriverNumber,
        chaseCam: true,
        title: `${gp} — onboard`,
      }),
    )
    lines.push('')
  }

  // Last: the bulky series. The graft reads the full source, so it still lands
  // even when a prompt's per-source cap truncates this far down.
  if (lanes.length) {
    lines.push('## Position by lap — data')
    lines.push('')
    // An explicit whole-race window, so every chart block is identified by its
    // lap range and the graft can tell this one from a moment's zoomed chart.
    lines.push(
      positionChartFence(s, drivers, analysis, lanes, { lapFrom: 1, lapTo: analysis.totalLaps, highlight: [] }),
    )
    lines.push('')
  }

  return lines.join('\n')
}
