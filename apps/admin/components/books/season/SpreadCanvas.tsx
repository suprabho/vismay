'use client'

import { useMemo } from 'react'
import { leaderByDate, leagueMatches, pointsRace, positionsByRound, resultsStrip, standings, type MatchRow, type Result, type StandingRow } from '@/lib/seasonBooks/matches'
import { seasonLabel, seasonMonths } from '@/lib/seasonBooks/plan'
import { competitionCode, HEADLINE_CHARS_PER_LINE, LEAGUE_COUNTRY, sameClub, SPREAD_MODULES, type BookSpread, type PaletteRole, type PlannedSpread, type SpreadModule } from '@/lib/seasonBooks/seasonSpreads'
import {
  DEFAULT_SPREAD_PALETTE, FRAME_REGIONS, POSITION_COLOURS, REFERENCE_PALETTES, resultColours, SPREAD_CANVAS, SPREAD_ICONS, SPREAD_TEMPLATES,
} from '@/lib/seasonBooks/spreadLayouts'

export const CANVAS = SPREAD_CANVAS
const FONT = "var(--font-archivo, Archivo), 'Helvetica Neue', Helvetica, Arial, sans-serif"
const [PG1, PG2] = CANVAS.pages

/** The spread's palette: its reference palette when it has one, the stand-in otherwise, then the editor's overrides. */
export function spreadPalette(row: BookSpread | null): Record<PaletteRole, string> {
  return { ...DEFAULT_SPREAD_PALETTE, ...(row ? REFERENCE_PALETTES[row.key] ?? {} : {}), ...(row?.palette ?? {}) }
}

/** Match data the canvas can draw from: the subject's competition rows. */
export interface CanvasData {
  rows: MatchRow[]
  competition: string | null
}

type P = Record<PaletteRole, string>

function wrap(text: string, perLine: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    if (!line) line = w
    else if (line.length + 1 + w.length <= perLine) line += ` ${w}`
    else { lines.push(line); line = w }
  }
  if (line) lines.push(line)
  return lines
}

const code3 = (name: string) => name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()
const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fmtDate = (d: string) => DATE.format(new Date(`${d}T00:00:00Z`))
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
const HEATER = 'M6,4 H94 V40 L91,58 L83,74 L68,88 L50,97 L32,88 L17,74 L9,58 L6,40 Z'

// ---------------------------------------------------------------------------
// Shared parts

function Header({ x, y, icon, title, p, wide = false }: { x: number; y: number; icon: string; title: string; p: P; wide?: boolean }) {
  const size = wide ? 12.5 : 10
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={SPREAD_ICONS[icon] ?? SPREAD_ICONS.trend} fill="none" stroke={p.highlight} strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
      <text x={wide ? 25 : 22} y={wide ? 12.5 : 10.5} fontSize={size} fontWeight={wide ? 800 : 700} fill={p.highlight} letterSpacing={wide ? 0.1 : 0}>{title.toUpperCase()}</text>
    </g>
  )
}

function Rule({ y, page, p }: { y: number; page: 1 | 2; p: P }) {
  const pg = page === 1 ? PG1 : PG2
  return <rect x={pg.x0} y={y} width={pg.x1 - pg.x0} height={0.6} fill={p.text} opacity={0.45} />
}

/** A club token: kit-derived, crest-family shape (heater by default), dashed when no mark row exists. */
function Token({ x, y, size, colour, shape = 'heater', dashed = false }: { x: number; y: number; size: number; colour?: string; shape?: 'heater' | 'roundel'; dashed?: boolean }) {
  const s = size / 100
  if (dashed) return <circle cx={x + size / 2} cy={y + size / 2} r={size / 2 - 0.5} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={0.8} strokeDasharray="1.5 1.5" />
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {shape === 'roundel' ? <circle cx={50} cy={50} r={47} fill="#15161A" /> : <path d={HEATER} fill="#15161A" />}
      <g transform="translate(4 4) scale(0.92)">
        {shape === 'roundel' ? <circle cx={50} cy={50} r={47} fill={colour ?? '#8A8780'} /> : <path d={HEATER} fill={colour ?? '#8A8780'} />}
      </g>
    </g>
  )
}

/** A competition tile, 24 × 16 with a ring and star (European) or a cup glyph (domestic). */
function CompTile({ x, y, scale = 1, p, european }: { x: number; y: number; scale?: number; p: P; european: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect width={24} height={16} rx={2.5} fill={european ? '#0E1E5B' : '#15161A'} stroke="rgba(255,255,255,0.35)" strokeWidth={0.5} />
      {european
        ? <><circle cx={12} cy={8} r={5.2} fill="none" stroke="#C9D1DC" strokeWidth={0.9} /><path d="M12 5.4 L12.62 7.15 L14.47 7.2 L13 8.32 L13.53 10.1 L12 9.05 L10.47 10.1 L11 8.32 L9.53 7.2 L11.38 7.15 Z" fill="#FFFFFF" /></>
        : <path d="M8 4 H16 V8 A4 4 0 0 1 8 8 Z M8 5 H6 A2 2 0 0 0 8 9 M16 5 H18 A2 2 0 0 1 16 9 M12 11 V12.5 M9.5 13.5 H14.5" fill="none" stroke={p.text} strokeWidth={0.9} strokeLinecap="round" />}
    </g>
  )
}

function Mark({ spread, p }: { spread: PlannedSpread; p: P }) {
  const code = spread.kind === 'team' ? code3(spread.subjectId) : competitionCode(spread.subjectId)
  const x = 470
  return (
    <g transform={`translate(${x} 45)`} data-module="identity">
      {spread.kind === 'team' && <g transform="translate(6 0)"><Token x={0} y={0} size={64} colour={p.page1Ground === DEFAULT_SPREAD_PALETTE.page1Ground ? undefined : p.accent} /></g>}
      {spread.kind === 'league' && (
        <g transform="translate(6 10)">
          <rect x={0.5} y={0.5} width={63} height={43} rx={5} fill="#FFFFFF" stroke="#15161A" />
          <circle cx={32} cy={22} r={11} fill="none" stroke="#15161A" strokeWidth={2.2} />
        </g>
      )}
      {spread.kind === 'competition' && <g transform="translate(6 11)"><CompTile x={0} y={0} scale={64 / 24} p={p} european={/champions|uefa|europa|conference/i.test(spread.subjectId)} /></g>}
      <text x={38} y={81} fontSize={13} fontWeight={800} fill={p.text} textAnchor="middle" letterSpacing={0.8} style={{ fontStretch: '75%' }}>{code}</text>
    </g>
  )
}

function Frame({ spread, row, seasonStart, p, compact, onModule, active, storyWidth, copySize }: {
  spread: PlannedSpread; row: BookSpread; seasonStart: number; p: P; compact: boolean; onModule?: (m: SpreadModule) => void; active: string | null
  storyWidth: number; copySize: { size: number; leading: number; chars: number }
}) {
  const e = row.editorial
  const season = seasonLabel(seasonStart).replace('–', '-')
  const headline = wrap((e.headline || (compact ? '' : 'Two-line headline')).toUpperCase(), HEADLINE_CHARS_PER_LINE).slice(0, 3)
  const copy = wrap(e.story || (compact ? '' : 'Story copy: at most thirty words, set under the story statistic.'), copySize.chars).slice(0, 5)
  const mod = (id: string) => SPREAD_MODULES[spread.kind].find(m => m.id === id)
  const click = (id: string) => () => { const m = mod(id); if (m && onModule) onModule(m) }
  const cur = onModule ? 'pointer' : undefined
  const kicker = `${spread.subjectId} / ${season}`
  return (
    <>
      <g data-module="identity" onClick={click('identity')} style={{ cursor: cur }}>
        <text x={40} y={41} fontSize={10} fontWeight={700} fill={p.highlight} letterSpacing={0.2}>{kicker.toUpperCase()}</text>
        {headline.map((line, i) => <text key={i} x={38} y={121 + i * 56} fontSize={55} fontWeight={800} fill={p.text} letterSpacing={-0.55}>{line}</text>)}
        {!compact && headline.length > 2 && <text x={38} y={240} fontSize={7} fill={p.accent}>A third line: the headline needs cutting</text>}
        <Mark spread={spread} p={p} />
        {active === 'identity' && <rect x={34} y={28} width={515} height={110} fill="none" stroke={p.highlight} strokeWidth={1.5} strokeDasharray="5 3" />}
      </g>
      <g data-module="story-stat" onClick={click('story-stat')} style={{ cursor: cur }}>
        <text x={40} y={268} fontSize={53} fontWeight={800} fill={p.highlight} style={{ fontVariantNumeric: 'tabular-nums' }}>{e.storyStat.value || (compact ? '' : '00')}</text>
        <text x={40} y={290} fontSize={7.5} fontWeight={500} fill={p.text} letterSpacing={0.3}>{(e.storyStat.label || (compact ? '' : 'Story statistic label')).toUpperCase()}</text>
        {copy.map((line, i) => <text key={i} x={40} y={300 + copySize.size + i * copySize.leading} fontSize={copySize.size} fill={p.text}>{line}</text>)}
        {active === 'story-stat' && <rect x={34} y={216} width={storyWidth + 12} height={180} fill="none" stroke={p.highlight} strokeWidth={1.5} strokeDasharray="5 3" />}
      </g>
      <text x={40} y={783} fontSize={6.5} fill={p.text} opacity={0.75}>
        {spread.kind === 'team' ? `Club mark: kit-derived token (${code3(spread.subjectId)}), not the official crest · League and competition marks: flag tiles and abstract glyphs` : 'Club marks: kit-derived tokens whose shape follows each club’s crest, not the official crests · Competition and league marks: abstract glyphs and flag tiles'}
      </text>
      <Rule y={790} page={1} p={p} />
      <Rule y={790} page={2} p={p} />
      <text x={40} y={808} fontSize={8.5} fill={p.text} opacity={0.85} letterSpacing={0.25}>{`${kicker}  •  ${e.headline || spread.label}`.toUpperCase()}</text>
      <text x={625} y={805} fontSize={6.5} fill={p.text} opacity={0.85}>
        {row.pack ? `Sources: the data pack (${row.pack.hash.slice(0, 8)}, ${row.pack.builtAt.slice(0, 10)})` : 'Sources: admin_historical_matches (results, standings) · the data pack adds lineups, minutes, transfers and awards'}
      </text>
    </>
  )
}

