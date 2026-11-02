'use client'

import { useId, useMemo } from 'react'
import { seasonMonths } from '@/lib/seasonBooks/plan'
import { type BookSpread, type PaletteRole, type SpreadModule } from '@/lib/seasonBooks/seasonSpreads'
import { POSITION_COLOURS, SPREAD_ICONS, resultColours } from '@/lib/seasonBooks/spreadLayouts'
import type { ClubToken, LeaguePack, RunRow, TeamPack, TransferRow, XiPlayer } from '@/lib/seasonBooks/spreadPack'
import {
  calendarMonths, cellCentre, climbRange, ordinal, placeBubbles, placeRuns, RADAR_AXES, radarPoint, radarRadius, radarValue, routeLeaders,
} from '@/lib/seasonBooks/teamLayout'

type P = Record<PaletteRole, string>
const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fmtDate = (d: string) => DATE.format(new Date(`${d}T00:00:00Z`)).replace('Sept', 'Sep')
const HEATER = 'M6,4 H94 V40 L91,58 L83,74 L68,88 L50,97 L32,88 L17,74 L9,58 L6,40 Z'
const KEYLINE = '#15161A'

function wrapLines(text: string, perLine: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (!line) line = w
    else if (line.length + 1 + w.length <= perLine) line += ` ${w}`
    else { lines.push(line); line = w }
  }
  if (line) lines.push(line)
  return lines
}

function Shape({ family, fill, transform }: { family: ClubToken['family']; fill?: string; transform?: string }) {
  if (family === 'roundel') return <circle cx={50} cy={50} r={47} fill={fill} transform={transform} />
  if (family === 'oval') return <ellipse cx={50} cy={50} rx={40} ry={48} fill={fill} transform={transform} />
  if (family === 'plate') return <rect x={4} y={10} width={92} height={80} rx={16} fill={fill} transform={transform} />
  return <path d={HEATER} fill={fill} transform={transform} />
}

function Field({ t }: { t: ClubToken }) {
  const b = t.c2 ?? t.c1
  const bars = (n: number, along: 'x' | 'y') => Array.from({ length: n }, (_, i) => (along === 'x'
    ? <rect key={i} x={i * (100 / n)} y={0} width={100 / n + 0.2} height={100} fill={i % 2 ? b : t.c1} />
    : <rect key={i} x={0} y={i * (100 / n)} width={100} height={100 / n + 0.2} fill={i % 2 ? b : t.c1} />))
  switch (t.pattern) {
    case 'sleeves': return <><rect width={100} height={100} fill={b} /><rect x={20} width={60} height={100} fill={t.c1} /></>
    case 'halves': return <><rect width={50} height={100} fill={t.c1} /><rect x={50} width={50} height={100} fill={b} /></>
    case 'stripes': return <>{bars(8, 'x')}</>
    case 'hoops': return <>{bars(6, 'y')}</>
    case 'band': return <><rect width={100} height={100} fill={t.c1} /><rect y={42} width={100} height={16} fill={b} /></>
    case 'panel': return <><rect width={100} height={100} fill={t.c1} /><rect x={34} width={32} height={100} fill={b} /></>
    case 'trim': return <><rect width={100} height={100} fill={t.c1} /><rect y={70} width={100} height={8} fill={b} /></>
    default: return <rect width={100} height={100} fill={t.c1} />
  }
}

/** A kit-derived club token; dashed where the season has no mark row for the club. */
export function KitToken({ t, x, y, size, keyline = KEYLINE }: { t: ClubToken | null; x: number; y: number; size: number; keyline?: string }) {
  const id = useId()
  if (!t) return <circle cx={x + size / 2} cy={y + size / 2} r={size / 2 - 0.5} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={0.8} strokeDasharray="1.5 1.5" />
  return (
    <g transform={`translate(${x} ${y}) scale(${size / 100})`}>
      <Shape family={t.family} fill={keyline} />
      <clipPath id={id}><Shape family={t.family} transform="translate(4 4) scale(0.92)" /></clipPath>
      <g clipPath={`url(#${id})`}><Field t={t} /></g>
    </g>
  )
}

function Head({ x, y, icon, title, p }: { x: number; y: number; icon: string; title: string; p: P }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={SPREAD_ICONS[icon] ?? SPREAD_ICONS.trend} fill="none" stroke={p.highlight} strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
      <text x={22} y={10.5} fontSize={10} fontWeight={700} fill={p.highlight}>{title.toUpperCase()}</text>
    </g>
  )
}

interface ModuleProps {
  pack: TeamPack
  row: BookSpread
  seasonStart: number
  p: P
  en: (id: string) => boolean
  hit: (id: string, x: number, y: number, w: number, h: number, children: React.ReactNode) => React.ReactNode
}

// ---------------------------------------------------------------------------
// Left page

