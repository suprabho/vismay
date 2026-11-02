'use client'

import { useId } from 'react'
import type { BookSpread, PaletteRole, SpreadModule } from '@/lib/seasonBooks/seasonSpreads'
import { resultColours, SPREAD_ICONS } from '@/lib/seasonBooks/spreadLayouts'
import type { BracketBox, CompetitionPack } from '@/lib/seasonBooks/spreadPack'
import { KitToken } from './PackModules'

type P = Record<PaletteRole, string>

function Head({ x, y, icon, title, p }: { x: number; y: number; icon: string; title: string; p: P }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={SPREAD_ICONS[icon] ?? SPREAD_ICONS.trend} fill="none" stroke={p.highlight} strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
      <text x={22} y={10.5} fontSize={10} fontWeight={700} fill={p.highlight}>{title.toUpperCase()}</text>
    </g>
  )
}

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

function Field({ pack, p }: { pack: CompetitionPack; p: P }) {
  const id = useId()
  const tone = { text: p.text, winner: p.highlight, runner: p.draw }
  return (
    <>
      <clipPath id={id}><rect x={262} y={244} width={294} height={154} /></clipPath>
      <g clipPath={`url(#${id})`}>
        {pack.map.countries.map((c, i) => <path key={i} d={c.d} fill="#FFFFFF" fillOpacity={c.shade} stroke={p.page1Ground} strokeOpacity={0.6} strokeWidth={0.3} />)}
      </g>
      {pack.map.dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={2.3} fill="#FFFFFF" fillOpacity={d.shade} stroke="#FFFFFF" strokeWidth={0.5} />)}
      {pack.map.keys.map(k => <rect key={k.x} x={k.x} y={290} width={10} height={7} fill="#FFFFFF" fillOpacity={k.shade} />)}
      {pack.map.pins.map(d => <circle key={d.tone} cx={d.x} cy={d.y} r={2.6} fill={tone[d.tone]} stroke={p.page1Ground} strokeWidth={0.6} />)}
      {pack.map.texts.map((t, i) => (
        <text key={i} x={t.x} y={t.y} fontSize={t.size} fontWeight={t.weight} textAnchor={t.anchor} fill={tone[t.tone]} paintOrder="stroke" stroke={t.size < 6.5 ? p.page1Ground : 'none'} strokeWidth={1.5}>{t.text}</text>
      ))}
    </>
  )
}

function Box({ b, p }: { b: BracketBox; p: P }) {
  const size = 9
  const edge = b.finalist ? (b.mirror ? b.w - 1.4 : 0) : null
  return (
    <g transform={`translate(${b.x} ${b.y})`} opacity={b.out ? 0.5 : 1}>
      <rect width={b.w} height={14} fill={p.card} />
      {edge !== null && <rect x={edge} width={1.4} height={14} fill={p.highlight} />}
      <KitToken t={b.token} x={b.mirror ? b.w - size - 3 : 3} y={2.5} size={size} />
      <text x={b.mirror ? b.w - size - 6 : size + 6} y={10} fontSize={7} fontWeight={700} fill={p.text} textAnchor={b.mirror ? 'end' : 'start'}>{b.label}</text>
      {b.legs && <text x={b.mirror ? 14 : b.w - 14} y={9.6} fontSize={6} fill={p.text} opacity={0.75} textAnchor={b.mirror ? 'start' : 'end'} style={{ fontVariantNumeric: 'tabular-nums' }}>{b.legs}</text>}
      {b.ag && <text x={b.mirror ? 14 + (b.legs ? 21 : 0) : b.w - 14 - (b.legs ? 21 : 0)} y={9.6} fontSize={5.5} fontWeight={800} fill={p.highlight} textAnchor={b.mirror ? 'start' : 'end'}>AG</text>}
      <text x={b.mirror ? 3 : b.w - 3} y={10.2} fontSize={7.5} fontWeight={800} fill={p.text} textAnchor={b.mirror ? 'start' : 'end'} style={{ fontVariantNumeric: 'tabular-nums' }}>{b.agg}</text>
    </g>
  )
}