/** A module's clickable area and active outline. */
function Hit({ id, kind, x, y, w, h, onModule, active, children }: { id: string; kind: PlannedSpread['kind']; x: number; y: number; w: number; h: number; onModule?: (m: SpreadModule) => void; active: string | null; children: React.ReactNode }) {
  const m = SPREAD_MODULES[kind].find(mm => mm.id === id)
  return (
    <g data-module={id} onClick={() => m && onModule?.(m)} style={{ cursor: onModule ? 'pointer' : undefined }}>
      {children}
      {active === id && <rect x={x - 6} y={y - 6} width={w + 12} height={h + 12} fill="none" stroke="#FFFFFF" strokeWidth={1.2} strokeDasharray="5 3" opacity={0.9} />}
      <rect x={x} y={y} width={w} height={h} fill="transparent" />
    </g>
  )
}

function Dashed({ x, y, w, h, label, p, note }: { x: number; y: number; w: number; h: number; label?: string; p: P; note?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={2} fill="none" stroke={p.text} strokeOpacity={0.25} strokeWidth={0.6} strokeDasharray="3 2" />
      {label && <text x={x + 6} y={y + 11} fontSize={6.5} fill={p.text} opacity={0.6}>{label}</text>}
      {note && <text x={x + 6} y={y + 21} fontSize={6} fill={p.text} opacity={0.45}>{note}</text>}
    </g>
  )
}

function Record({ x, y, items, size, p }: { x: number; y: number; items: [string, string][]; size: number; p: P }) {
  const widths = size > 30 ? [132, 132, 132, 119] : [112, 112, 157, 134]
  const offsets = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b, 0))
  return (
    <g>
      {items.map(([value, label], i) => {
        const gx = x + (offsets[i] ?? i * 120)
        return (
          <g key={i} transform={`translate(${gx} ${y})`}>
            <text y={size} fontSize={size} fontWeight={800} fill={p.text} style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</text>
            <text y={size + 12} fontSize={7.5} fill={p.text}>{label.toUpperCase()}</text>
          </g>
        )
      })}
    </g>
  )
}

// ---------------------------------------------------------------------------
// Team template