function Climb({ pack, row, p, hit }: ModuleProps) {
  const pos = pack.rounds.map(r => r.pos)
  const [lo, hi] = climbRange(pos)
  const Y = (v: number) => 262 + (v - lo) / (hi - lo) * 90
  const X = (n: number) => 274 + (n - 1) * 272 / Math.max(1, pack.rounds.length - 1)
  const last = pack.rounds[pack.rounds.length - 1]
  const turn = pack.rounds.find(r => r.d >= (row.team?.turningPoint ?? '9')) ?? pack.rounds[pack.rounds.reduce((b, r, i) => (r.pos > pack.rounds[b].pos ? i : b), 0)]
  const title = row.editorial.notes.climb?.trim() || 'The climb'
  return hit('climb', 250, 222, 305, 160, (
    <>
      <Head x={262} y={222} icon="trend" title={`${title} / League position`} p={p} />
      <g stroke={p.grid} strokeWidth={0.5}><line x1={272} y1={262} x2={548} y2={262} /><line x1={272} y1={307} x2={548} y2={307} /><line x1={272} y1={352} x2={548} y2={352} /></g>
      <g fontSize={7.5} fill={p.text} textAnchor="end"><text x={266} y={264.5}>{lo}</text><text x={266} y={309.5}>{(lo + hi) / 2}</text><text x={266} y={354.5}>{hi}</text></g>
      <path d={pack.rounds.map((r, i) => `${i ? 'L' : 'M'}${X(r.n).toFixed(1)} ${Y(r.pos).toFixed(1)}`).join(' ')} fill="none" stroke={p.highlight} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      {[pack.rounds[0], turn, last].map((r, i) => <rect key={i} x={X(r.n) - 2.5} y={Y(r.pos) - 2.5} width={5} height={5} fill={p.highlight} />)}
      <g fontSize={7.5} fill={p.text}>
        <text x={274} y={368}>R01 · {ordinal(pos[0])}</text>
        <text x={Math.min(Math.max(X(turn.n), 348), 462)} y={368} textAnchor="middle">R{String(turn.n).padStart(2, '0')} · {ordinal(turn.pos)}, {fmtDate(turn.d)}</text>
        <text x={548} y={368} textAnchor="end">R{last.n} · {ordinal(last.pos)}</text>
      </g>
    </>
  ))
}

