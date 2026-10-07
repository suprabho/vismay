'use client'

import Link from 'next/link'
import { ArrowDown, ShareNetwork, Timer } from '@phosphor-icons/react'
import {
  FASTEST_LAP,
  LAP1_DELTAS,
  RECAP_BEATS,
  RECAP_CARS,
  RESULTS,
  T4_APEX,
  T4_NOW,
  T4_TELEMETRY,
  T4_TRACES,
  UNDERCUT_GAP,
  UNDERCUT_PITS,
  UNDERCUT_TILES,
  carColor,
} from '@/lib/recap/sampleRecap'

const card = 'rounded-xl border border-border bg-surface'
const tile = 'rounded-[10px] border border-border bg-surface'

/**
 * The four chapters of the recap, in reading order. Each is a `[data-beat]`
 * section: the rail's scroll position picks the beat the replay shows, and in
 * the story view the inactive chapters dim.
 */
export function RecapChapters({
  beat,
  story,
  round,
  onShare,
  shared,
}: {
  beat: number
  /** The replay story view (dimmed chapters, screen-tall sections), vs the one-page article. */
  story: boolean
  round: number
  onShare: () => void
  shared: boolean
}) {
  return (
    <>
      <Chapter
        index={0}
        beat={beat}
        story={story}
        title="Norris jumps two places into Turn 1"
        dek="A clean launch from P3 and a late move around the outside put the McLaren in front before the first braking zone."
      >
        <Lap1Card />
        {story ? (
          <div className="mt-[22px] flex items-center gap-2 font-mono text-[10px] tracking-[0.1em] text-muted">
            <ArrowDown size={14} weight="bold" aria-hidden />
            SCROLL — THE REPLAY FOLLOWS
          </div>
        ) : null}
      </Chapter>

      <Chapter
        index={1}
        beat={beat}
        story={story}
        title="An early stop flips a 1.8s deficit"
        dek="Red Bull boxed Verstappen on lap 18. Three laps on fresh tyres were enough to come out ahead when Norris stopped on lap 21."
      >
        <UndercutCard />
        <div className="mt-2.5 grid grid-cols-3 gap-2.5">
          {UNDERCUT_TILES.map((t) => (
            <div key={t.label} className={`${tile} p-3.5`}>
              <div
                className="font-mono text-[17px] font-semibold lg:text-[22px]"
                style={t.highlight ? { color: carColor('VER') } : undefined}
              >
                {t.value}
              </div>
              <div className="mt-1 text-xs text-muted">{t.label}</div>
            </div>
          ))}
        </div>
      </Chapter>

      <Chapter
        index={2}
        beat={beat}
        story={story}
        title="Side by side through Turn 4"
        dek="Verstappen braked later, Norris carried more speed through the apex and held the inside on exit. The traces follow the replay frame by frame."
      >
        <TelemetryCard />
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          {T4_TELEMETRY.map((d) => (
            <DriverTile key={d.code} {...d} />
          ))}
        </div>
      </Chapter>

      <Chapter
        index={3}
        beat={beat}
        story={story}
        title="Norris holds on by 1.6 seconds"
        dek="The lap-34 move stuck. Verstappen closed to within a second twice in the final stint but never got back into DRS range."
      >
        <ResultsCard />
        <div className={`${tile} mt-2.5 flex items-center gap-2.5 px-3.5 py-3 font-mono text-[11px]`}>
          <Timer size={16} weight="bold" className="text-[#b48cff]" aria-hidden />
          <span className="text-muted">FASTEST LAP</span>
          <span>
            {FASTEST_LAP.code} · {FASTEST_LAP.time} · L{FASTEST_LAP.lap}
          </span>
        </div>
        <div className="mt-[22px] flex flex-wrap gap-2.5">
          <Link
            href={`/race/${round}/replay`}
            className="flex h-11 items-center rounded-[10px] bg-accent px-[18px] text-sm font-bold text-accent-text hover:opacity-90"
          >
            Open the full replay
          </Link>
          <button
            type="button"
            onClick={onShare}
            className="flex h-11 cursor-pointer items-center gap-2 rounded-[10px] border border-[#2c3242] px-[18px] text-sm font-semibold hover:border-muted"
          >
            <ShareNetwork size={16} weight="bold" aria-hidden />
            {shared ? 'Link copied' : 'Share recap'}
          </button>
        </div>
      </Chapter>
    </>
  )
}