const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function TeamPages({ spread, row, seasonStart, p, data, compact, onModule, active }: { spread: PlannedSpread; row: BookSpread; seasonStart: number; p: P; data?: CanvasData; compact: boolean; onModule?: (m: SpreadModule) => void; active: string | null }) {
  const team = spread.subjectId
  const league = useMemo(() => leagueMatches(data?.rows ?? []), [data])
  const strip = useMemo(() => resultsStrip(league, team), [league, team])
  const table = useMemo(() => standings(league), [league])
  const climb = useMemo(() => positionsByRound(league, team), [league, team])
  const rc = resultColours(p)
  const me = table.find(r => r.team === team)
  const pos = table.findIndex(r => r.team === team) + 1
  const hasData = strip.length > 0
  const months = seasonMonths(seasonStart).slice(0, 10)
  const byDate = new Map(strip.map(g => [g.d, g]))
  const momentDates = new Set(row.editorial.moments.map(m => m.date))
  const low = climb.reduce((a, b) => (b.pos > a.pos ? b : a), climb[0] ?? { n: 0, d: '', pos: 1 })
  const maxPos = Math.max(table.length || 20, ...climb.map(c => c.pos))
  const posY = (pp: number) => 262 + ((pp - 1) / Math.max(1, maxPos - 1)) * 90
  const posX = (n: number) => 272 + ((n - 1) / Math.max(1, climb.length - 1)) * 276
  const teamModule = row.team
  const cups = Object.entries(teamModule?.cupParagraphs ?? {}).filter(([, v]) => v.trim()).map(([k]) => k)
  const cupList = cups.length ? cups : ['Champions League', 'Domestic cup']
  const en = (id: string) => row.modules[id]?.enabled ?? !SPREAD_MODULES.team.find(m => m.id === id)?.optional
  const leagueName = spread.league ?? data?.competition ?? 'League'

  return (
    <>
      {/* Climb */}
      <Hit id="climb" kind="team" x={250} y={222} w={305} h={160} onModule={onModule} active={active}>
        <Header x={262} y={222} icon="trend" title="The climb / League position" p={p} />
        <g stroke={p.text} strokeOpacity={0.3} strokeWidth={0.5}>
          <line x1={272} y1={262} x2={548} y2={262} /><line x1={272} y1={307} x2={548} y2={307} /><line x1={272} y1={352} x2={548} y2={352} />
        </g>
        <g fontSize={7.5} fill={p.text} textAnchor="end">
          <text x={266} y={264.5}>1</text><text x={266} y={309.5}>{Math.round((maxPos + 1) / 2)}</text><text x={266} y={354.5}>{maxPos}</text>
        </g>
        {hasData && climb.length > 1 && (
          <>
            <path d={climb.map((c, i) => `${i ? 'L' : 'M'}${posX(c.n).toFixed(1)} ${posY(c.pos).toFixed(1)}`).join(' ')} fill="none" stroke={p.highlight} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
            {[climb[0], low, climb[climb.length - 1]].map((c, i) => <rect key={i} x={posX(c.n) - 2.5} y={posY(c.pos) - 2.5} width={5} height={5} fill={p.highlight} />)}
            <g fontSize={7.5} fill={p.text}>
              <text x={274} y={368}>R{String(climb[0].n).padStart(2, '0')} · {ordinal(climb[0].pos)}</text>
              <text x={Math.min(500, Math.max(320, posX(low.n)))} y={368} textAnchor="middle">R{low.n} · {ordinal(low.pos)}, {fmtDate(low.d)}</text>
              <text x={548} y={368} textAnchor="end">R{climb.length} · {ordinal(climb[climb.length - 1].pos)}</text>
            </g>
          </>
        )}
        {!hasData && !compact && <text x={274} y={368} fontSize={7.5} fill={p.text} opacity={0.6}>Position by round, from the {leagueName} matches</text>}
      </Hit>
      <Rule y={392} page={1} p={p} />

      {/* Calendar */}
      <Hit id="calendar" kind="team" x={40} y={412} w={515} h={215} onModule={onModule} active={active}>
        <Header x={40} y={412} icon="calendar" title={`Season / ${hasData ? `${strip.length} league games` : 'All competitive games'}`} p={p} />
        <g fontSize={7.5} fill={p.text}>
          {[['W', rc.W, 'circle'], ['D', rc.D, 'circle'], ['L', rc.L, 'circle']].map(([k, c, shape], i) => (
            <g key={k} transform={`translate(${392 + i * 22} 418)`}>
              {shape === 'circle' && <circle cx={2.75} cy={2.75} r={2.75} fill={c} />}
              <text x={9} y={5.5}>{k}</text>
            </g>
          ))}
          <g transform="translate(462 418)"><rect width={5.5} height={5.5} fill={p.text} /><text x={9} y={5.5}>League</text></g>
          <g transform="translate(500 418)"><circle cx={2.75} cy={2.75} r={2.75} fill={p.text} /><text x={9} y={5.5}>Europe</text></g>
          <g transform="translate(537 418)"><rect x={1} y={1} width={3.6} height={3.6} fill={p.text} transform="rotate(45 2.75 2.75)" /><text x={9} y={5.5}>Cup</text></g>
        </g>
        {months.map((m, i) => {
          const col = i % 5
          const rowI = Math.floor(i / 5)
          const x = 40 + col * 105.4
          const y = 442 + rowI * 92
          const [yy, mm] = m.split('-').map(Number)
          const days = new Date(Date.UTC(yy, mm, 0)).getUTCDate()
          const first = (new Date(Date.UTC(yy, mm - 1, 1)).getUTCDay() + 6) % 7
          return (
            <g key={m} transform={`translate(${x} ${y})`}>
              <text y={9} fontSize={9} fontWeight={700} fill={p.text}>{MONTH_SHORT[mm - 1]}</text>
              {Array.from({ length: days }, (_, d) => {
                const idx = first + d
                const cx = (idx % 7) * 11 + 5.5
                const cy = 19 + Math.floor(idx / 7) * 8.5 + 4.25
                const date = `${m}-${String(d + 1).padStart(2, '0')}`
                const g = byDate.get(date)
                return (
                  <g key={d}>
                    <circle cx={cx} cy={cy} r={0.6} fill={p.text} opacity={0.25} />
                    {g && <rect x={cx - 2.75} y={cy - 2.75} width={5.5} height={5.5} fill={rc[g.r]} />}
                    {momentDates.has(date) && <circle cx={cx} cy={cy} r={5} fill="none" stroke={p.highlight} strokeWidth={0.7} />}
                  </g>
                )
              })}
            </g>
          )
        })}
        {!hasData && !compact && <text x={40} y={635} fontSize={6.5} fill={p.text} opacity={0.6}>League games fill the grid from the match data; cup games arrive with the team pack.</text>}
      </Hit>

      {/* Key moments */}
      <Hit id="key-moments" kind="team" x={40} y={642} w={515} h={28} onModule={onModule} active={active}>
        {Array.from({ length: 4 }, (_, i) => {
          const m = row.editorial.moments[i]
          const x = 40 + i * 131.75
          return (
            <g key={i} transform={`translate(${x} 642)`}>
              <rect width={119.75} height={0.6} fill={p.highlight} opacity={m ? 1 : 0.35} />
              {m
                ? <>
                    <text y={11} fontSize={7} fontWeight={700} fill={p.highlight}>{m.date ? fmtDate(m.date) : ''}<tspan fontWeight={400} fill={p.text}> · {m.text.slice(0, 34)}</tspan></text>
                    {m.text.length > 34 && <text y={20} fontSize={7} fill={p.text}>{m.text.slice(34, 72)}</text>}
                  </>
                : !compact && <text y={11} fontSize={7} fill={p.text} opacity={0.4}>Moment {i + 1}</text>}
            </g>
          )
        })}
      </Hit>

      {/* Season record */}
      <Hit id="season-record" kind="team" x={40} y={680} w={515} h={60} onModule={onModule} active={active}>
        <Header x={40} y={680} icon="trophy" title={`Season record / ${seasonLabel(seasonStart)}`} p={p} />
        <Record x={40} y={702} size={25} p={p} items={me
          ? [[ordinal(pos), leagueName], [String(me.pts), `${competitionCode(leagueName)} pts`], [`${me.gf}:${me.ga}`, 'League GF:GA'], [`${me.w}-${me.d}-${me.l}`, 'League W-D-L']]
          : [['—', leagueName], ['—', 'League pts'], ['—', 'All competitions GF:GA'], ['—', 'All competitions W-D-L']]} />
      </Hit>

      {/* Cup runs */}
      <Hit id="cup-runs" kind="team" x={625} y={32} w={525} h={225} onModule={onModule} active={active}>
        {cupList.slice(0, 4).map((cup, i) => {
          const x = 625 + (i % 2) * 275
          const y = 32 + Math.floor(i / 2) * 110
          const european = /champions|uefa|europa|conference|intertoto/i.test(cup)
          const variant = teamModule?.cupVariant[cup] ?? 'rail'
          const steps = european ? ['GRP', 'R16', 'QF'] : ['R3', 'R4', 'R5']
          return (
            <g key={cup} transform={`translate(${x} ${y})`}>
              <CompTile x={0} y={0} p={p} european={european} />
              <text x={30} y={11} fontSize={10} fontWeight={800} fill={p.text} letterSpacing={0.6} style={{ fontStretch: '75%' }}>{competitionCode(cup)}</text>
              <text x={30 + competitionCode(cup).length * 7 + 6} y={11} fontSize={10} fontWeight={700} fill={p.highlight}>{cup.toUpperCase()}</text>
              <text y={23} fontSize={7.5} fill={p.text}>{(teamModule?.cupParagraphs[cup] ?? '').slice(0, 60) || (variant === 'ladder' ? 'Ladder: group table above the knockout steps' : 'Rail: rounds aligned on the final')}</text>
              {steps.map((s, j) => (
                <g key={s} transform={`translate(${j * 12} ${31 + j * 20})`}>
                  <rect width={214} height={18} fill={p.card} />
                  <text x={6} y={12} fontSize={6.5} fontWeight={700} fill={p.highlight}>{s}</text>
                  <Token x={28} y={3} size={12} dashed />
                  <rect x={46} y={7} width={70} height={4} rx={1} fill={p.text} opacity={0.18} />
                  <rect x={160} y={7} width={46} height={4} rx={1} fill={p.text} opacity={0.18} />
                  {j < steps.length - 1 && <path d={`M5 18 V24 H12`} fill="none" stroke={p.highlight} strokeWidth={0.8} />}
                </g>
              ))}
            </g>
          )
        })}
        <text x={625} y={253} fontSize={7} fill={p.text} opacity={0.8}>Scores {team} first · H home / A away / N neutral · right column = aggregate · ties and legs come with the team pack</text>
      </Hit>

      {/* The side */}
      <Hit id="coach" kind="team" x={625} y={273} w={150} h={110} onModule={onModule} active={active}>
        <Header x={625} y={273} icon="people" title="The side / Coach and most-used XI" p={p} />
        <text x={625} y={302} fontSize={7} fontWeight={700} fill={p.highlight} letterSpacing={0.4}>COACH</text>
        <text x={625} y={316} fontSize={12} fontWeight={800} fill={p.text}>{teamModule?.coach.name || (compact ? '' : 'Coach name')}</text>
        {wrap(teamModule?.coach.context ?? '', 38).slice(0, 3).map((l, i) => <text key={i} x={625} y={328 + i * 10} fontSize={7.5} fill={p.text}>{l}</text>)}
        {teamModule?.coach.assistants && <text x={625} y={361} fontSize={7.5} fill={p.text}>Assistants: {teamModule.coach.assistants}</text>}
        {me && <text x={625} y={373} fontSize={7.5} fill={p.text} style={{ fontVariantNumeric: 'tabular-nums' }}><tspan fontWeight={700}>{me.p}</tspan> games  <tspan fontWeight={700}>{me.w}</tspan>W <tspan fontWeight={700}>{me.d}</tspan>D <tspan fontWeight={700}>{me.l}</tspan>L</text>}
      </Hit>
      <Hit id="xis" kind="team" x={790} y={295} w={360} h={100} onModule={onModule} active={active}>
        {[0, 1].map(i => {
          const x = 790 + i * 190
          const split = teamModule?.xiSplitDate ?? teamModule?.turningPoint
          const label = i === 0 ? `AUG – ${split ? fmtDate(split).toUpperCase() : 'TURNING POINT'}` : `${split ? fmtDate(split).toUpperCase() : 'TURNING POINT'} – MAY`
          return (
            <g key={i} transform={`translate(${x} 295)`}>
              <text y={7} fontSize={7} fontWeight={700} fill={p.text}>{label}<tspan fontWeight={400} opacity={0.8}> · most-used XI</tspan></text>
              <g transform="translate(0 11)" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={0.6}>
                <rect x={0.5} y={0.5} width={159} height={75} /><line x1={80} y1={0.5} x2={80} y2={75.5} /><circle cx={80} cy={38} r={10} /><rect x={0.5} y={16} width={25} height={44} /><rect x={134.5} y={16} width={25} height={44} />
              </g>
              {[[12, 38, 'GK'], [40, 12, 'DF'], [40, 30, 'DF'], [40, 46, 'DF'], [40, 64, 'DF'], [84, 16, 'MF'], [84, 38, 'MF'], [84, 60, 'MF'], [128, 20, 'FW'], [128, 38, 'FW'], [128, 56, 'FW']].map(([cx, cy, pos], j) => (
                <circle key={j} cx={cx as number} cy={11 + (cy as number)} r={5} fill={p.page2Ground} stroke={POSITION_COLOURS[pos as keyof typeof POSITION_COLOURS]} strokeWidth={1.2} strokeDasharray={hasData ? undefined : '1.5 1.5'} />
              ))}
            </g>
          )
        })}
        <text x={790} y={393} fontSize={6.5} fill={p.text} opacity={0.85}>The 11 with most starts in each half, by shirt number; attack to the right. Lineups come with the team pack.</text>
      </Hit>

      {/* The people */}
      <Hit id="bubble" kind="team" x={625} y={409} w={525} h={170} onModule={onModule} active={active}>
        <Header x={625} y={409} icon="people" title={`The people${teamModule?.storyPlayers.length ? `: ${teamModule.storyPlayers[0]} and the rest` : ''}`} p={p} />
        <g transform="translate(625 429)">
          <path d="M30 115 H515 M30 83.3 H515 M30 51.7 H515 M30 20 H515 M30 14 V115 M171.8 14 V115 M313.6 14 V115 M455.4 14 V115" fill="none" stroke={p.text} strokeOpacity={0.14} strokeWidth={0.5} />
          <g fontSize={7} fill={p.text} fillOpacity={0.85}>
            <text x={27} y={117} textAnchor="end">0</text><text x={27} y={22} textAnchor="end">goals</text>
            <text x={515} y={125} textAnchor="end">league minutes →</text>
          </g>
          {(teamModule?.storyPlayers ?? []).slice(0, 10).map((name, i) => {
            const cx = 60 + ((i * 97) % 440)
            const cy = 100 - ((i * 37) % 70)
            return (
              <g key={name}>
                <circle cx={cx} cy={cy} r={6 + (i % 3) * 3} fill={p.page2Ground} stroke={Object.values(POSITION_COLOURS)[i % 4]} strokeWidth={1.3} strokeDasharray="1.5 1.5" />
                <text x={cx + 12} y={cy + 2.5} fontSize={7} fill={p.text}>{name}</text>
              </g>
            )
          })}
        </g>
        <g transform="translate(625 570)" fontSize={7} fill={p.text}>
          {Object.entries(POSITION_COLOURS).map(([k, c], i) => (
            <g key={k} transform={`translate(${i * 54} 0)`}><circle cx={3.5} cy={3.5} r={3} fill="none" stroke={c} strokeWidth={1.5} /><text x={11} y={6}>{{ FW: 'Forward', MF: 'Midfield', DF: 'Defence', GK: 'Goalkeeper' }[k]}</text></g>
          ))}
          <text x={230} y={6} opacity={0.8}>Area = league games · minutes and goals come with the squad pack</text>
        </g>
      </Hit>

      {/* The window */}
      {en('transfers') && (
        <Hit id="transfers" kind="team" x={625} y={593} w={250} h={180} onModule={onModule} active={active}>
          <Header x={625} y={593} icon="transfer" title="The window / In and out" p={p} />
          {['IN', 'OUT'].map((k, i) => (
            <g key={k} transform={`translate(625 ${613 + i * 82})`}>
              <text y={9} fontSize={7} fontWeight={700} fill={p.highlight} letterSpacing={0.4}>{k}</text>
              <text x={250} y={9} fontSize={7} fontWeight={700} fill={p.text} textAnchor="end">known fees</text>
              <rect y={12} width={250} height={0.6} fill={p.highlight} />
              {[0, 1, 2, 3, 4].map(j => (
                <g key={j} transform={`translate(0 ${13 + j * 12})`}>
                  <rect y={11.6} width={250} height={0.4} fill={p.text} opacity={0.16} />
                  <rect x={12} y={4} width={60} height={4} rx={1} fill={p.text} opacity={0.15} />
                  <Token x={118} y={1} size={10} dashed />
                  <rect x={210} y={4} width={36} height={4} rx={1} fill={p.text} opacity={0.15} />
                </g>
              ))}
            </g>
          ))}
        </Hit>
      )}

      {/* The team radar */}
      {en('radar') && (
        <Hit id="radar" kind="team" x={895} y={593} w={255} h={185} onModule={onModule} active={active}>
          <Header x={895} y={593} icon="radar" title={`The team / Against ${leagueName === 'League' ? 'the league' : LEAGUE_COUNTRY[leagueName] ? `the ${leagueName}` : leagueName}`} p={p} />
          <text x={895} y={619} fontSize={9} fill={p.text}>Centre = league’s worst · edge = league’s best</text>
          <g transform="translate(895 627)">
            {[0.33, 0.66, 1].map(r => <polygon key={r} points={hexagon(127.5, 69.5, 41.5 * r)} fill="none" stroke={p.text} strokeOpacity={0.2} strokeWidth={0.6} />)}
            {me && table.length > 1 && <polygon points={radarPoints(me, table, league)} fill={p.highlight} fillOpacity={0.22} stroke={p.highlight} strokeWidth={1.5} strokeLinejoin="round" />}
            {radarLabels(me, table, league).map((l, i) => {
              const [lx, ly, anchor] = [[127.5, 2], [220, 36], [220, 86], [127.5, 134], [35, 86], [35, 36]][i] as [number, number, string?]
              return (
                <g key={i} transform={`translate(${lx} ${ly})`} textAnchor={i === 0 || i === 3 ? 'middle' : i < 3 ? 'start' : 'end'}>
                  <text fontSize={6.5} fontWeight={700} fill={p.text} letterSpacing={0.3}>{l.label.toUpperCase()}</text>
                  <text y={10} fontSize={8.5} fontWeight={800} fill={p.highlight} style={{ fontVariantNumeric: 'tabular-nums' }}>{l.value}<tspan fontSize={7} fontWeight={500} fill={p.text}> · {l.rank}</tspan></text>
                  {anchor && null}
                </g>
              )
            })}
          </g>
          <text x={895} y={776} fontSize={7} fill={p.text} opacity={0.8}>Six league-relative ranks; cards per game arrives with the pack.</text>
        </Hit>
      )}
      {en('heatmap') && <Dashed x={625} y={500} w={525} h={62} label="HEATMAP · four players × ten months" note="Optional; minutes per month come with the squad pack" p={p} />}
      {en('appearances') && !en('transfers') && <Dashed x={625} y={613} w={250} h={150} label="APPEARANCES · most, all competitions" p={p} />}
    </>
  )
}