function Bracket({ pack, p }: { pack: CompetitionPack; p: P }) {
  const b = pack.bracket
  return (
    <>
      {b.columns.map(c => <text key={`${c.x}`} x={c.x + c.w / 2} y={452} fontSize={6.5} fontWeight={700} fill={p.highlight} textAnchor="middle">{c.label}</text>)}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {b.links.map((l, i) => <path key={i} d={l.d} stroke={l.finalist ? p.highlight : 'rgba(255,255,255,0.35)'} strokeWidth={l.finalist ? 1.1 : 0.7} />)}
      </g>
      {b.boxes.map((box, i) => <Box key={i} b={box} p={p} />)}
      <g textAnchor="middle" fill={p.text}>
        <circle cx={297.5} cy={491} r={10} fill="none" stroke={p.highlight} strokeWidth={0.8} />
        <path d="M297.5 485 L299 489.2 L303.4 489.3 L299.9 492 L301.2 496.2 L297.5 493.7 L293.8 496.2 L295.1 492 L291.6 489.3 L296 489.2 Z" fill={p.highlight} />
        <text x={297.5} y={518} fontSize={6.5} fontWeight={700} fill={p.highlight}>{b.winner.name.toUpperCase()}</text>
        <text x={297.5} y={526} fontSize={6.5} fontWeight={700}>CHAMPIONS</text>
        <KitToken t={b.winner.token} x={278.5} y={541} size={18} />
        <KitToken t={b.runner.token} x={298.5} y={541} size={18} />
        <text x={297.5} y={584} fontSize={22} fontWeight={800} style={{ fontVariantNumeric: 'tabular-nums' }}>{b.score}</text>
        {b.lines.map((l, i) => <text key={l} x={297.5} y={596 + i * 8} fontSize={6}>{l}</text>)}
      </g>
      <text x={40} y={659} fontSize={6.5} fill={p.text} opacity={0.85}>{pack.bracketNote}</text>
    </>
  )
}

function Groups({ pack, p }: { pack: CompetitionPack; p: P }) {
  const rc = resultColours(p)
  return (
    <>
      <text x={625} y={58} fontSize={7.5} fill={p.text}>{pack.groupsSub}</text>
      {pack.groups.map((g, i) => {
        const x = 625 + (i % 4) * 133.75
        const y = 68 + Math.floor(i / 4) * 84
        return (
          <g key={g.name} transform={`translate(${x} ${y})`}>
            <rect width={123.75} height={74} fill={p.card} />
            <text x={4} y={13} fontSize={7} fontWeight={700} fill={p.highlight} letterSpacing={0.28}>{g.name}</text>
            {g.rows.map((r, j) => (
              <g key={r.club} transform={`translate(0 ${18 + j * 13})`} opacity={r.pos > 2 ? 0.62 : 1}>
                {r.finalist && <rect width={123.75} height={13} fill="#FFFFFF" fillOpacity={0.12} />}
                <text x={4} y={9} fontSize={6} fill={p.text} style={{ fontVariantNumeric: 'tabular-nums' }}>{r.pos}</text>
                <KitToken t={r.token} x={12} y={2} size={9} />
                <text x={25} y={9} fontSize={6.8} fontWeight={700} fill={p.text} style={{ fontStretch: '80%' }}>{r.club}</text>
                {r.results.map((v, k) => <circle key={k} cx={76 + k * 4.4} cy={6.5} r={1.7} fill={rc[v]} />)}
                <text x={119.75} y={9} fontSize={7} fontWeight={800} fill={p.text} textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.pts}</text>
              </g>
            ))}
            <line x1={4} x2={119.75} y1={44} y2={44} stroke={p.highlight} strokeWidth={0.6} strokeDasharray="2.4 1.8" />
          </g>
        )
      })}
      <g transform="translate(625 238)" fontSize={7} fill={p.text}>
        {(['W', 'D', 'L'] as const).map((k, i) => <g key={k} transform={`translate(${i * 24} 0)`}><circle cx={2.5} cy={4} r={2.5} fill={rc[k]} /><text x={9} y={6.5}>{k}</text></g>)}
        <line x1={76} x2={88} y1={4} y2={4} stroke={p.highlight} strokeWidth={0.8} strokeDasharray="2.4 1.8" />
        <text x={93} y={6.5}>Through to R16</text>
        <text x={160} y={6.5} opacity={0.85}>{pack.groupsNote}</text>
      </g>
    </>
  )
}