function Chapter({
  index,
  beat,
  story,
  title,
  dek,
  children,
}: {
  index: number
  beat: number
  story: boolean
  title: string
  dek: string
  children: React.ReactNode
}) {
  const b = RECAP_BEATS[index]
  return (
    <section
      data-beat={index}
      aria-labelledby={`recap-beat-${index}`}
      className={`box-border pt-6 transition-opacity duration-[450ms] motion-reduce:transition-none lg:pt-14 ${
        story ? 'min-h-[380px] lg:min-h-[640px]' : 'pb-4'
      }`}
      style={{ opacity: !story || index === beat ? 1 : 0.3 }}
    >
      <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-accent">
        0{index + 1} — {b.kicker}
      </div>
      <h2
        id={`recap-beat-${index}`}
        className="mt-3 text-[32px] font-bold uppercase leading-[0.98] wdth-display lg:text-[54px]"
      >
        {title}
      </h2>
      <p className="mt-3.5 max-w-[520px] text-[15px] leading-normal text-[#b9b9c3] lg:text-lg">{dek}</p>
      {children}
    </section>
  )
}

/* ── 01 Lights out ────────────────────────────────────────────────────── */

function Lap1Card() {
  const maxPlaces = 3 // half the bar track = 3 places, so ±2 fills about two thirds
  return (
    <div className={`${card} mt-6 p-5`}>
      <div className="flex items-end gap-4">
        <div className="text-[76px] font-bold leading-[0.8] [font-stretch:62%] lg:text-[116px]">+2</div>
        <div className="pb-1 text-sm leading-[1.4] text-[#b9b9c3]">
          places gained by <b style={{ color: carColor('NOR') }}>NOR</b>
          <br />
          between lights out and T1
        </div>
      </div>
      <div className="mt-[22px] font-mono text-[10px] tracking-[0.1em] text-muted">LAP 1 · POSITIONS GAINED / LOST</div>
      <div className="mt-2.5 flex flex-col gap-1" role="list" aria-label="Positions gained or lost on lap 1">
        {LAP1_DELTAS.map(({ code, delta }) => {
          const w = `${(Math.abs(delta) / maxPlaces) * 50}%`
          return (
            <div
              key={code}
              role="listitem"
              className="grid h-[26px] grid-cols-[40px_minmax(0,1fr)_28px] items-center gap-3 font-mono text-xs"
            >
              <span className="font-bold">{code}</span>
              <div className="relative h-2.5">
                <div className="absolute -bottom-[5px] -top-[5px] left-1/2 w-px bg-[#3a4154]" />
                {delta > 0 ? (
                  <div className="absolute inset-y-0 left-1/2 rounded-sm bg-[#e6e6ea]" style={{ width: w }} />
                ) : delta < 0 ? (
                  <div className="absolute inset-y-0 right-1/2 rounded-sm bg-accent" style={{ width: w }} />
                ) : (
                  <div className="absolute left-[calc(50%-3px)] top-0.5 size-1.5 rounded-full bg-muted" />
                )}
              </div>
              <span className={`text-right ${delta === 0 ? 'text-muted' : ''}`}>
                {delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : '0'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── 02 The undercut ──────────────────────────────────────────────────── */

const fmtSigned = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

function UndercutCard() {
  const first = UNDERCUT_GAP[0].lap
  const last = UNDERCUT_GAP[UNDERCUT_GAP.length - 1].lap
  const x = (lap: number) => 40 + ((lap - first) / (last - first)) * 440
  const y = (gap: number) => 100 - gap * 35
  const end = UNDERCUT_GAP[UNDERCUT_GAP.length - 1]
  const ver = carColor('VER')
  return (
    <div className={`${card} mt-6 p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[15px] font-semibold">Gap, VER to NOR</span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
          <span className="h-[3px] w-3.5 rounded-sm" style={{ background: ver }} />
          SECONDS · ABOVE 0 = VER BEHIND
        </span>
      </div>
      <svg
        viewBox="0 0 520 212"
        width="100%"
        className="mt-3.5 block font-mono"
        role="img"
        aria-label={`Gap from Verstappen to Norris falls from ${UNDERCUT_GAP[0].gap} seconds behind on lap ${first} to ${-end.gap} seconds ahead by lap ${last}, crossing zero after Norris pits on lap ${UNDERCUT_PITS.NOR}.`}
      >
        {[2, 1, 0, -1, -2].map((g) => (
          <g key={g}>
            <line x1={40} x2={500} y1={y(g)} y2={y(g)} stroke={g === 0 ? '#4a5163' : '#1f2330'} />
            <text x={30} y={y(g) + 3} textAnchor="end" fontSize={10} fill={g === 0 ? '#c9c9d1' : '#8e8e99'}>
              {fmtSigned(g)}
            </text>
          </g>
        ))}
        {(['VER', 'NOR'] as const).map((code) => (
          <g key={code}>
            <line x1={x(UNDERCUT_PITS[code])} x2={x(UNDERCUT_PITS[code])} y1={20} y2={182} stroke="#8e8e99" strokeDasharray="3 4" />
            <text x={x(UNDERCUT_PITS[code]) + 4} y={16} fontSize={9} fill="#c9c9d1">
              {code} PIT
            </text>
          </g>
        ))}
        <polyline
          points={UNDERCUT_GAP.map((p) => `${x(p.lap)},${y(p.gap)}`).join(' ')}
          fill="none"
          stroke={ver}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={x(end.lap)} cy={y(end.gap)} r={4.5} fill={ver} stroke="#13161d" strokeWidth={2} />
        <text x={x(end.lap) - 4} y={y(end.gap) + 21} textAnchor="end" fontSize={10} fill="#f5f5f5">
          {fmtSigned(end.gap)}s
        </text>
        {[12, 16, 20, 24, 28].map((lap) => (
          <text key={lap} x={x(lap)} y={204} textAnchor="middle" fontSize={10} fill="#8e8e99">
            L{lap}
          </text>
        ))}
      </svg>
    </div>
  )
}

/* ── 03 Wheel to wheel ────────────────────────────────────────────────── */

function TelemetryCard() {
  const x = (d: number) => 40 + d * 480
  const y = (kmh: number) => 41 + (300 - kmh) * 0.45
  return (
    <div className={`${card} mt-6 p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[10px]">
        <span className="flex items-center gap-2 tracking-[0.1em]">
          <span className="size-[7px] animate-[vf-pulse_1.4s_ease-in-out_infinite] rounded-full bg-accent motion-reduce:animate-none" />
          LIVE TELEMETRY · SYNCED TO REPLAY
        </span>
        <span className="flex gap-3 text-[#c9c9d1]">
          {(['VER', 'NOR'] as const).map((code) => (
            <span key={code} className="flex items-center gap-[5px]">
              <span className="h-[3px] w-3.5 rounded-sm" style={{ background: carColor(code) }} />
              {code}
            </span>
          ))}
        </span>
      </div>
      <svg
        viewBox="0 0 530 168"
        width="100%"
        className="mt-3.5 block font-mono"
        role="img"
        aria-label="Speed traces for Verstappen and Norris through Turn 4: both brake from about 320 km/h to about 110 km/h; Norris has a higher minimum speed and accelerates earlier."
      >
        {[300, 200, 100].map((v) => (
          <g key={v}>
            <line x1={40} x2={520} y1={y(v)} y2={y(v)} stroke="#1f2330" />
            <text x={32} y={y(v) + 3} textAnchor="end" fontSize={9} fill="#8e8e99">
              {v}
            </text>
          </g>
        ))}
        {(['VER', 'NOR'] as const).map((code) => (
          <polyline
            key={code}
            points={T4_TRACES[code].map(([d, v]) => `${x(d)},${y(v)}`).join(' ')}
            fill="none"
            stroke={carColor(code)}
            strokeWidth={2.25}
            strokeLinejoin="round"
          />
        ))}
        <line x1={x(T4_NOW)} x2={x(T4_NOW)} y1={14} y2={140} stroke="#f5f5f5" strokeOpacity={0.7} />
        <rect x={x(T4_NOW) - 18} y={2} width={36} height={14} rx={3} fill="#f5f5f5" />
        <text x={x(T4_NOW)} y={12} textAnchor="middle" fontSize={9} fontWeight={700} fill="#0b0d12">
          NOW
        </text>
        <text x={x(T4_APEX)} y={148} textAnchor="middle" fontSize={9} fill="#c9c9d1">
          T4 APEX
        </text>
        <text x={40} y={164} fontSize={9} fill="#8e8e99">
          KM/H · DISTANCE THROUGH SECTOR 1 →
        </text>
      </svg>
    </div>
  )
}

function DriverTile({ code, speed, gear, throttle, brake, drs, delta }: (typeof T4_TELEMETRY)[number]) {
  return (
    <div className={`${tile} border-t-[3px] p-3.5`} style={{ borderTopColor: carColor(code) }}>
      <div className="flex h-[19px] items-center justify-between font-mono">
        <span className="text-xs font-bold">{code}</span>
        {drs ? (
          <span className="rounded-[3px] bg-[#1f6f3f] px-1.5 py-[3px] text-[9px] text-[#e9fff1]">DRS</span>
        ) : delta ? (
          <span className="text-[9px]">{delta}</span>
        ) : null}
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold leading-none lg:text-[30px]">
        {speed}
        <span className="text-[11px] text-muted"> km/h</span>
      </div>
      <div className="mt-3 grid grid-cols-[42px_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 font-mono text-[9px] text-muted">
        <span>GEAR</span>
        <span className="text-xs text-text">{gear}</span>
        <span>THR</span>
        <Meter value={throttle} label={`Throttle ${throttle}%`} />
        <span>BRK</span>
        <Meter value={brake} label={`Brake ${brake}%`} />
      </div>
    </div>
  )
}

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <span
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className="relative h-1.5 overflow-hidden rounded-[3px] bg-[#262b38]"
    >
      <span className="absolute inset-y-0 left-0 bg-[#e6e6ea]" style={{ width: `${value}%` }} />
    </span>
  )
}

/* ── 04 Chequered flag ────────────────────────────────────────────────── */

function ResultsCard() {
  return (
    <div className={`${card} mt-6 overflow-hidden`}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left font-mono text-[9px] tracking-[0.1em] text-muted">
            <th className="w-10 pb-2.5 pl-4 pt-3 font-medium">POS</th>
            <th className="pb-2.5 pt-3 font-medium">DRIVER</th>
            <th className="pb-2.5 pt-3 text-right font-medium">GAP</th>
            <th className="w-12 pb-2.5 pr-4 pt-3 text-right font-medium">PTS</th>
          </tr>
        </thead>
        <tbody>
          {RESULTS.map((r) => {
            const car = RECAP_CARS.find((c) => c.code === r.code)
            return (
              <tr key={r.code} className={`border-t border-border ${r.pos === 1 ? 'bg-[#191d26]' : ''}`}>
                <td className="py-[11px] pl-4 font-mono font-bold">{r.pos}</td>
                <td className="py-[11px]">
                  <span className="inline-flex items-center gap-2.5">
                    <span className="h-4 w-[3px] rounded-sm" style={{ background: car?.color }} />
                    <b className="font-mono text-xs">{r.code}</b>
                    <span className="text-muted">{car?.team}</span>
                  </span>
                </td>
                <td className="py-[11px] text-right font-mono text-xs">{r.gap}</td>
                <td className="py-[11px] pr-4 text-right font-mono text-xs">{r.pts}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