function hexagon(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 3
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`
  }).join(' ')
}

/** Six league-relative metrics for a club, each as a 0–1 share of the league's range (1 = best). */
function radarMetrics(me: StandingRow | undefined, table: StandingRow[], league: MatchRow[]): { label: string; value: string; rank: string; share: number }[] {
  const n = table.length
  const metric = (label: string, fn: (r: StandingRow) => number, fmt: (v: number) => string, higherIsBetter = true) => {
    if (!me || !n) return { label, value: '—', rank: '—', share: 0.5 }
    const vals = table.map(fn)
    const v = fn(me)
    const sorted = [...vals].sort((a, b) => higherIsBetter ? b - a : a - b)
    const rank = sorted.indexOf(v) + 1
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const share = max === min ? 0.5 : (higherIsBetter ? (v - min) / (max - min) : (max - v) / (max - min))
    return { label, value: fmt(v), rank: ordinal(rank), share }
  }
  const cleanSheets = (r: StandingRow) => resultsStrip(league, r.team).filter(g => g.ga === 0).length
  const awayPpg = (r: StandingRow) => { const away = resultsStrip(league, r.team).filter(g => !g.home); return away.length ? away.reduce((s, g) => s + (g.r === 'W' ? 3 : g.r === 'D' ? 1 : 0), 0) / away.length : 0 }
  return [
    metric('Goals / game', r => r.gf / Math.max(1, r.p), v => v.toFixed(2)),
    metric('Win rate', r => r.w / Math.max(1, r.p), v => `${Math.round(v * 100)}%`),
    metric('Away pts / game', awayPpg, v => v.toFixed(2)),
    metric('Conceded / game', r => r.ga / Math.max(1, r.p), v => v.toFixed(2), false),
    metric('Clean sheets', cleanSheets, v => String(v)),
    { label: 'Cards / game', value: '—', rank: 'pack', share: 0.5 },
  ]
}

function radarPoints(me: StandingRow, table: StandingRow[], league: MatchRow[]): string {
  return radarMetrics(me, table, league).map((m, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 3
    const r = 6 + m.share * 35.5
    return `${(127.5 + r * Math.cos(a)).toFixed(1)},${(69.5 + r * Math.sin(a)).toFixed(1)}`
  }).join(' ')
}

function radarLabels(me: StandingRow | undefined, table: StandingRow[], league: MatchRow[]) {
  return radarMetrics(me, table, league)
}

// ---------------------------------------------------------------------------
// League template

function LeaguePages({ spread, row, p, data, compact, onModule, active }: { spread: PlannedSpread; row: BookSpread; seasonStart: number; p: P; data?: CanvasData; compact: boolean; onModule?: (m: SpreadModule) => void; active: string | null }) {
  const league = useMemo(() => leagueMatches(data?.rows ?? []), [data])
  const table = useMemo(() => standings(league), [league])
  const clubs = table.map(r => r.team)
  const highlight = row.editorial.highlight.length ? row.editorial.highlight : clubs.slice(0, 1)
  const race = useMemo(() => pointsRace(league, clubs), [league, clubs])
  const leaders = useMemo(() => leaderByDate(league), [league])
  const rc = resultColours(p)
  const hasData = table.length > 0
  const games = Math.max(38, ...race.map(r => r.points.length))
  const maxPts = Math.max(90, ...race.map(r => r.points[r.points.length - 1]?.pts ?? 0))
  const rx = (n: number) => 296 + (n / games) * 198
  const ry = (pts: number) => 462 - (pts / maxPts) * 204
  const colourFor = (club: string) => {
    const i = highlight.findIndex(h => sameClub(h, club))
    return i < 0 ? null : [p.highlight, p.draw, p.accent, p.text][i] ?? p.text
  }
  // Days at the top: calendar days between match dates, per leader.
  const days = useMemo(() => {
    const out = new Map<string, number>()
    leaders.forEach((l, i) => {
      const next = leaders[i + 1]?.d
      const span = next ? Math.round((Date.parse(next) - Date.parse(l.d)) / 86400000) : 1
      out.set(l.leader, (out.get(l.leader) ?? 0) + span)
    })
    return [...out.entries()].sort((a, b) => b[1] - a[1])
  }, [leaders])
  const champion = table[0]
  const goals = table.reduce((s, r) => s + r.gf, 0)
  const homeWins = league.filter(m => m.hg > m.ag).length
  const en = (id: string) => row.modules[id]?.enabled ?? true

  return (
    <>
      <Hit id="race" kind="league" x={275} y={222} w={280} h={260} onModule={onModule} active={active}>
        <Header x={275} y={222} icon="trend" title="The race / League points" p={p} wide />
        <g fontSize={7} fontWeight={600} fill={p.text} textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {[0, 30, 60, 90].map(v => <g key={v}><line x1={296} x2={494} y1={ry(v)} y2={ry(v)} stroke={p.text} strokeOpacity={0.16} strokeWidth={0.5} /><text x={290} y={ry(v) + 2.5}>{v}</text></g>)}
        </g>
        <line x1={rx(games / 2)} x2={rx(games / 2)} y1={258} y2={462} stroke={p.text} strokeOpacity={0.3} strokeWidth={0.5} strokeDasharray="2 2" />
        {race.map(r => {
          const c = colourFor(r.team)
          const d = r.points.map((pt, i) => `${i ? 'L' : 'M'}${rx(pt.n).toFixed(1)} ${ry(pt.pts).toFixed(1)}`).join(' ')
          return <path key={r.team} d={`M${rx(0)} ${ry(0)} ${d.replace(/^M/, 'L')}`} fill="none" stroke={c ?? p.text} strokeOpacity={c ? 1 : 0.16} strokeWidth={c ? 1.5 : 0.75} strokeLinejoin="round" />
        })}
        {race.filter(r => colourFor(r.team)).map(r => {
          const last = r.points[r.points.length - 1]
          return last ? <text key={r.team} x={498} y={ry(last.pts) + 2.5} fontSize={7} fontWeight={700} fill={colourFor(r.team)!}>{r.team} {last.pts}</text> : null
        })}
        {!hasData && !compact && <text x={296} y={475} fontSize={7} fill={p.text} opacity={0.6}>League points by round for every club, from the {spread.subjectId} matches</text>}
        {row.league?.halfwayNote && <text x={rx(games / 2) + 3} y={266} fontSize={6.5} fill={p.text} opacity={0.85}>{row.league.halfwayNote.slice(0, 40)}</text>}
      </Hit>

      <Hit id="lead" kind="league" x={40} y={506} w={515} h={170} onModule={onModule} active={active}>
        <Header x={40} y={506} icon="clock" title="The lead / Top of the table, every matchday" p={p} wide />
        <text x={40} y={539} fontSize={7.5} fill={p.text}>Each cell is one match date, Aug → May, coloured by the club top that night{hasData ? ` · ${leaders.filter((l, i) => i && l.leader !== leaders[i - 1].leader).length} changes at the top` : ''}</text>
        <g transform="translate(40 548)">
          {hasData
            ? leaders.map((l, i) => <rect key={l.d} x={(i / leaders.length) * 515} y={0} width={Math.max(0.6, 515 / leaders.length - 0.4)} height={14} fill={colourFor(l.leader) ?? p.card} />)
            : <rect width={515} height={14} fill={p.card} />}
          {(row.league?.leadAnnotations ?? []).filter(a => a.date).map((a, i) => {
            const idx = leaders.findIndex(l => l.d >= a.date)
            const x = idx < 0 ? 515 : (idx / Math.max(1, leaders.length)) * 515
            return <g key={i}><line x1={x} x2={x} y1={-4} y2={18} stroke={p.text} strokeWidth={0.6} /><text x={x + 3} y={27 + i * 9} fontSize={6.5} fill={p.text}>{fmtDate(a.date)} · {a.text.slice(0, 48)}</text></g>
          })}
        </g>
        <g transform="translate(40 606)">
          {(days.length ? days : [['—', 0] as [string, number]]).slice(0, 5).map(([club, n], i) => (
            <g key={club} transform={`translate(${i * 103} 0)`}>
              <Token x={0} y={0} size={10} colour={colourFor(club) ?? undefined} dashed={!colourFor(club)} />
              <text x={14} y={8.5} fontSize={7.5} fontWeight={700} fill={p.text}>{club}</text>
              <text x={14} y={19} fontSize={7.5} fill={p.text} style={{ fontVariantNumeric: 'tabular-nums' }}>{n} day{n === 1 ? '' : 's'} at the top</text>
            </g>
          ))}
        </g>
      </Hit>

      <Hit id="season-record" kind="league" x={40} y={690} w={515} h={80} onModule={onModule} active={active}>
        <Header x={40} y={690} icon="trophy" title={`Season record / ${league.length || 380} league games`} p={p} wide />
        <Record x={40} y={716} size={25} p={p} items={hasData
          ? [[String(league.length), 'League games'], [String(goals), `Goals, ${(goals / Math.max(1, league.length)).toFixed(2)} a game`], [`${champion.gf}:${champion.ga}`, `${champion.team} GF:GA`], [`${Math.round((homeWins / Math.max(1, league.length)) * 100)}%`, `Home wins, ${homeWins} of ${league.length}`]]
          : [['380', 'League games'], ['—', 'Goals'], ['—', 'Champion GF:GA'], ['—', 'Home wins']]} />
      </Hit>

      <Hit id="table" kind="league" x={635} y={32} w={515} h={340} onModule={onModule} active={active}>
        <Header x={635} y={32} icon="table" title="The table / Final standings and every result in order" p={p} wide />
        <g transform="translate(635 52)" fontSize={7} fill={p.text} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {['', '', 'P', 'W', 'D', 'L', 'GF', 'GA', 'PTS'].map((h, i) => <text key={i} x={[0, 16, 126, 142, 158, 174, 190, 208, 228][i]} y={0} fontSize={6} fontWeight={700} fill={p.highlight} textAnchor={i >= 2 ? 'end' : 'start'}>{h}</text>)}
          {(hasData ? table : Array.from({ length: 20 }, (_, i) => ({ team: `Club ${i + 1}`, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }))).map((r, i) => {
            const y = 6 + i * 15
            const games = hasData ? resultsStrip(league, r.team) : []
            const c = colourFor(r.team)
            const relegated = i >= table.length - 3 && hasData
            return (
              <g key={r.team} transform={`translate(0 ${y})`}>
                {relegated && <rect x={-4} y={2} width={1.6} height={11} fill={p.accent} />}
                <text y={10} fontWeight={700} fill={c ?? p.text} opacity={0.9}>{i + 1}</text>
                <Token x={14} y={2} size={10} colour={c ?? undefined} dashed={!c} />
                <text x={28} y={10} fontWeight={700} fill={c ?? p.text}>{r.team.length > 18 ? `${r.team.slice(0, 17)}…` : r.team}</text>
                {[r.p, r.w, r.d, r.l, r.gf, r.ga].map((v, j) => <text key={j} x={[126, 142, 158, 174, 190, 208][j]} y={10} textAnchor="end">{hasData ? v : '—'}</text>)}
                <text x={228} y={10} textAnchor="end" fontWeight={800} fill={c ?? p.text}>{hasData ? r.pts : '—'}</text>
                {games.map((g, j) => <rect key={j} x={238 + j * 7.2} y={3.5} width={5.2} height={7} rx={0.8} fill={rc[g.r]} />)}
                {!hasData && <rect x={238} y={5} width={272} height={4} rx={1} fill={p.text} opacity={0.12} />}
                {i === 9 && <line x1={0} x2={515} y1={14.7} y2={14.7} stroke={p.text} strokeOpacity={0.5} strokeWidth={0.5} strokeDasharray="2 2" />}
              </g>
            )
          })}
        </g>
        <text x={635} y={372} fontSize={7} fill={p.text} opacity={0.85}>Results in order, win / draw / loss · relegated marked · dashed line at the halfway places · R19 place and places gained come with the pack</text>
      </Hit>

      {en('players') && (
        <Hit id="players" kind="league" x={635} y={386} w={515} h={200} onModule={onModule} active={active}>
          <Header x={635} y={386} icon="people" title="The players / Awards and honours" p={p} wide />
          <g transform="translate(635 402)" fontSize={7} fill={p.text}>
            <text fontWeight={700} letterSpacing={0.3} y={6} fill={p.highlight}>AWARDS</text>
            {(row.league?.awards ?? []).filter(a => a.name.trim()).slice(0, 12).map((a, i) => <text key={i} y={18 + i * 11}>{a.name.slice(0, 40)}</text>)}
            {!(row.league?.awards.length) && !compact && <text y={18} opacity={0.5}>Team of the year, players of the month, top scorers, each with its source</text>}
          </g>
          <text x={815} y={408} fontSize={7} fontWeight={700} fill={p.highlight} letterSpacing={0.3}>PFA TEAM OF THE YEAR</text>
          <g transform="translate(815 416)">{Array.from({ length: 11 }, (_, i) => <circle key={i} cx={8 + (i % 4) * 40} cy={8 + Math.floor(i / 4) * 24} r={5} fill="none" stroke={Object.values(POSITION_COLOURS)[Math.min(3, Math.floor(i / 3))]} strokeWidth={1.2} strokeDasharray="1.5 1.5" />)}</g>
          <text x={995} y={408} fontSize={7} fontWeight={700} fill={p.highlight} letterSpacing={0.3}>PLAYER OF THE MONTH</text>
          <g transform="translate(995 416)">{Array.from({ length: 9 }, (_, i) => <g key={i} transform={`translate(0 ${i * 15})`}><text y={9} fontSize={7} fill={p.text} opacity={0.8}>{MONTH_SHORT[(7 + i) % 12]}</text><rect x={30} y={3} width={110} height={4} rx={1} fill={p.text} opacity={0.15} /></g>)}</g>
        </Hit>
      )}

      {en('signings') && (
        <Hit id="signings" kind="league" x={635} y={606} w={515} h={170} onModule={onModule} active={active}>
          <Header x={635} y={606} icon="money" title="The money" p={p} wide />
          <text x={635} y={629} fontSize={7} fontWeight={700} fill={p.highlight} letterSpacing={0.3}>£5M-PLUS SIGNINGS, 1 JUNE – 1 SEPTEMBER</text>
          {Array.from({ length: 9 }, (_, i) => <g key={i} transform={`translate(635 ${636 + i * 15})`}><Token x={0} y={2} size={10} dashed /><rect x={14} y={4} width={80} height={4} rx={1} fill={p.text} opacity={0.15} /><Token x={110} y={2} size={10} dashed /><rect x={130} y={4} width={30} height={4} rx={1} fill={p.text} opacity={0.15} /></g>)}
          <Header x={810} y={606} icon="trophy" title="The scorers" p={p} wide />
          {Array.from({ length: 9 }, (_, i) => <g key={i} transform={`translate(810 ${636 + i * 15})`}><text y={8} fontSize={7} fill={p.text} opacity={0.8}>{i + 1}</text><rect x={12} y={4} width={90} height={4} rx={1} fill={p.text} opacity={0.15} /><rect x={120} y={4} width={30} height={4} rx={1} fill={p.text} opacity={0.15} /></g>)}
          <Header x={985} y={606} icon="map" title="The grid" p={p} wide />
          <g transform="translate(985 636)">{Array.from({ length: 36 }, (_, i) => <rect key={i} x={(i % 6) * 27} y={Math.floor(i / 6) * 22} width={25} height={20} fill={p.card} opacity={0.6} />)}</g>
        </Hit>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Competition template

interface Tie { a: string; b: string; legs: { h: string; a: string; hg: number; ag: number }[]; aggA: number; aggB: number; winner: string | null; stage: string }

function tiesOf(rows: MatchRow[], stage: RegExp): Tie[] {
  const ties = new Map<string, Tie>()
  for (const m of rows.filter(r => stage.test(r.s ?? ''))) {
    const key = [m.h, m.a].sort().join('|')
    let t = ties.get(key)
    if (!t) { t = { a: m.h, b: m.a, legs: [], aggA: 0, aggB: 0, winner: null, stage: m.s ?? '' }; ties.set(key, t) }
    t.legs.push({ h: m.h, a: m.a, hg: m.hg, ag: m.ag })
    if (m.h === t.a) { t.aggA += m.hg; t.aggB += m.ag } else { t.aggA += m.ag; t.aggB += m.hg }
  }
  for (const t of ties.values()) t.winner = t.aggA > t.aggB ? t.a : t.aggB > t.aggA ? t.b : null
  return [...ties.values()]
}

function CompetitionPages({ spread, row, seasonStart, p, data, compact, onModule, active }: { spread: PlannedSpread; row: BookSpread; seasonStart: number; p: P; data?: CanvasData; compact: boolean; onModule?: (m: SpreadModule) => void; active: string | null }) {
  const rows = useMemo(() => data?.rows ?? [], [data])
  const hasData = rows.length > 0
  const clubs = useMemo(() => [...new Set(rows.flatMap(m => [m.h, m.a]))], [rows])
  const final = rows.filter(m => /^final$/i.test(m.s ?? '')).pop()
  const finalists = final ? [final.h, final.a] : []
  const r16 = useMemo(() => tiesOf(rows, /^r16$/i), [rows])
  const qf = useMemo(() => tiesOf(rows, /^qf$/i), [rows])
  const sf = useMemo(() => tiesOf(rows, /^sf$/i), [rows])
  const groups = useMemo(() => {
    const by = new Map<string, MatchRow[]>()
    for (const m of rows) { const g = /^group\s?([a-h])$/i.exec(m.s ?? ''); if (g) by.set(g[1].toUpperCase(), [...(by.get(g[1].toUpperCase()) ?? []), m]) }
    return [...by.entries()].sort().map(([g, ms]) => ({ g, table: standings(ms) }))
  }, [rows])
  const highlight = row.editorial.highlight.length ? row.editorial.highlight : finalists
  const colourFor = (club: string) => { const i = highlight.findIndex(h => sameClub(h, club)); return i < 0 ? null : [p.highlight, p.draw, p.accent, p.text][i] ?? p.text }
  const goals = rows.reduce((s, m) => s + m.hg + m.ag, 0)
  const homeWins = rows.filter(m => m.hg > m.ag).length
  const dates = rows.map(m => m.d).sort()
  const comp = row.competition
  // The groups module is off only when the competition has no group stage.
  const en = (id: string) => row.modules[id]?.enabled ?? (id === 'groups' ? !hasData || groups.length > 0 : true)
  const european = /champions|uefa|europa|conference|intertoto/i.test(spread.subjectId)
  const rc = resultColours(p)

  // The bracket: R16 ties feed the QF tie their winner plays, and so on, so the halves converge on the final.
  const sfOrder = sf.length === 2 ? sf : [sf[0], sf[1]]
  const qfFor = (s: Tie | undefined) => s ? qf.filter(t => [t.a, t.b].some(x => x === s.a || x === s.b)) : []
  const r16For = (q: Tie | undefined) => q ? r16.filter(t => [t.a, t.b].some(x => x === q.a || x === q.b)) : []
  const halves = [0, 1].map(h => {
    const s = sfOrder[h]
    const qs = qfFor(s)
    return { sf: s, qf: qs, r16: qs.flatMap(q => r16For(q)) }
  })
  const tieBox = (t: Tie | undefined, x: number, y: number, w: number, pair: boolean) => {
    const sides = t ? [[t.a, t.aggA], [t.b, t.aggB]] as [string, number][] : [['', 0], ['', 0]] as [string, number][]
    return sides.map(([club, agg], i) => {
      const yy = y + i * 16
      const won = t?.winner === club
      const c = club ? colourFor(club) : null
      return (
        <g key={i} transform={`translate(${x} ${yy})`}>
          <rect width={w} height={14} fill={won ? p.card : p.page1Ground} stroke={c ?? (won ? p.highlight : 'rgba(255,255,255,0.25)')} strokeWidth={c ? 1.2 : 0.6} opacity={t && !won ? 0.75 : 1} />
          {club ? <Token x={3} y={2} size={10} colour={c ?? undefined} dashed={!c} /> : <Token x={3} y={2} size={10} dashed />}
          <text x={16} y={10} fontSize={6.5} fontWeight={won ? 800 : 500} fill={p.text}>{club ? (w > 70 ? club.slice(0, 16) : code3(club)) : ''}</text>
          {t && <text x={w - 3} y={10} fontSize={7} fontWeight={800} fill={p.text} textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>{agg}</text>}
        </g>
      )
    }).concat(pair ? [] : [])
  }

  return (
    <>
      <Hit id="field" kind="competition" x={262} y={222} w={294} h={176} onModule={onModule} active={active}>
        <Header x={262} y={222} icon="map" title={`The field / ${hasData ? `${clubs.length} clubs` : 'Clubs by country'}`} p={p} />
        <g transform="translate(262 244)">
          <rect width={294} height={154} fill={p.card} opacity={0.35} />
          {Array.from({ length: 11 * 6 }, (_, i) => <circle key={i} cx={13 + (i % 11) * 27} cy={13 + Math.floor(i / 11) * 26} r={2 + ((i * 7) % 5)} fill={p.text} opacity={0.12} />)}
          {(comp?.pinned.length ? comp.pinned : finalists).slice(0, 4).map((club, i) => (
            <g key={club} transform={`translate(${60 + i * 60} ${40 + (i % 2) * 50})`}>
              <circle r={3} fill={colourFor(club) ?? p.highlight} /><text x={6} y={3} fontSize={6.5} fontWeight={700} fill={p.text}>{club}</text>
            </g>
          ))}
          <text x={6} y={148} fontSize={6.5} fill={p.text} opacity={0.7}>{comp?.mapGrouping === 'division' ? 'Entrants by division' : 'Countries shaded by the clubs they sent'} · the choropleth draws from the entrants pack</text>
        </g>
      </Hit>
      <Rule y={404} page={1} p={p} />

      <Hit id="bracket" kind="competition" x={40} y={414} w={515} h={246} onModule={onModule} active={active}>
        <Header x={40} y={414} icon="bracket" title={`The knockouts / Round of 16 to the final`} p={p} />
        <g fontSize={6.5} fill={p.text} opacity={0.85}>
          {[[40, 'R16'], [152, 'QF'], [220, 'SF'], [267.5, 'FINAL'], [325, 'SF'], [383, 'QF'], [451, 'R16']].map(([x, l]) => <text key={`${x}${l}`} x={x as number} y={452}>{l}</text>)}
        </g>
        {halves.map((half, h) => {
          const mirror = h === 1
          const r16x = mirror ? 451 : 40
          const qfx = mirror ? 383 : 152
          const sfx = mirror ? 325 : 220
          return (
            <g key={h}>
              {Array.from({ length: 4 }, (_, i) => tieBox(half.r16[i], r16x, 466 + i * 47, 104, true))}
              {Array.from({ length: 2 }, (_, i) => tieBox(half.qf[i], qfx, 474 + i * 94, 60, true))}
              {tieBox(half.sf, sfx, 497.5, 50, true)}
              <g fill="none" stroke={p.text} strokeOpacity={0.35} strokeWidth={0.6}>
                {[0, 1, 2, 3].map(i => <path key={i} d={mirror ? `M451 ${481 + i * 47} H447 V${488 + Math.floor(i / 2) * 94} H443` : `M144 ${481 + i * 47} H148 V${488 + Math.floor(i / 2) * 94} H152`} />)}
                {[0, 1].map(i => <path key={i} d={mirror ? `M383 ${489 + i * 94} H379 V${512} H375` : `M212 ${489 + i * 94} H216 V512 H220`} />)}
              </g>
            </g>
          )
        })}
        <g transform="translate(267.5 505)" textAnchor="middle">
          {(() => {
            const winner = final ? (final.hg > final.ag ? final.h : final.ag > final.hg ? final.a : null) : null
            return (
              <>
                <text x={30} y={11} fontSize={6} fontWeight={700} fill={p.text}>{winner ? winner.toUpperCase().slice(0, 14) : 'WINNER'}</text>
                <Token x={20} y={22} size={20} colour={winner ? colourFor(winner) ?? undefined : undefined} dashed={!winner || !colourFor(winner)} />
                <text x={30} y={72} fontSize={22} fontWeight={800} fill={p.highlight} style={{ fontVariantNumeric: 'tabular-nums' }}>{final ? `${final.hg}–${final.ag}` : '–'}</text>
                <text x={30} y={86} fontSize={6} fill={p.text}>{final ? `FINAL · ${fmtDate(final.d).toUpperCase()}` : 'FINAL'}</text>
              </>
            )
          })()}
        </g>
        <text x={40} y={658} fontSize={6.5} fill={p.text} opacity={0.85}>Aggregate goals in bold, legs small · AG = through on away goals · the winner’s half reads left to right, the other right to left</text>
      </Hit>

      <Hit id="season-record" kind="competition" x={40} y={676} w={515} h={70} onModule={onModule} active={active}>
        <Header x={40} y={676} icon="trophy" title={`Season record / ${seasonLabel(seasonStart)}`} p={p} />
        <Record x={40} y={698} size={38} p={p} items={hasData
          ? [[String(rows.length), `Matches, ${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}`], [String(goals), 'Goals'], [(goals / rows.length).toFixed(2), 'Goals per game'], [`${Math.round((homeWins / rows.length) * 100)}%`, `Home wins, ${homeWins} of ${rows.length}`]]
          : [['—', 'Matches'], ['—', 'Goals'], ['—', 'Goals per game'], ['—', 'Home wins']]} />
      </Hit>

      {en('groups') && (
        <Hit id="groups" kind="competition" x={625} y={32} w={525} h={218} onModule={onModule} active={active}>
          <g transform="translate(625 32)">
            <CompTile x={0} y={0} p={p} european={european} />
            <text x={30} y={11} fontSize={10} fontWeight={800} fill={p.text} letterSpacing={0.6} style={{ fontStretch: '75%' }}>{competitionCode(spread.subjectId)}</text>
            <text x={30 + competitionCode(spread.subjectId).length * 7 + 6} y={11} fontSize={10} fontWeight={700} fill={p.highlight}>THE GROUPS{groups.length ? ` / ${groups.length} GROUPS OF ${groups[0].table.length}` : ''}</text>
          </g>
          <text x={625} y={58} fontSize={7.5} fill={p.text}>Top two to the round of 16, third to the UEFA Cup · six results in date order</text>
          {Array.from({ length: 8 }, (_, i) => {
            const g = groups[i]
            const x = 625 + (i % 4) * 133.75
            const y = 68 + Math.floor(i / 4) * 84
            return (
              <g key={i} transform={`translate(${x} ${y})`}>
                <rect width={123.75} height={74} fill={p.card} />
                <text x={6} y={11} fontSize={7} fontWeight={700} fill={p.highlight}>{g ? `GROUP ${g.g}` : `GROUP ${String.fromCharCode(65 + i)}`}</text>
                {(g?.table ?? [null, null, null, null]).slice(0, 4).map((r, j) => (
                  <g key={j} transform={`translate(6 ${16 + j * 14})`}>
                    {r ? <Token x={0} y={2} size={9} colour={colourFor(r.team) ?? undefined} dashed={!colourFor(r.team)} /> : <Token x={0} y={2} size={9} dashed />}
                    <text x={13} y={9} fontSize={6.5} fontWeight={j < 2 ? 700 : 400} fill={p.text} opacity={j >= 2 ? 0.7 : 1}>{r ? r.team.slice(0, 16) : ''}</text>
                    {r && <text x={112} y={9} fontSize={6.5} fontWeight={800} fill={p.text} textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.pts}</text>}
                    {j === 1 && <line x1={0} x2={112} y1={13} y2={13} stroke={p.text} strokeOpacity={0.5} strokeWidth={0.5} strokeDasharray="2 1.5" />}
                  </g>
                ))}
              </g>
            )
          })}
          <text x={625} y={245} fontSize={7} fill={p.text} opacity={0.85}>Dashed line = qualification cut · points from the group matches · tie-break notes come with the pack</text>
        </Hit>
      )}

      <Hit id="finalists" kind="competition" x={625} y={262} w={525} h={130} onModule={onModule} active={active}>
        <Header x={625} y={262} icon="clock" title={`The finalists${finalists.length ? ` / ${finalists.join(' and ')}` : ''}`} p={p} />
        {[0, 1].map(i => {
          const f = finalists[i]
          const games = f ? resultsStrip(rows.filter(m => m.h === f || m.a === f).sort((a, b) => a.d.localeCompare(b.d)), f) : []
          const y = 288 + i * 46
          return (
            <g key={i} transform={`translate(625 ${y})`}>
              <rect width={100} height={38} fill={p.card} />
              {f ? <Token x={6} y={5} size={12} colour={colourFor(f) ?? undefined} dashed={!colourFor(f)} /> : <Token x={6} y={5} size={12} dashed />}
              <text x={6} y={31} fontSize={7} fontWeight={700} fill={p.text}>{f ?? `Finalist ${i + 1}`}</text>
              {Array.from({ length: 13 }, (_, j) => {
                const g = games[j]
                const x = 108 + j * 32.08
                const isFinal = g && final && g.d === final.d
                return (
                  <g key={j} transform={`translate(${x} 0)`}>
                    <rect width={30.08} height={38} fill={g ? rc[g.r] : p.card} opacity={g ? 0.28 : 0.6} stroke={isFinal ? p.highlight : 'none'} strokeWidth={1.2} />
                    {g && <>
                      <text x={15} y={14} fontSize={6.5} fontWeight={700} fill={p.text} textAnchor="middle">{code3(g.opponent)}</text>
                      <text x={15} y={25} fontSize={7} fontWeight={800} fill={p.text} textAnchor="middle" style={{ fontVariantNumeric: 'tabular-nums' }}>{g.gf}-{g.ga}</text>
                      <text x={15} y={34} fontSize={6} fill={p.text} textAnchor="middle" opacity={0.8}>{g.home ? 'H' : 'A'}</text>
                    </>}
                  </g>
                )
              })}
            </g>
          )
        })}
        <text x={625} y={387} fontSize={6.5} fill={p.text} opacity={0.85}>Scores finalist first · H home / A away / N neutral (the final) · outlined = the final · cell colour = result</text>
      </Hit>
      <Rule y={394} page={2} p={p} />

      <Hit id="final" kind="competition" x={625} y={404} w={525} h={208} onModule={onModule} active={active}>
        <Header x={625} y={404} icon="pitch" title={`The final${final ? ` / ${final.h} ${final.hg}–${final.ag} ${final.a}` : ''}`} p={p} />
        <g transform="translate(625 428)">
          <rect width={255} height={160} fill="none" stroke={p.text} strokeOpacity={0.35} strokeWidth={0.6} />
          <line x1={127.5} x2={127.5} y1={0} y2={160} stroke={p.text} strokeOpacity={0.35} strokeWidth={0.6} />
          <circle cx={127.5} cy={80} r={18} fill="none" stroke={p.text} strokeOpacity={0.35} strokeWidth={0.6} />
          <rect x={0} y={40} width={40} height={80} fill="none" stroke={p.text} strokeOpacity={0.35} strokeWidth={0.6} /><rect x={215} y={40} width={40} height={80} fill="none" stroke={p.text} strokeOpacity={0.35} strokeWidth={0.6} />
          <text x={6} y={172} fontSize={6.5} fill={p.text} opacity={0.75}>Every shot, sized by xG; filled = goal · StatsBomb data when published</text>
        </g>
        <g transform="translate(900 430)" fontSize={6.5} fill={p.text}>
          <text y={8} fontSize={9} fontWeight={700}>{final ? `${final.h} v ${final.a}` : 'Finalists'}</text>
          {['Goals', 'Shots', 'Expected goals', 'Passes', 'Pass completion %', 'Pressures'].map((k, i) => (
            <g key={k} transform={`translate(0 ${22 + i * 23})`}>
              <text y={8}>{k}</text>
              <text x={200} y={8} textAnchor="end" fontWeight={700} style={{ fontVariantNumeric: 'tabular-nums' }}>{k === 'Goals' && final ? final.hg : '—'}</text>
              <text x={250} y={8} textAnchor="end" fontWeight={700} style={{ fontVariantNumeric: 'tabular-nums' }}>{k === 'Goals' && final ? final.ag : '—'}</text>
              <rect y={12} width={250} height={0.4} fill={p.text} opacity={0.16} />
            </g>
          ))}
          <text y={170} fontSize={7.5} opacity={0.85}>{(row.editorial.notes.final ?? '').slice(0, 70) || 'Team comparison from the final’s event data'}</text>
        </g>
      </Hit>
      <Rule y={614} page={2} p={p} />

      <Hit id="scorers" kind="competition" x={625} y={624} w={255} h={158} onModule={onModule} active={active}>
        <Header x={625} y={624} icon="trophy" title="The scorers / Five goals or more" p={p} />
        {Array.from({ length: 8 }, (_, i) => (
          <g key={i} transform={`translate(625 ${648 + i * 15})`}>
            <text y={9} fontSize={7} fill={p.text} opacity={0.8} style={{ fontVariantNumeric: 'tabular-nums' }}>{i + 1}</text>
            <rect x={14} y={4} width={90} height={4} rx={1} fill={p.text} opacity={0.15} />
            <Token x={150} y={1} size={10} dashed />
            <rect x={225} y={4} width={30} height={4} rx={1} fill={p.text} opacity={0.15} />
          </g>
        ))}
        <text x={625} y={778} fontSize={6.5} fill={p.text} opacity={0.85}>Qualifying included · from the scorers pack</text>
      </Hit>

      <Hit id="oddities" kind="competition" x={900} y={624} w={250} h={158} onModule={onModule} active={active}>
        <Header x={900} y={624} icon="clock" title="The oddities / Six things that happened" p={p} />
        {Array.from({ length: 6 }, (_, i) => {
          const o = comp?.oddities[i]
          const x = 900 + (i % 2) * 128
          const y = 646 + Math.floor(i / 2) * 47
          return (
            <g key={i} transform={`translate(${x} ${y})`}>
              <rect width={122} height={44} fill={p.card} opacity={o ? 1 : 0.5} />
              <rect width={1.6} height={44} fill={p.highlight} />
              {o
                ? wrap(o.text, 30).slice(0, 4).map((l, j) => <text key={j} x={7} y={12 + j * 9} fontSize={6.5} fill={p.text}>{l}</text>)
                : !compact && <text x={7} y={12} fontSize={6.5} fill={p.text} opacity={0.5}>Oddity {i + 1}</text>}
            </g>
          )
        })}
      </Hit>
    </>
  )
}

// ---------------------------------------------------------------------------

/**
 * A spread as the builder will lay it out, on the 1190 × 842 pt canvas:
 * the shared page-1 frame (kicker, two-line headline at 55 pt, mark, story
 * stat at 53 pt, story copy, season record, marks line, footer) and each
 * template's modules at the reference spreads' positions. Modules that the
 * admin's match data can draw (the climb, the calendar, the race, the lead
 * strip, the table, the bracket, the groups, the finalists) draw it; the
 * rest keep the reference's form with dashed placeholders until the data
 * packs land. Every module carries `data-module`; clicking one opens the tab
 * that drives it.
 */
export function SpreadCanvas({ spread, row, seasonStart, data, onModule, className = '', compact = false, activeModule = null, showRegions = false }: {
  spread: PlannedSpread
  row: BookSpread
  seasonStart: number
  data?: CanvasData
  onModule?: (module: SpreadModule) => void
  className?: string
  /** Thumbnail: no placeholder prose. */
  compact?: boolean
  activeModule?: string | null
  /** Outline every region with its id (the System view). */
  showRegions?: boolean
}) {
  const p = spreadPalette(row)
  const pages = { spread, row, seasonStart, p, data, compact, onModule, active: activeModule }
  const copy = spread.kind === 'league' ? { size: 11, leading: 14.6, chars: 40 } : { size: 12, leading: 17, chars: 36 }
  return (
    <svg viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`} className={className} role="img" aria-label={`${spread.label} spread`} style={{ fontFamily: FONT }}>
      <rect x={0} y={0} width={CANVAS.fold} height={CANVAS.height} fill={p.page1Ground} />
      <rect x={CANVAS.fold} y={0} width={CANVAS.fold} height={CANVAS.height} fill={p.page2Ground} />
      <Frame spread={spread} row={row} seasonStart={seasonStart} p={p} compact={compact} onModule={onModule} active={activeModule} storyWidth={spread.kind === 'league' ? 220 : 205} copySize={copy} />
      {spread.kind === 'team' && <TeamPages {...pages} />}
      {spread.kind === 'league' && <LeaguePages {...pages} />}
      {spread.kind === 'competition' && <CompetitionPages {...pages} />}
      {showRegions && [...FRAME_REGIONS, ...SPREAD_TEMPLATES[spread.kind].regions].map(r => (
        <g key={r.id}>
          <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={0.8} strokeDasharray="4 3" />
          <text x={r.x + 3} y={r.y - 3} fontSize={7} fill="#FFFFFF" opacity={0.9}>{r.id} · {r.x},{r.y} · {r.w}×{r.h}</text>
        </g>
      ))}
    </svg>
  )
}

export type { Result }