function Finalists({ pack, p }: { pack: CompetitionPack; p: P }) {
  const rc = resultColours(p)
  return (
    <>
      {pack.finalists.map((f, i) => (
        <g key={f.name} transform={`translate(625 ${288 + i * 46})`}>
          <rect width={1.4} height={38} fill={i ? p.draw : p.highlight} />
          <KitToken t={f.token} x={8} y={6} size={24} />
          <text x={38} y={13} fontSize={10.5} fontWeight={800} fill={p.text}>{f.name.toUpperCase()}</text>
          <text x={38} y={23} fontSize={7} fill={p.text}><tspan fontWeight={700} fill={i ? p.draw : p.highlight}>{f.record}</tspan> {f.goals}</text>
          <text x={38} y={33} fontSize={6.5} fill={p.text} opacity={0.8}>{f.state}</text>
          {f.games.map((g, j) => {
            const x = 108 + j * 32.077
            const dark = g.r !== 'L'
            return (
              <g key={j} transform={`translate(${x} 0)`} textAnchor="middle">
                {g.stage && <text x={15} y={5} fontSize={5.5} fontWeight={700} fill={p.highlight}>{g.stage}</text>}
                <rect y={8} width={30.08} height={15} fill={rc[g.r]} stroke={g.final ? '#FFFFFF' : 'none'} strokeWidth={1.1} />
                <text x={15} y={18.5} fontSize={7.5} fontWeight={800} fill={dark ? '#141414' : '#FFFFFF'} style={{ fontVariantNumeric: 'tabular-nums' }}>{g.score}</text>
                <KitToken t={g.token} x={2} y={26} size={7} />
                <text x={10} y={32} fontSize={5} fontWeight={800} fill={p.text} textAnchor="start" style={{ fontStretch: '75%' }}>{g.code}</text>
                <text x={25} y={32} fontSize={5} fill={p.text} opacity={0.8} textAnchor="start">{g.venue}</text>
              </g>
            )
          })}
        </g>
      ))}
      <text x={625} y={387} fontSize={6.5} fill={p.text} opacity={0.85}>Scores finalist first · H home / A away / N neutral (the final) · outlined = the final</text>
    </>
  )
}

function Final({ pack, p }: { pack: CompetitionPack; p: P }) {
  const f = pack.final
  const [a, b] = pack.finalists
  const scale = 255 / 120
  return (
    <>
      <g transform={`translate(625 428) scale(${scale})`}>
        <g fill="none" stroke={p.draw} strokeOpacity={0.45} strokeWidth={0.35}>
          <rect width={120} height={80} /><line x1={60} y1={0} x2={60} y2={80} /><circle cx={60} cy={40} r={10} />
          <rect y={18} width={18} height={44} /><rect x={102} y={18} width={18} height={44} /><rect y={30} width={6} height={20} /><rect x={114} y={30} width={6} height={20} />
        </g>
        {f.shots.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={s.goal ? p.highlight : 'none'} fillOpacity={0.95} stroke={s.winner ? p.highlight : p.draw} strokeWidth={0.6} />)}
      </g>
      <g fill="none" stroke={p.text} strokeOpacity={0.6} strokeWidth={0.5}>{f.leaders.map(d => <path key={d} d={d} />)}</g>
      {f.labels.map(l => <text key={l.text} x={l.x + 60} y={l.y + 7} fontSize={6.5} fontWeight={700} fill={p.text} textAnchor="middle">{l.text}</text>)}
      <text x={625} y={610} fontSize={6.5} fill={p.text} opacity={0.85}>{f.caption}</text>
      <KitToken t={a.token} x={900} y={430} size={14} />
      <text x={919} y={441} fontSize={10.5} fontWeight={800} fill={p.highlight}>{a.name.toUpperCase()}</text>
      <text x={1131} y={441} fontSize={10.5} fontWeight={800} fill={p.draw} textAnchor="end">{b.name.toUpperCase()}</text>
      <KitToken t={b.token} x={1136} y={430} size={14} />
      {f.bars.map((r, i) => {
        const max = Math.max(r.av, r.bv) || 1
        const y = 452 + i * 23
        return (
          <g key={r.label}>
            <text x={1025} y={y + 7} fontSize={6.5} fontWeight={700} fill={p.text} textAnchor="middle" letterSpacing={0.26}>{r.label.toUpperCase()}</text>
            <text x={900} y={y + 17} fontSize={8} fontWeight={800} fill={p.text} style={{ fontVariantNumeric: 'tabular-nums' }}>{r.a}</text>
            <rect x={1022 - (r.av / max) * 80} y={y + 9} width={(r.av / max) * 80} height={10} fill={p.highlight} />
            <rect x={1028} y={y + 9} width={(r.bv / max) * 80} height={10} fill={p.draw} />
            <text x={1150} y={y + 17} fontSize={8} fontWeight={800} fill={p.text} textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.b}</text>
          </g>
        )
      })}
      {wrapLines(f.note, 62).slice(0, 2).map((l, i) => <text key={l} x={900} y={599 + i * 10} fontSize={7.5} fill={p.text}>{l}</text>)}
    </>
  )
}

