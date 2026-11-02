import type { CupRun, RadarKey, TeamPack } from './spreadPack'

/**
 * The team template's computed geometry, in canvas points: everything on a
 * team spread that depends on the data rather than a fixed region. Pure, so
 * the moments and story players stay editable: a change re-routes the leaders
 * and re-places the labels on the next render.
 */

export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`

// ---------------------------------------------------------------------------
// Climb

/** Position range fitted to the club, an even span so the middle tick is a whole place. */
export function climbRange(positions: number[]): [number, number] {
  let lo = Math.min(...positions)
  let hi = Math.max(...positions)
  if ((hi - lo) % 2) { if (lo > 1) lo -= 1; else hi += 1 }
  if (hi - lo < 2) hi = lo + 2
  return [lo, hi]
}

// ---------------------------------------------------------------------------
// Calendar

const COL_STEP = 105.4
const MONTH_WIDTH = 77
const CELL_W = 11
const CELL_H = 8.5
const GRID_TOP = 442
const HEAD = 19
const ROW_GAP = 22

export interface CalendarMonth { month: string; col: number; x: number; y: number; first: number; days: number }

/** The ten months, Monday-first, five to a row; a row is as tall as its longest month. */
export function calendarMonths(months: string[]): CalendarMonth[] {
  const meta = months.map(m => {
    const [y, mm] = m.split('-').map(Number)
    const first = (new Date(Date.UTC(y, mm - 1, 1)).getUTCDay() + 6) % 7
    const days = new Date(Date.UTC(y, mm, 0)).getUTCDate()
    return { month: m, first, days, weeks: Math.ceil((first + days) / 7) }
  })
  const rowHeight = (row: number) => HEAD + Math.max(...meta.slice(row * 5, row * 5 + 5).map(m => m.weeks)) * CELL_H
  return meta.map((m, i) => {
    const row = Math.floor(i / 5)
    const y = GRID_TOP + (row ? rowHeight(0) + ROW_GAP : 0)
    return { month: m.month, col: i % 5, x: 40 + (i % 5) * COL_STEP, y, first: m.first, days: m.days }
  })
}

export function cellCentre(month: CalendarMonth, day: number): { x: number; y: number } {
  const idx = month.first + day - 1
  return { x: month.x + (idx % 7) * CELL_W + CELL_W / 2, y: month.y + HEAD + Math.floor(idx / 7) * CELL_H + CELL_H / 2 }
}

function dateCentre(date: string, months: CalendarMonth[]) {
  const m = months.find(c => c.month === date.slice(0, 7))
  return m ? { ...cellCentre(m, Number(date.slice(8, 10))), lower: m.y > GRID_TOP } : null
}

// ---------------------------------------------------------------------------
// Key-moment leaders

export interface Leader { date: string; x: number; y: number; d: string; bad: boolean }

type Seg = [number, number, number, number]

const overlaps = (a: Seg, b: Seg) =>
  Math.max(Math.min(a[0], a[2]), Math.min(b[0], b[2])) - 0.01 <= Math.min(Math.max(a[0], a[2]), Math.max(b[0], b[2])) + 0.01
  && Math.max(Math.min(a[1], a[3]), Math.min(b[1], b[3])) - 0.01 <= Math.min(Math.max(a[1], a[3]), Math.max(b[1], b[3])) + 0.01

function permutations<T>(items: T[]): T[][] {
  if (items.length < 2) return [items]
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [x, ...rest]))
}

/**
 * Orthogonal leaders from each moment's ring to its text column: sideways to a
 * gap between months, or straight down from the lower row, then along a lane.
 * Moments read left to right by ring so the leaders never cross; the search
 * takes the shortest arrangement that clears every other ring and match mark.
 */
export function routeLeaders(dates: string[], matchDays: string[], months: CalendarMonth[]): Leader[] {
  const rings = dates.flatMap(date => { const c = dateCentre(date, months); return c ? [{ date, ...c }] : [] }).sort((a, b) => a.x - b.x)
  if (!rings.length) return []
  const n = rings.length
  const columns = rings.map((_, i) => 40 + i * (527 / n) + 8)
  const lanes = [616, 622, 628, 634].slice(0, n)
  const gaps = [...[0, 1, 2, 3].flatMap(c => [6.5, 13, 19.5].map(g => 40 + c * COL_STEP + MONTH_WIDTH + g)), 36, 30, 545, 551]
  const marks = matchDays.filter(d => !dates.includes(d)).flatMap(d => dateCentre(d, months) ?? [])
  const options = rings.map(r => {
    const near = [...gaps].sort((a, b) => Math.abs(a - r.x) - Math.abs(b - r.x)).slice(0, 6).map(x => ({ down: false, x }))
    return r.lower ? [{ down: true, x: r.x }, ...near] : near
  })

  type Choice = { down: boolean; x: number }
  let best: { cost: number; choice: Choice[]; lanes: number[] } | null = null
  const lanePerms = permutations(lanes)
  const walk = (i: number, picked: Choice[]) => {
    if (i < n) { for (const o of options[i]) if (picked.every(p => Math.abs(p.x - o.x) >= 5.5)) walk(i + 1, [...picked, o]); return }
    let hits = 0
    const stems: Seg[][] = picked.map((o, k) => {
      const r = rings[k]
      if (o.down) {
        hits += marks.filter(m => Math.abs(m.x - r.x) < 3.5 && m.y > r.y).length
        return [[r.x, r.y + 5, r.x, 0]]
      }
      const sx = o.x > r.x ? r.x + 5 : r.x - 5
      hits += marks.filter(m => Math.abs(m.y - r.y) < 1 && Math.min(sx, o.x) - 3.5 < m.x && m.x < Math.max(sx, o.x) + 3.5).length
      return [[sx, r.y, o.x, r.y], [o.x, r.y, o.x, 0]]
    })
    for (const lane of lanePerms) {
      const paths = stems.map((stem, k) => [...stem.map(s => (s[3] === 0 ? [s[0], s[1], s[2], lane[k]] as Seg : s)), [picked[k].x, lane[k], columns[k], lane[k]] as Seg, [columns[k], lane[k], columns[k], 640] as Seg])
      let bad = 0
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        bad += paths[a].reduce((sum, s) => sum + paths[b].filter(t => overlaps(s, t)).length, 0)
        for (const [ring, path] of [[rings[b], paths[a]], [rings[a], paths[b]]] as const) {
          bad += path.filter(q => Math.min(q[0], q[2]) - 5.2 < ring.x && ring.x < Math.max(q[0], q[2]) + 5.2 && Math.min(q[1], q[3]) - 5.2 < ring.y && ring.y < Math.max(q[1], q[3]) + 5.2).length
        }
      }
      const cost = bad * 10000 + hits * 400 + picked.reduce((sum, o, k) => sum + Math.abs(o.x - columns[k]) * 0.6 + (lane[k] - 616) * 0.05, 0)
      if (!best || cost < best.cost) best = { cost, choice: picked, lanes: lane }
    }
  }
  walk(0, [])
  if (!best) return rings.map(r => ({ date: r.date, x: r.x, y: r.y, d: '', bad: true }))
  const { choice, lanes: lane, cost } = best as { cost: number; choice: Choice[]; lanes: number[] }
  return rings.map((r, k) => {
    const o = choice[k]
    const d = o.down
      ? `M${r.x.toFixed(1)} ${(r.y + 5).toFixed(2)} V${lane[k]} H${columns[k].toFixed(1)} V640`
      : `M${(o.x > r.x ? r.x + 5 : r.x - 5).toFixed(1)} ${r.y.toFixed(2)} H${o.x.toFixed(1)} V${lane[k]} H${columns[k].toFixed(1)} V640`
    return { date: r.date, x: r.x, y: r.y, d, bad: cost >= 10000 }
  })
}

// ---------------------------------------------------------------------------
// Cup runs

const RUN_HEAD = 31
const ROW_STEP = 20
const ROW_H = 18
const BLOCK_GAP = 12

export interface PlacedRun { run: CupRun; x: number; y: number }

const runHeight = (r: CupRun) => (r.comp === 'CS' ? 13 + ROW_H : RUN_HEAD + ROW_H + ROW_STEP * (r.rows.length - 1))
const stackHeight = (l: CupRun[]) => (l.length ? l.reduce((s, r) => s + runHeight(r), 0) + BLOCK_GAP * (l.length - 1) : 0)

/** Two columns, the shortest stack overall, book order inside a column; a long run stays left where its steps have room. */
export function placeRuns(runs: CupRun[]): { placed: PlacedRun[]; bottom: number } {
  let best: { score: [number, number, number]; a: CupRun[]; b: CupRun[] } | null = null
  for (let mask = 1; mask < 1 << runs.length; mask++) {
    const a = runs.filter((_, i) => mask >> i & 1)
    const b = runs.filter((_, i) => !(mask >> i & 1))
    const [ha, hb] = [stackHeight(a), stackHeight(b)]
    const wide = Math.max(0, ...b.map(r => r.rows.length))
    const score: [number, number, number] = [Math.max(ha, hb), Math.abs(ha - hb) + Math.max(0, wide - 5) * 30, a.includes(runs[0]) ? 0 : 1]
    if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && (score[1] < best.score[1] || (score[1] === best.score[1] && score[2] < best.score[2])))) best = { score, a, b }
  }
  const placed: PlacedRun[] = []
  let bottom = 32
  if (best) {
    for (const [x, col] of [[625, best.a], [900, best.b]] as const) {
      let y = 32
      for (const run of col) {
        placed.push({ run, x, y })
        bottom = Math.max(bottom, y + runHeight(run))
        y += runHeight(run) + BLOCK_GAP
      }
    }
  }
  return { placed, bottom }
}

// ---------------------------------------------------------------------------
// The people

export interface PlacedBubble { label: string; pos: TeamPack['bubbles'][number]['pos']; ax: number; ay: number; x: number; y: number; r: number; moved: boolean }
export interface PlacedLabel { text: string; x: number; y: number; anchor: 'start' | 'middle' | 'end' }

export function goalAxis(max: number): { top: number; step: number } {
  const top = Math.max(5, Math.ceil(max / 5) * 5)
  return top >= 25 ? { top: Math.ceil(max / 10) * 10, step: 10 } : { top, step: 5 }
}

const LABEL_CHAR = 4
const hypot = Math.hypot

/** Bubbles at their exact values, moved apart (mostly vertically: minutes are the sharper axis), then the story players' labels. */
export function placeBubbles(players: TeamPack['bubbles'], height: number, labels: string[]): { bubbles: PlacedBubble[]; labels: PlacedLabel[]; top: number; step: number; y0: number } {
  const shown = players.filter(p => p.min > 0)
  const y0 = height - 16
  const { top, step } = goalAxis(Math.max(0, ...shown.map(p => p.goals)))
  const X = (m: number) => 30 + m * 485 / 3420
  const Y = (g: number) => y0 - g * (y0 - 20) / top
  const maxGames = Math.max(1, ...shown.map(p => p.games))
  const pts = [...shown].sort((a, b) => b.games - a.games).map(p => {
    const r = Math.max(7 * Math.sqrt(p.games / maxGames), 1)
    return { ...p, ax: X(p.min), ay: Y(p.goals), x: X(p.min), y: Y(p.goals), r }
  })
  for (let pass = 0; pass < 400; pass++) {
    let moved = false
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const [a, b] = [pts[i], pts[j]]
      const [dx, dy] = [b.x - a.x, b.y - a.y]
      const d = hypot(dx, dy) || 0.01
      const need = a.r + b.r + 1.2
      if (d >= need) continue
      const push = (need - d) / 2
      const [ux, uy] = d > 0.05 ? [dx / d * 0.55, dy / d] : [0, 1]
      a.x -= ux * push; a.y -= uy * push
      b.x += ux * push; b.y += uy * push
      moved = true
    }
    for (const q of pts) {
      q.y = Math.max(12, Math.min(q.y, y0 + 2))
      q.x = Math.max(31, Math.min(q.x, 518))
    }
    if (!moved) break
  }
  const boxes: [number, number, number, number][] = []
  const clear = (x0: number, t: number, x1: number, b: number) =>
    !pts.some(q => x0 - q.r < q.x && q.x < x1 + q.r && t - q.r < q.y && q.y < b + q.r) && !boxes.some(k => x0 < k[2] && x1 > k[0] && t < k[3] && b > k[1])
  const placedLabels = labels.flatMap<PlacedLabel>(text => {
    const q = pts.find(p => p.label === text)
    if (!q) return []
    const w = text.length * LABEL_CHAR
    const options: [PlacedLabel['anchor'], number, number][] = [
      ['middle', q.x, q.y - q.r - 3.5], ['start', q.x + q.r + 3, q.y + 3], ['end', q.x - q.r - 3, q.y + 3], ['middle', q.x, q.y + q.r + 8.5],
      ['middle', q.x, q.y - q.r - 11], ['start', q.x + q.r + 3, q.y - 4], ['end', q.x - q.r - 3, q.y - 4],
    ]
    const left = (o: typeof options[number]) => (o[0] === 'middle' ? o[1] - w / 2 : o[0] === 'start' ? o[1] : o[1] - w)
    const pick = options.find(o => { const x0 = left(o); return x0 >= 26 && x0 + w <= 525 && o[2] >= 8 && o[2] <= y0 + 8 && clear(x0, o[2] - 7, x0 + w, o[2] + 1) }) ?? options[0]
    boxes.push([left(pick), pick[2] - 7, left(pick) + w, pick[2] + 1])
    return [{ text, anchor: pick[0], x: pick[1], y: pick[2] }]
  })
  return {
    bubbles: pts.map(q => ({ label: q.label, pos: q.pos, ax: q.ax, ay: q.ay, x: q.x, y: q.y, r: q.r, moved: hypot(q.x - q.ax, q.y - q.ay) > 0.6 })),
    labels: placedLabels, top, step, y0,
  }
}

// ---------------------------------------------------------------------------
// Radar

export const RADAR_AXES: { key: RadarKey; label: string; inverted?: boolean }[] = [
  { key: 'gpg', label: 'Goals / game' }, { key: 'win', label: 'Win rate' }, { key: 'away', label: 'Away pts / game' },
  { key: 'cpg', label: 'Conceded / game', inverted: true }, { key: 'cs', label: 'Clean sheets' }, { key: 'cards', label: 'Cards / game', inverted: true },
]

export const radarPoint = (i: number, r: number): [number, number] => {
  const a = (Math.PI / 3) * i
  return [127.5 + r * Math.sin(a), 69.5 - r * Math.cos(a)]
}

/** Centre = the league's worst value, edge = its best; the rings start at 5 pt so the worst still reads. */
export function radarRadius(range: TeamPack['radarRange'], axis: typeof RADAR_AXES[number], value: number): number {
  const m = range[axis.key]
  const t = m.max === m.min ? 0.5 : (value - m.min) / (m.max - m.min)
  return 5 + (axis.inverted ? 1 - t : t) * 36.5
}

export function radarValue(key: RadarKey, v: number): string {
  return key === 'win' ? `${(v * 100).toFixed(0)}%` : key === 'cs' ? String(Math.round(v)) : v.toFixed(2)
}