function CalendarModule({ pack, row, seasonStart, p, hit }: ModuleProps) {
  const rc = resultColours(p)
  const months = useMemo(() => calendarMonths(seasonMonths(seasonStart).slice(0, 10)), [seasonStart])
  const byDay = useMemo(() => {
    const out = new Map<string, TeamPack['matches']>()
    for (const m of pack.matches) out.set(m.d, [...(out.get(m.d) ?? []), m])
    return out
  }, [pack.matches])
  const moments = row.editorial.moments
  const leaders = useMemo(() => routeLeaders(moments.map(m => m.date), [...byDay.keys()], months), [moments, byDay, months])
  const europe = pack.matches.some(m => m.c === 'UCL' || m.c === 'UC')
  const legend: [string, 'sq' | 'ci' | 'di'][] = [['League', 'sq'], ...(europe ? [['Europe', 'ci'] as [string, 'ci']] : []), ['Cups', 'di']]
  const mark = (c: TeamPack['matches'][number], cx: number, cy: number, key: number) => {
    const fill = rc[c.r]
    if (c.c === 'PL') return <rect key={key} x={cx - 3} y={cy - 3} width={6} height={6} fill={fill} />
    if (c.c === 'UCL' || c.c === 'UC') return <circle key={key} cx={cx} cy={cy} r={3} fill={fill} />
    return <rect key={key} x={cx - 2.4} y={cy - 2.4} width={4.8} height={4.8} fill={fill} transform={`rotate(45 ${cx} ${cy})`} />
  }
  return hit('calendar', 40, 412, 515, 215, (
    <>
      <Head x={40} y={412} icon="calendar" title={`Season / All ${pack.all.n} competitive games`} p={p} />
      <g fontSize={7.5} fill={p.text} textAnchor="end">
        {(() => {
          let x = 555
          const items: React.ReactNode[] = []
          for (const [label, shape] of [...legend].reverse()) {
            const w = label.length * 4 + 3
            items.push(<text key={label} x={x} y={423}>{label}</text>)
            x -= w
            items.push(shape === 'sq' ? <rect key={`${label}m`} x={x - 5.5} y={417.5} width={5.5} height={5.5} fill={p.text} /> : shape === 'ci' ? <circle key={`${label}m`} cx={x - 2.75} cy={420.25} r={2.75} fill={p.text} /> : <rect key={`${label}m`} x={x - 5} y={418} width={4.6} height={4.6} fill={p.text} transform={`rotate(45 ${x - 2.7} ${420.3})`} />)
            x -= 15
          }
          x -= 4
          for (const k of ['L', 'D', 'W'] as const) {
            items.push(<text key={k} x={x} y={423}>{k}</text>)
            x -= 8
            items.push(<circle key={`${k}m`} cx={x - 2.75} cy={420.25} r={2.75} fill={rc[k]} />)
            x -= 15
          }
          return items
        })()}
      </g>
      {months.map(m => (
        <g key={m.month}>
          <text x={m.x} y={m.y + 9} fontSize={9} fontWeight={700} fill={p.text}>{new Date(`${m.month}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }).toUpperCase().slice(0, 3)}</text>
          {Array.from({ length: m.days }, (_, d) => {
            const { x, y } = cellCentre(m, d + 1)
            const games = byDay.get(`${m.month}-${String(d + 1).padStart(2, '0')}`)
            if (!games) return <circle key={d} cx={x} cy={y} r={0.65} fill="#FFFFFF" fillOpacity={0.32} />
            return <g key={d}>{games.map((g, i) => mark(g, x + (i - (games.length - 1) / 2) * 7, y, i))}</g>
          })}
        </g>
      ))}
      <g fill="none" stroke={p.highlight}>
        {leaders.map(l => <circle key={l.date} cx={l.x} cy={l.y} r={5} strokeWidth={0.7} />)}
        {leaders.map(l => <path key={l.date} d={l.d} strokeWidth={0.6} strokeOpacity={0.85} strokeLinejoin="round" />)}
      </g>
      {leaders.map((l, i) => {
        const m = moments.find(q => q.date === l.date)
        const x = 40 + i * (527 / leaders.length)
        const date = fmtDate(l.date)
        const lines = wrapLines(`${date} · ${m?.text ?? ''}`, 37).slice(0, 3)
        return (
          <g key={l.date} transform={`translate(${x} 642)`}>
            <rect width={527 / leaders.length - 12} height={0.6} fill={p.highlight} />
            {lines.map((t, j) => (j === 0
              ? <text key={j} y={11} fontSize={7} fill={p.text}><tspan fontWeight={700} fill={p.highlight}>{date}</tspan>{t.slice(date.length)}</text>
              : <text key={j} y={11 + j * 9} fontSize={7} fill={p.text}>{t}</text>))}
          </g>
        )
      })}
    </>
  ))
}

function SeasonRecord({ pack, seasonStart, p, hit }: ModuleProps) {
  const items: [string, string, number][] = [
    [ordinal(pack.league.pos), pack.leagueName.toUpperCase(), 40], [String(pack.league.pts), 'LEAGUE PTS', 150],
    [`${pack.all.GF}:${pack.all.GA}`, 'ALL COMPETITIONS GF:GA', 263], [`${pack.all.W}-${pack.all.D}-${pack.all.L}`, 'ALL COMPETITIONS W-D-L', 416],
  ]
  return hit('season-record', 40, 680, 515, 60, (
    <>
      <Head x={40} y={680} icon="trophy" title={`Season record / ${seasonStart}-${String(seasonStart + 1).slice(2)}`} p={p} />
      {items.map(([v, l, x]) => (
        <g key={l} transform={`translate(${x} 702)`}>
          <text y={23} fontSize={25} fontWeight={800} fill={p.text} style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</text>
          <text y={38} fontSize={7.5} fill={p.text}>{l}</text>
        </g>
      ))}
    </>
  ))
}

// ---------------------------------------------------------------------------
// Right page

const RUN_NAMES: Record<string, [string, string]> = {
  UCL: ['UCL', 'CHAMPIONS LEAGUE'], UC: ['UC', 'UEFA CUP'], FAC: ['FAC', 'FA CUP'], LC: ['LC', 'LEAGUE CUP'], CDR: ['CDR', 'COPA DEL REY'], CS: ['', 'COMMUNITY SHIELD'],
}

function RunMark({ comp, p }: { comp: string; p: P }) {
  const dark = '#15161A'
  if (comp === 'UCL' || comp === 'UC') {
    return (
      <g>
        <rect width={24} height={16} rx={2.5} fill={dark} stroke="#F7F6F2" strokeOpacity={0.35} strokeWidth={0.5} />
        {comp === 'UCL'
          ? <><path d="M4 4 H8 V12 H4 M8 8 H10.5 M20 4 H16 V12 H20 M16 8 H13.5" fill="none" stroke="#F7F6F2" strokeWidth={1.1} strokeLinecap="round" /><circle cx={12} cy={8} r={1.4} fill="#F7F6F2" /></>
          : <g fill="#F7F6F2">{[[5, 3], [5, 6.3], [5, 9.7], [5, 13], [12, 4.65], [12, 11.35]].map(([cx, cy]) => <circle key={`${cx}${cy}`} cx={cx} cy={cy} r={1.25} />)}<circle cx={19} cy={8} r={1.6} /></g>}
      </g>
    )
  }
  if (comp === 'CDR') {
    return (
      <g>
        <rect width={24} height={16} rx={2.5} fill="#C8102E" stroke={dark} strokeWidth={0.8} />
        <rect y={4} width={24} height={8} fill="#FFC400" />
        <rect x={9.25} y={5.25} width={5.5} height={5.5} fill="#FFFFFF" stroke={dark} strokeWidth={1.3} transform="rotate(45 12 8)" />
      </g>
    )
  }
  return (
    <g>
      <rect width={24} height={16} rx={2.5} fill="#FFFFFF" stroke={dark} strokeWidth={0.8} />
      <rect y={6.4} width={24} height={3.2} fill="#C8102E" /><rect x={10.4} width={3.2} height={16} fill="#C8102E" />
      {comp === 'CS'
        ? <path d="M8 4.75 H16 V8.5 C16 11.5 13.3 13.1 12 13.75 C10.7 13.1 8 11.5 8 8.5 Z" fill="#FFFFFF" stroke={dark} strokeWidth={1.1} />
        : <rect x={9.25} y={5.25} width={5.5} height={5.5} fill="#FFFFFF" stroke={dark} strokeWidth={1.3} transform="rotate(45 12 8)" />}
    </g>
  )
}

function RunCard({ r, x, y, pack, p }: { r: RunRow; x: number; y: number; pack: TeamPack; p: P }) {
  const rc = resultColours(p)
  const bg = r.won ? p.highlight : r.out ? p.eliminationCard : p.card
  const ink = r.won ? p.page2Ground : p.text
  const label = r.won ? p.page2Ground : p.highlight
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={214} height={18} fill={bg} />
      {r.out && <rect width={2} height={18} fill={pack.design.outEdge} />}
      <text x={6} y={12} fontSize={6.5} fontWeight={700} fill={label}>{r.label}</text>
      {r.dots ? null : <KitToken t={r.token} x={29} y={3} size={12} />}
      <text x={r.dots ? 29 : 46} y={12} fontSize={7} fontWeight={700} fill={ink}>{r.opp}</text>
      {r.dots
        ? r.dots.map((d, i) => <circle key={i} cx={126 + i * 7.5} cy={9} r={2.5} fill={rc[d]} />)
        : <text x={119} y={12} fontSize={6.5} fill={ink} style={{ fontVariantNumeric: 'tabular-nums' }}>{r.legs}</text>}
      <text x={208} y={12} fontSize={6.5} fontWeight={700} fill={ink} textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.right}</text>
    </g>
  )
}

function CupRuns({ pack, p, hit, noteY }: ModuleProps & { noteY: number }) {
  const { placed } = placeRuns(pack.runs)
  const rows = pack.runs.flatMap(r => r.rows)
  const neutral = rows.some(r => r.legs.startsWith('N'))
  const won = rows.some(r => r.won)
  const note = `Scores ${pack.short} first · H home / A away${neutral ? ' / N neutral' : ''} · right column = aggregate · ${pack.design.outName} = elimination${won ? ', gold = winners' : ''}${rows.some(r => r.dots) ? ' · group card: six results, then place and points' : ''}`
  return hit('cup-runs', 625, 32, 525, noteY - 32 + 9, (
    <>
      {placed.map(({ run, x, y }) => {
        const [code, name] = RUN_NAMES[run.comp]
        if (run.comp === 'CS') {
          return (
            <g key={run.comp}>
              <g transform={`translate(${x} ${y - 4})`}><RunMark comp="CS" p={p} /></g>
              <text x={x + 29} y={y + 7} fontSize={7} fontWeight={700} fill={p.highlight}>{name}<tspan fontWeight={400} fill={p.text} fillOpacity={0.85}> {run.sub}</tspan></text>
              <RunCard r={run.rows[0]} x={x} y={y + 13} pack={pack} p={p} />
            </g>
          )
        }
        return (
          <g key={run.comp}>
            <g transform={`translate(${x} ${y})`}><RunMark comp={run.comp} p={p} /></g>
            <text x={x + 30} y={y + 11} fontSize={10} fontWeight={800} fill={p.text} letterSpacing={0.6} style={{ fontStretch: '75%' }}>{code}</text>
            <text x={x + 36 + code.length * 7} y={y + 11} fontSize={10} fontWeight={700} fill={p.highlight}>{name}</text>
            <text x={x} y={y + 24} fontSize={7.5} fill={p.text}>{run.sub}</text>
            {run.rows.map((r, i) => (
              <g key={r.label}>
                {i > 0 && <path d={`M${x + 12 * i - 7} ${y + 31 + 20 * i - 3} V${y + 31 + 20 * i + 9} H${x + 12 * i}`} fill="none" stroke={p.highlight} strokeWidth={0.8} />}
                <RunCard r={r} x={x + 12 * i} y={y + 31 + 20 * i} pack={pack} p={p} />
              </g>
            ))}
          </g>
        )
      })}
      <text x={625} y={noteY + 7} fontSize={7} fill={p.text} opacity={0.85}>{note}</text>
    </>
  ))
}

const LINE_X = { gk: 12, d: 46, m: 88, f: 134 } as const
const LINE_Y: Record<number, number[]> = { 1: [38], 2: [25.3, 50.7], 3: [19, 38, 57], 4: [15.2, 30.4, 45.6, 60.8], 5: [7, 22.5, 38, 53.5, 69], 6: [7, 19.4, 31.8, 44.2, 56.6, 69] }

/** A five- or six-man line has no room under its dots, so the names sit beside them. */
function XiDot({ q, x, y, p, tight }: { q: XiPlayer; x: number; y: number; p: P; tight: boolean }) {
  return (
    <g>
      <circle cx={x} cy={y} r={5.5} fill={q.new ? p.accent : p.highlight} stroke={q.new ? '#FFFFFF' : undefined} strokeWidth={q.new ? 0.8 : 0} />
      <text x={x} y={y + 2.1} fontSize={6} fontWeight={800} textAnchor="middle" fill={q.new ? '#FFFFFF' : p.page2Ground} style={{ fontVariantNumeric: 'tabular-nums' }}>{q.shirt}</text>
      <text x={tight ? x + 7 : x} y={tight ? y + 2 : y + 9.5} fontSize={5.5} textAnchor={tight ? 'start' : 'middle'} fill={p.text}>{q.name}</text>
    </g>
  )
}

function Side({ pack, row, p, hit, top }: ModuleProps & { top: number }) {
  const y = top + 22
  const coach = row.team?.coach
  const context = wrapLines(coach?.context ?? '', 39).slice(0, 5)
  const signed = pack.xis.some(x => Object.values(x.lines).flat().some(q => q.new))
  return (
    <>
      {hit('coach', 625, top, 150, 112, (
        <>
          <Head x={625} y={top} icon="people" title="The side / Coach and most-used XI" p={p} />
          <text x={625} y={y + 7} fontSize={7} fontWeight={700} fill={p.highlight} letterSpacing={0.4}>COACH</text>
          <text x={625} y={y + 22} fontSize={12} fontWeight={800} fill={p.text}>{coach?.name}</text>
          {context.map((l, i) => <text key={i} x={625} y={y + 33 + i * 10} fontSize={7.5} fill={p.text}>{l}</text>)}
          {coach?.assistants && <text x={625} y={y + 33 + context.length * 10} fontSize={7.5} fill={p.text}>Assistant: {coach.assistants}</text>}
          <text x={625} y={y + 38 + (context.length + (coach?.assistants ? 1 : 0)) * 10} fontSize={7.5} fill={p.text} style={{ fontVariantNumeric: 'tabular-nums' }}>
            <tspan fontWeight={700}>{pack.all.n}</tspan> games  <tspan fontWeight={700}>{pack.all.W}</tspan>W <tspan fontWeight={700}>{pack.all.D}</tspan>D <tspan fontWeight={700}>{pack.all.L}</tspan>L
          </text>
        </>
      ))}
      {hit('xis', 790, y, 360, 100, (
        <>
          {pack.xis.map((xi, i) => (
            <g key={xi.label} transform={`translate(${790 + i * 190} ${y})`}>
              <text y={7} fontSize={7} fontWeight={700} fill={p.text}>{xi.label} <tspan fontWeight={400} opacity={0.8}>· {xi.shape}</tspan></text>
              <g transform="translate(0 13)">
                <g fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={0.6}>
                  <rect x={0.5} y={0.5} width={159} height={75} /><line x1={80} y1={0.5} x2={80} y2={75.5} /><circle cx={80} cy={38} r={10} /><rect x={0.5} y={16} width={25} height={44} /><rect x={134.5} y={16} width={25} height={44} />
                </g>
                {(['gk', 'd', 'm', 'f'] as const).flatMap(line => xi.lines[line].map((q, j) => <XiDot key={`${line}${j}`} q={q} x={LINE_X[line]} y={(LINE_Y[xi.lines[line].length] ?? LINE_Y[6])[j]} p={p} tight={xi.lines[line].length > 4} />))}
              </g>
            </g>
          ))}
          <text x={790} y={y + 97} fontSize={6.5} fill={p.text} opacity={0.85}>Most starts in each half, by shirt number, in the usual shape; attack to the right.{signed ? ` ${pack.design.accentName} = signed in January.` : ''}</text>
        </>
      ))}
    </>
  )
}

function People({ pack, row, p, hit, top }: ModuleProps & { top: number }) {
  const svgTop = top + 20
  const height = 560 - svgTop
  const names = row.team?.storyPlayers ?? []
  const { bubbles, labels, top: goals, step, y0 } = useMemo(() => placeBubbles(pack.bubbles, height, names), [pack.bubbles, height, names])
  const Y = (g: number) => y0 - g * (y0 - 20) / goals
  const ticks = Array.from({ length: goals / step + 1 }, (_, i) => i * step)
  const title = row.editorial.notes.bubble?.trim() || `The people${names[0] ? `: ${names[0]} and the rest` : ''}`
  return hit('bubble', 625, top, 525, 575 - top, (
    <>
      <Head x={625} y={top} icon="people" title={title} p={p} />
      <g transform={`translate(625 ${svgTop})`}>
        <path d={`${ticks.map(t => `M30 ${Y(t).toFixed(1)} H515`).join(' ')} ${[30, 171.8, 313.6, 455.4].map(x => `M${x} 14 V${y0}`).join(' ')}`} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={0.5} />
        <g fontSize={7} fill={p.text} fillOpacity={0.85}>
          {ticks.map(t => <text key={t} x={24} y={Y(t) + 2.5} textAnchor="end">{t}</text>)}
          <text y={7}>GOALS</text>
          {[[30, '0'], [171.8, '1,000'], [313.6, '2,000'], [455.4, '3,000']].map(([x, l]) => <text key={l} x={x} y={y0 + 11} textAnchor="middle">{l}</text>)}
          <text x={525} y={y0 + 22} textAnchor="end">LEAGUE MINUTES</text>
        </g>
        <path d={bubbles.filter(b => b.moved).map(b => `M${b.ax.toFixed(1)} ${b.ay.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`).join(' ')} stroke="rgba(255,255,255,0.5)" strokeWidth={0.5} fill="none" />
        {bubbles.map(b => <circle key={b.label} cx={b.x} cy={b.y} r={b.r} fill={p.page2Ground} fillOpacity={0.85} stroke={POSITION_COLOURS[b.pos]} strokeWidth={b.r > 3 ? 1.3 : 0.9} />)}
        {bubbles.filter(b => b.moved).map(b => <circle key={b.label} cx={b.ax} cy={b.ay} r={1.1} fill="#FFFFFF" />)}
        {labels.map(l => <text key={l.text} x={l.x} y={l.y} textAnchor={l.anchor} fontSize={7.5} fontWeight={700} fill={p.text}>{l.text}</text>)}
      </g>
      <g transform="translate(625 570)" fontSize={7} fill={p.text}>
        {([['FW', 'Forward', 0], ['MF', 'Midfield', 62], ['DF', 'Defence', 123], ['GK', 'Goalkeeper', 185]] as const).map(([k, l, x]) => (
          <g key={k} transform={`translate(${x} 0)`}><circle cx={3.5} cy={3.5} r={2.75} fill="none" stroke={POSITION_COLOURS[k]} strokeWidth={1.5} /><text x={12} y={6.5}>{l}</text></g>
        ))}
        <text x={263} y={6.5} opacity={0.8}>Area = league games · dots mark exact values where circles were moved apart</text>
      </g>
    </>
  ))
}

function TransferRows({ rows, y, p }: { rows: TransferRow[]; y: number; p: P }) {
  return (
    <>
      {rows.map((r, i) => (
        <g key={`${r.name}${i}`} transform={`translate(625 ${y + i * 12})`}>
          <rect y={11.6} width={250} height={0.4} fill="#FFFFFF" fillOpacity={0.16} />
          {r.jan && <text y={8.5} fontSize={6} fontWeight={800} fill={p.highlight}>J</text>}
          <text x={11} y={8.5} fontSize={7.5} fontWeight={700} fill={p.text}>{r.name}</text>
          <text x={159} y={8.5} fontSize={6.5} fontWeight={800} fill={POSITION_COLOURS[r.pos]}>{r.pos}</text>
          <KitToken t={r.token} x={177} y={1} size={10} />
          <text x={191} y={8.5} fontSize={7} fontWeight={800} letterSpacing={0.3} fill={p.text} style={{ fontStretch: '75%' }}>{r.code}</text>
          <text x={250} y={8.5} fontSize={7.5} fontWeight={700} fill={p.text} textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.fee}</text>
        </g>
      ))}
    </>
  )
}

function Window({ pack, p, hit }: ModuleProps) {
  const w = pack.window
  const outY = 613 + 12.6 + w.in.length * 12 + 8
  const bar = (y: number, label: string, total: string) => (
    <g transform={`translate(625 ${y})`}>
      <text y={7} fontSize={7} fontWeight={700} letterSpacing={0.4} fill={p.highlight}>{label}</text>
      <text x={250} y={7} fontSize={7} fontWeight={700} letterSpacing={0.4} fill={p.text} textAnchor="end">{total}</text>
      <rect y={11.4} width={250} height={0.6} fill={p.highlight} />
    </g>
  )
  return hit('transfers', 625, 593, 250, 188, (
    <>
      <Head x={625} y={593} icon="transfer" title="The window / In and out" p={p} />
      {bar(613, 'IN', w.inTotal)}
      <TransferRows rows={w.in} y={625.4} p={p} />
      {bar(outY, 'OUT', w.outTotal)}
      <TransferRows rows={w.out} y={outY + 12.4} p={p} />
      <text x={625} y={outY + 12.4 + w.out.length * 12 + 9.5} fontSize={6.5} fill={p.text} opacity={0.85}>{w.note}</text>
    </>
  ))
}

function Radar({ pack, p, hit }: ModuleProps) {
  const ring = (r: number) => Array.from({ length: 6 }, (_, i) => radarPoint(i, r).map(n => n.toFixed(1)).join(',')).join(' ')
  const avg = RADAR_AXES.map((a, i) => radarPoint(i, radarRadius(pack.radarRange, a, pack.radarRange[a.key].avg)).map(n => n.toFixed(1)).join(',')).join(' ')
  const team = RADAR_AXES.map((a, i) => radarPoint(i, radarRadius(pack.radarRange, a, pack.radar[a.key].v)))
  const labels: [number, number, 'middle' | 'start' | 'end'][] = [[1022.5, 629, 'middle'], [1065.4, 662.8, 'start'], [1065.4, 712.2, 'start'], [1022.5, 744, 'middle'], [979.6, 712.2, 'end'], [979.6, 662.8, 'end']]
  return hit('radar', 895, 593, 255, 185, (
    <>
      <Head x={895} y={593} icon="radar" title={`The team / Against ${pack.leagueName === 'Premier League' ? 'the Premier League' : pack.leagueName}`} p={p} />
      <text x={895} y={619} fontSize={9} fill={p.text}>Centre = league’s worst · edge = league’s best</text>
      <g transform="translate(895 627)">
        {[5, 17.2, 29.3, 41.5].map(r => <polygon key={r} points={ring(r)} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={0.5} />)}
        {[0, 1, 2, 3, 4, 5].map(i => { const [x, y] = radarPoint(i, 41.5); return <line key={i} x1={127.5} y1={69.5} x2={x} y2={y} stroke="rgba(255,255,255,0.2)" strokeWidth={0.5} /> })}
        <polygon points={avg} fill="none" stroke="#FFFFFF" strokeOpacity={0.75} strokeWidth={0.8} strokeDasharray="2 2" />
        <polygon points={team.map(n => n.map(v => v.toFixed(1)).join(',')).join(' ')} fill={p.highlight} fillOpacity={0.24} stroke={p.highlight} strokeWidth={1.5} strokeLinejoin="round" />
        {team.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2} fill={p.highlight} />)}
      </g>
      {RADAR_AXES.map((a, i) => {
        const [x, y, anchor] = labels[i]
        const v = pack.radar[a.key]
        return (
          <g key={a.key} transform={`translate(${x} ${y})`} textAnchor={anchor}>
            <text y={6.5} fontSize={6.5} fontWeight={700} letterSpacing={0.26} fill={p.text}>{a.label.toUpperCase()}</text>
            <text y={17} fontSize={8.5} fontWeight={800} fill={p.highlight} style={{ fontVariantNumeric: 'tabular-nums' }}>{radarValue(a.key, v.v)}<tspan fontSize={7} fontWeight={500} fill={p.text}> · {ordinal(v.rank)}</tspan></text>
          </g>
        )
      })}
      <g transform="translate(895 768)" fontSize={7} fill={p.text}>
        <rect y={0.5} width={10} height={7} fill={p.highlight} fillOpacity={0.24} stroke={p.highlight} />
        <text x={15} y={7}>{pack.short}</text>
        <line x1={78} y1={4} x2={90} y2={4} stroke="#FFFFFF" strokeWidth={0.8} strokeDasharray="2 2" />
        <text x={95} y={7}>League average</text>
        <text x={170} y={7} opacity={0.8}>League games · rank of 20</text>
      </g>
    </>
  ))
}

/** The team template drawn from its data pack: every module the reference spreads carry, with the row's editorial fields. */
export function TeamPackPages({ pack, row, seasonStart, p, onModule, active, modules }: {
  pack: TeamPack; row: BookSpread; seasonStart: number; p: P; onModule?: (m: SpreadModule) => void; active: string | null; modules: readonly SpreadModule[]
}) {
  const en = (id: string) => row.modules[id]?.enabled ?? !modules.find(m => m.id === id)?.optional
  const hit = (id: string, x: number, y: number, w: number, h: number, children: React.ReactNode) => {
    const m = modules.find(q => q.id === id)
    return (
      <g data-module={id} onClick={() => m && onModule?.(m)} style={{ cursor: onModule ? 'pointer' : undefined }}>
        {children}
        {active === id && <rect x={x - 6} y={y - 6} width={w + 12} height={h + 12} fill="none" stroke="#FFFFFF" strokeWidth={1.2} strokeDasharray="5 3" opacity={0.9} />}
        <rect x={x} y={y} width={w} height={h} fill="transparent" />
      </g>
    )
  }
  const props: ModuleProps = { pack, row, seasonStart, p, en, hit }
  const { bottom } = placeRuns(pack.runs)
  const noteY = bottom + 7
  const sideTop = noteY + 24
  return (
    <>
      <Climb {...props} />
      <rect x={40} y={392} width={515} height={0.6} fill={p.text} opacity={0.45} />
      <CalendarModule {...props} />
      <SeasonRecord {...props} />
      <CupRuns {...props} noteY={noteY} />
      <Side {...props} top={sideTop} />
      <People {...props} top={sideTop + 136} />
      {en('transfers') && <Window {...props} />}
      {en('radar') && <Radar {...props} />}
    </>
  )
}

// ---------------------------------------------------------------------------
// League template

/** The league spread's Players module, drawn from its pack. */
export function LeaguePlayers({ pack, p, hit }: { pack: LeaguePack; p: P; hit: (id: string, x: number, y: number, w: number, h: number, children: React.ReactNode) => React.ReactNode }) {
  let y = 411
  const col = pack.teamOfYear.players
  return hit('players', 635, 386, 515, 200, (
    <>
      <path d={SPREAD_ICONS.trophy ?? ''} transform="translate(635 386) scale(1.25)" fill="none" stroke={p.highlight} strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round" />
      <text x={660} y={398.5} fontSize={12.5} fontWeight={800} fill={p.highlight} letterSpacing={0.1}>THE PLAYERS / AWARDS AND HONOURS</text>
      {pack.honours.map((h, i) => {
        const size = i === 0 ? 15 : 11
        const top = y + size + 3
        const node = (
          <g key={h.name}>
            <KitToken t={h.token} x={635} y={top - size + 1} size={size * 0.75} />
            <text x={635 + size} y={top} fontSize={size} fontWeight={800} fill={p.text}>{h.name.toUpperCase()}</text>
            {h.items.map((t, j) => (
              <g key={t}><rect x={636} y={top + 8 + j * 10} width={2.4} height={2.4} fill={p.highlight} /><text x={644} y={top + 11 + j * 10} fontSize={7} fill={p.text}>{t}</text></g>
            ))}
          </g>
        )
        y = top + 10 + h.items.length * 10
        return node
      })}
      <text x={815} y={413} fontSize={7} fontWeight={800} letterSpacing={0.2} fill={p.text}>{pack.teamOfYear.title}</text>
      <rect x={815} y={418} width={160} height={158} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={0.6} />
      {[[0, 2], [2, 6], [6, 10], [10, 11]].map(([a, b], r) => col.slice(a, b).map((name, i, line) => (
        <text key={name} x={815 + (i + 0.5) * (160 / line.length)} y={433 + r * 44} fontSize={6.5} fontWeight={700} fill={p.text} textAnchor="middle">{name}</text>
      )))}
      <text x={995} y={413} fontSize={7} fontWeight={800} letterSpacing={0.2} fill={p.text}>PLAYER OF THE MONTH</text>
      {pack.monthly.map((m, i) => (
        <g key={m.month} transform={`translate(995 ${421 + i * 16.2})`}>
          <text y={7.5} fontSize={7} fontWeight={700} fill={p.highlight}>{m.month}</text>
          <KitToken t={m.token} x={24} y={0} size={10} />
          <text x={40} y={7.5} fontSize={7} fontWeight={700} fill={p.text}>{m.player}</text>
          <text x={155} y={7.5} fontSize={6.5} fill={p.text} opacity={0.75} textAnchor="end">{m.code}</text>
        </g>
      ))}
      <text x={995} y={576} fontSize={6.5} fill={p.text} opacity={0.85}>{pack.monthlyNote}</text>
    </>
  ))
}

/** The Money and The Scorers columns of the league spread. */
export function LeagueMoney({ pack, p }: { pack: LeaguePack; p: P }) {
  const max = Math.max(1, ...pack.signings.rows.map(r => r.value))
  return (
    <>
      <text x={635} y={629} fontSize={7} fontWeight={700} fill={p.highlight} letterSpacing={0.3}>{pack.signings.title}</text>
      {pack.signings.rows.map((r, i) => {
        const y = 638 + i * 15 + (i ? 12 : 0)
        return (
          <g key={r.code} transform={`translate(635 ${y})`}>
            <KitToken t={r.token} x={0} y={0} size={10} />
            <text x={14} y={8} fontSize={7} fontWeight={800} fill={p.text} style={{ fontStretch: '75%' }}>{r.code}</text>
            <rect x={36} y={1} width={Math.max(2, (r.value / max) * 80)} height={8} fill={i ? '#8A8780' : p.highlight} />
            <text x={40 + Math.max(2, (r.value / max) * 80)} y={8} fontSize={7} fontWeight={700} fill={p.text}>{r.total}</text>
            {r.note && <text x={14} y={19} fontSize={6} fill={p.text} opacity={0.85}>{r.note}</text>}
          </g>
        )
      })}
      <text x={635} y={772} fontSize={7} fontWeight={700} fill={p.highlight}>{pack.signings.note}</text>
      {pack.scorers.slice(0, 12).map((s, i) => (
        <g key={s.player} transform={`translate(810 ${630 + i * 12.2})`}>
          <KitToken t={s.token} x={0} y={0} size={9} />
          <text x={14} y={7.5} fontSize={7} fontWeight={700} fill={i ? p.text : p.highlight}>{s.player}</text>
          <rect x={80} y={1} width={(s.goals / 30) * 62} height={7} fill={i ? '#8A8780' : p.highlight} />
          <text x={84 + (s.goals / 30) * 62} y={7.5} fontSize={7} fontWeight={700} fill={p.text}>{s.goals}</text>
        </g>
      ))}
    </>
  )
}