function Scorers({ pack, p }: { pack: CompetitionPack; p: P }) {
  const max = Math.max(1, ...pack.scorers.map(s => s.goals))
  return (
    <>
      {pack.scorers.map((s, i) => (
        <g key={s.player} transform={`translate(625 ${648 + i * 15})`}>
          <text y={9} fontSize={6.5} fill={p.text} opacity={0.85} style={{ fontVariantNumeric: 'tabular-nums' }}>{s.rank}</text>
          <KitToken t={s.token} x={14} y={1} size={10} />
          <text x={28} y={9} fontSize={7.5} fontWeight={700} fill={p.text}>{s.player}</text>
          <rect x={108} y={2} width={(s.goals / max) * 106} height={8} fill={i < 2 ? p.draw : '#8A8780'} />
          <text x={112 + (s.goals / max) * 106} y={9} fontSize={7.5} fontWeight={800} fill={p.text} style={{ fontVariantNumeric: 'tabular-nums' }}>{s.goals}</text>
          <text x={255} y={9} fontSize={6} fill={p.text} opacity={0.8} textAnchor="end">{s.per}</text>
        </g>
      ))}
      <text x={625} y={778} fontSize={6.5} fill={p.text} opacity={0.85}>{pack.scorersNote}</text>
    </>
  )
}

function Oddities({ pack, row, p }: { pack: CompetitionPack; row: BookSpread; p: P }) {
  return (
    <>
      {(row.competition?.oddities ?? []).slice(0, 6).map((o, i) => {
        const at = o.text.indexOf(' · ')
        const head = at < 0 ? '' : o.text.slice(0, at)
        const body = at < 0 ? o.text : o.text.slice(at + 3)
        const x = 900 + (i % 2) * 128
        const y = 646 + Math.floor(i / 2) * 47
        const tokens = pack.oddityTokens[i] ?? []
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <rect width={122} height={44} fill={p.card} />
            <text x={6} y={17} fontSize={16} fontWeight={800} fill={p.highlight} style={{ fontVariantNumeric: 'tabular-nums' }}>{head}</text>
            {tokens.map((t, j) => <KitToken key={j} t={t} x={122 - 6 - (tokens.length - j) * 13 + 2} y={5} size={11} />)}
            {wrapLines(body, 37).slice(0, 3).map((l, j) => <text key={l} x={6} y={26 + j * 7} fontSize={6} fill={p.text}>{l}</text>)}
          </g>
        )
      })}
    </>
  )
}

/** The competition template drawn from its data pack; the oddities' words stay the row's. */
export function CompetitionPackPages({ pack, row, p, onModule, active, modules }: {
  pack: CompetitionPack; row: BookSpread; seasonStart: number; p: P; onModule?: (m: SpreadModule) => void; active: string | null; modules: readonly SpreadModule[]
}) {
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
  const en = (id: string) => row.modules[id]?.enabled ?? true
  const rule = (x: number, y: number, w: number) => <rect x={x} y={y} width={w} height={0.6} fill={p.text} opacity={0.45} />
  return (
    <>
      {hit('field', 262, 222, 294, 176, <><Head x={262} y={222} icon="map" title={pack.fieldTitle} p={p} /><Field pack={pack} p={p} /></>)}
      {rule(40, 404, 515)}
      {hit('bracket', 40, 414, 515, 252, <><Head x={40} y={414} icon="bracket" title={pack.bracketTitle} p={p} /><Bracket pack={pack} p={p} /></>)}
      {hit('season-record', 40, 676, 515, 70, (
        <>
          <Head x={40} y={676} icon="trophy" title="Season record / 2003-04" p={p} />
          {pack.record.map((r, i) => (
            <g key={r.label} transform={`translate(${40 + i * 132} 698)`}>
              <text y={32} fontSize={38} fontWeight={800} fill={p.text} style={{ fontVariantNumeric: 'tabular-nums' }}>{r.value}</text>
              <text y={48} fontSize={7.5} fill={p.text}>{r.label.toUpperCase()}</text>
            </g>
          ))}
        </>
      ))}
      {en('groups') && hit('groups', 625, 32, 525, 218, (
        <>
          <text x={625} y={43} fontSize={10} fontWeight={700} fill={p.highlight}><tspan fontWeight={800} fill={p.text} style={{ fontStretch: '75%' }}>{pack.code}</tspan>  {pack.groupsTitle}</text>
          <Groups pack={pack} p={p} />
        </>
      ))}
      {hit('finalists', 625, 262, 525, 130, <><Head x={625} y={262} icon="clock" title={pack.finalistsTitle} p={p} /><Finalists pack={pack} p={p} /></>)}
      {rule(625, 394, 525)}
      {hit('final', 625, 404, 525, 208, <><Head x={625} y={404} icon="pitch" title={pack.finalTitle} p={p} /><Final pack={pack} p={p} /></>)}
      {rule(625, 614, 525)}
      {hit('scorers', 625, 624, 255, 158, <><Head x={625} y={624} icon="trophy" title="The scorers / Five goals or more" p={p} /><Scorers pack={pack} p={p} /></>)}
      {hit('oddities', 900, 624, 250, 158, <><Head x={900} y={624} icon="clock" title="The oddities / Six things that happened" p={p} /><Oddities pack={pack} row={row} p={p} /></>)}
    </>
  )
}
