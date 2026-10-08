'use client'

import Link from 'next/link'
import { ArrowDown, ShareNetwork, Timer } from '@phosphor-icons/react'
import type {
  BattleChapter,
  BattleTelemetry,
  FinishChapter,
  PitSwingChapter,
  RaceRecap,
  RecapChapter,
  StartChapter,
} from '@vismay/f1-viz/recap'

const card = 'rounded-xl border border-border bg-surface'
const tile = 'rounded-[10px] border border-border bg-surface'

type Colors = (code: string) => string

/**
 * The recap's chapters, in reading order. Each is a `[data-beat]` section: the
 * rail's scroll position picks the chapter the replay shows, and in the story
 * view the inactive chapters dim.
 */
export function RecapChapters({
  recap,
  beat,
  story,
  round,
  onShare,
  shared,
}: {
  recap: RaceRecap
  beat: number
  /** The replay story view (dimmed chapters, screen-tall sections), vs the one-page article. */
  story: boolean
  round: number
  onShare: () => void
  shared: boolean
}) {
  const color: Colors = (code) => recap.drivers.find((d) => d.code === code)?.color ?? '#8e8e99'
  const team = (code: string) => recap.drivers.find((d) => d.code === code)?.team ?? ''
  const last = recap.chapters.length - 1

  return (
    <>
      {recap.chapters.map((ch, i) => (
        <Chapter key={`${ch.kind}-${i}`} index={i} chapter={ch} beat={beat} story={story}>
          {ch.kind === 'start' ? <StartCard ch={ch} color={color} /> : null}
          {ch.kind === 'pit-swing' ? <PitSwing ch={ch} color={color} /> : null}
          {ch.kind === 'battle' ? <Battle ch={ch} color={color} /> : null}
          {ch.kind === 'finish' ? <Finish ch={ch} color={color} team={team} /> : null}
          {i === 0 && story ? (
            <div className="mt-[22px] flex items-center gap-2 font-mono text-[10px] tracking-[0.1em] text-muted">
              <ArrowDown size={14} weight="bold" aria-hidden />
              SCROLL — THE REPLAY FOLLOWS
            </div>
          ) : null}
          {i === last ? (
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
          ) : null}
        </Chapter>
      ))}
    </>
  )
}

function Chapter({
  index,
  chapter,
  beat,
  story,
  children,
}: {
  index: number
  chapter: RecapChapter
  beat: number
  story: boolean
  children: React.ReactNode
}) {
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
        {String(index + 1).padStart(2, '0')} — {chapter.kicker}
      </div>
      <h2
        id={`recap-beat-${index}`}
        className="mt-3 text-[32px] font-bold uppercase leading-[0.98] wdth-display lg:text-[54px]"
      >
        {chapter.headline}
      </h2>
      <p className="mt-3.5 max-w-[520px] text-[15px] leading-normal text-[#b9b9c3] lg:text-lg">{chapter.dek}</p>
      {children}
    </section>
  )
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

/* ── Lights out ───────────────────────────────────────────────────────── */

function StartCard({ ch, color }: { ch: StartChapter; color: Colors }) {
  const maxPlaces = Math.max(3, ...ch.deltas.map((d) => Math.abs(d.delta)))
  return (
    <div className={`${card} mt-6 p-5`}>
      {ch.hero ? (
        <div className="flex items-end gap-4">
          <div className="text-[76px] font-bold leading-[0.8] [font-stretch:62%] lg:text-[116px]">+{ch.hero.delta}</div>
          <div className="pb-1 text-sm leading-[1.4] text-[#b9b9c3]">
            places gained by <b style={{ color: color(ch.hero.code) }}>{ch.hero.code}</b>
            <br />
            on lap 1, P{ch.hero.from} → P{ch.hero.to}
          </div>
        </div>
      ) : null}
      <div className={`font-mono text-[10px] tracking-[0.1em] text-muted ${ch.hero ? 'mt-[22px]' : ''}`}>
        LAP 1 · POSITIONS GAINED / LOST
      </div>
      <div className="mt-2.5 flex flex-col gap-1" role="list" aria-label="Positions gained or lost on lap 1">
        {ch.deltas.map(({ code, delta }) => {
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
              <span className={`text-right ${delta === 0 ? 'text-muted' : ''}`}>{signed(delta)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Pit swing ────────────────────────────────────────────────────────── */

/** A tick step that gives about four intervals over `span`. */
function niceStep(span: number) {
  const raw = span / 4
  const mag = 10 ** Math.floor(Math.log10(raw || 1))
  return [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
}

function PitSwing({ ch, color }: { ch: PitSwingChapter; color: Colors }) {
  const first = ch.gap[0]?.lap ?? 0
  const lastLap = ch.gap[ch.gap.length - 1]?.lap ?? first + 1
  const peak = Math.max(1, Math.ceil(Math.max(...ch.gap.map((p) => Math.abs(p.gap)))))
  const yStep = peak <= 3 ? 1 : Math.ceil(peak / 3)
  const top = Math.ceil(peak / yStep) * yStep
  const x = (lap: number) => 40 + ((lap - first) / Math.max(1, lastLap - first)) * 440
  const y = (gap: number) => 100 - (gap / top) * 70
  const end = ch.gap[ch.gap.length - 1]
  const lapStep = Math.max(1, Math.round(niceStep(lastLap - first)))
  const lapTicks: number[] = []
  for (let l = Math.ceil(first / lapStep) * lapStep; l <= lastLap; l += lapStep) lapTicks.push(l)
  const yTicks: number[] = []
  for (let g = top; g >= -top; g -= yStep) yTicks.push(g)
  const lineColor = color(ch.a)
  const fmt = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}s`
  return (
    <>
      <div className={`${card} mt-6 p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[15px] font-semibold">
            Gap, {ch.a} to {ch.b}
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase text-muted">
            <span className="h-[3px] w-3.5 rounded-sm" style={{ background: lineColor }} />
            SECONDS · ABOVE 0 = {ch.a} BEHIND
          </span>
        </div>
        {end ? (
          <svg
            viewBox="0 0 520 212"
            width="100%"
            className="mt-3.5 block font-mono"
            role="img"
            aria-label={`${ch.a}'s gap to ${ch.b} goes from ${fmt(ch.gap[0].gap)} on lap ${first} to ${fmt(end.gap)} on lap ${end.lap}, through stops on ${ch.pits.map((p) => `lap ${p.lap} (${p.code})`).join(' and ')}.`}
          >
            {yTicks.map((g) => (
              <g key={g}>
                <line x1={40} x2={500} y1={y(g)} y2={y(g)} stroke={g === 0 ? '#4a5163' : '#1f2330'} />
                <text x={30} y={y(g) + 3} textAnchor="end" fontSize={10} fill={g === 0 ? '#c9c9d1' : '#8e8e99'}>
                  {signed(g)}
                </text>
              </g>
            ))}
            {ch.pits.map((p, i) => (
              <g key={p.code}>
                <line x1={x(p.lap)} x2={x(p.lap)} y1={20} y2={182} stroke="#8e8e99" strokeDasharray="3 4" />
                <text
                  x={x(p.lap) + (i === 1 && Math.abs(x(ch.pits[0].lap) - x(p.lap)) < 56 ? -4 : 4)}
                  y={16}
                  textAnchor={i === 1 && Math.abs(x(ch.pits[0].lap) - x(p.lap)) < 56 ? 'end' : 'start'}
                  fontSize={9}
                  fill="#c9c9d1"
                >
                  {p.code} PIT
                </text>
              </g>
            ))}
            <polyline
              points={ch.gap.map((p) => `${x(p.lap)},${y(p.gap)}`).join(' ')}
              fill="none"
              stroke={lineColor}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle cx={x(end.lap)} cy={y(end.gap)} r={4.5} fill={lineColor} stroke="#13161d" strokeWidth={2} />
            <text
              x={x(end.lap) - 4}
              y={y(end.gap) + (end.gap > 0 ? -10 : 21)}
              textAnchor="end"
              fontSize={10}
              fill="#f5f5f5"
            >
              {fmt(end.gap)}
            </text>
            {lapTicks.map((lap) => (
              <text key={lap} x={x(lap)} y={204} textAnchor="middle" fontSize={10} fill="#8e8e99">
                L{lap}
              </text>
            ))}
          </svg>
        ) : null}
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2.5">
        {ch.tiles.map((t) => (
          <div key={t.label} className={`${tile} p-3.5`}>
            <div
              className="font-mono text-[17px] font-semibold lg:text-[22px]"
              style={t.highlight ? { color: lineColor } : undefined}
            >
              {t.value}
            </div>
            <div className="mt-1 text-xs text-muted">{t.label}</div>
          </div>
        ))}
      </div>
    </>
  )
}

/* ── Battle ───────────────────────────────────────────────────────────── */

function Battle({ ch, color }: { ch: BattleChapter; color: Colors }) {
  const ca = color(ch.a)
  const cb = color(ch.b)
  // Teammates share a colour: draw the second car dashed.
  const dashB = ca.toLowerCase() === cb.toLowerCase() ? '5 4' : undefined
  const t = ch.trace
  return (
    <>
      {t ? (
        <div className={`${card} mt-6 p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[10px]">
            <span className="flex items-center gap-2 tracking-[0.1em]">
              <span className="size-[7px] rounded-full bg-accent" />
              SPEED THROUGH THE PASS · LAP {ch.lap}
            </span>
            <span className="flex gap-3 text-[#c9c9d1]">
              {[
                { code: ch.a, c: ca, dash: undefined },
                { code: ch.b, c: cb, dash: dashB },
              ].map((s) => (
                <span key={s.code} className="flex items-center gap-[5px]">
                  <svg width={14} height={3} aria-hidden>
                    <line x1={0} x2={14} y1={1.5} y2={1.5} stroke={s.c} strokeWidth={3} strokeDasharray={s.dash ? '4 2' : undefined} />
                  </svg>
                  {s.code}
                </span>
              ))}
            </span>
          </div>
          <SpeedTrace trace={t} ca={ca} cb={cb} dashB={dashB} a={ch.a} b={ch.b} />
        </div>
      ) : null}
      {ch.tiles.length ? (
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          {ch.tiles.map((d) => (
            <DriverTile key={d.code} {...d} color={color(d.code)} />
          ))}
        </div>
      ) : null}
    </>
  )
}

function SpeedTrace({
  trace,
  ca,
  cb,
  dashB,
  a,
  b,
}: {
  trace: NonNullable<BattleChapter['trace']>
  ca: string
  cb: string
  dashB?: string
  a: string
  b: string
}) {
  const all = [...trace.a, ...trace.b]
  const d0 = Math.min(...all.map((s) => s.d))
  const d1 = Math.max(...all.map((s) => s.d))
  const vMin = Math.max(0, Math.floor((Math.min(...all.map((s) => s.v)) - 20) / 50) * 50)
  const vMax = Math.ceil((Math.max(...all.map((s) => s.v)) + 10) / 50) * 50
  const x = (d: number) => 40 + ((d - d0) / Math.max(1, d1 - d0)) * 480
  const y = (v: number) => 140 - ((v - vMin) / Math.max(1, vMax - vMin)) * 126
  const ticks = [100, 200, 300].filter((v) => v > vMin && v < vMax)
  const minOf = (s: typeof trace.a) => Math.min(...s.map((p) => p.v))
  return (
    <svg
      viewBox="0 0 530 168"
      width="100%"
      className="mt-3.5 block font-mono"
      role="img"
      aria-label={`Speed traces for ${a} and ${b} through the pass: ${a} down to ${minOf(trace.a)} km/h, ${b} down to ${minOf(trace.b)} km/h.`}
    >
      {ticks.map((v) => (
        <g key={v}>
          <line x1={40} x2={520} y1={y(v)} y2={y(v)} stroke="#1f2330" />
          <text x={32} y={y(v) + 3} textAnchor="end" fontSize={9} fill="#8e8e99">
            {v}
          </text>
        </g>
      ))}
      <polyline
        points={trace.b.map((s) => `${x(s.d)},${y(s.v)}`).join(' ')}
        fill="none"
        stroke={cb}
        strokeWidth={2.25}
        strokeLinejoin="round"
        strokeDasharray={dashB}
      />
      <polyline
        points={trace.a.map((s) => `${x(s.d)},${y(s.v)}`).join(' ')}
        fill="none"
        stroke={ca}
        strokeWidth={2.25}
        strokeLinejoin="round"
      />
      <line x1={x(trace.passAt)} x2={x(trace.passAt)} y1={14} y2={140} stroke="#f5f5f5" strokeOpacity={0.7} />
      <rect x={x(trace.passAt) - 18} y={2} width={36} height={14} rx={3} fill="#f5f5f5" />
      <text x={x(trace.passAt)} y={12} textAnchor="middle" fontSize={9} fontWeight={700} fill="#0b0d12">
        PASS
      </text>
      {trace.apex ? (
        <text x={x(trace.apex.d)} y={153} textAnchor="middle" fontSize={9} fill="#c9c9d1" className="uppercase">
          {trace.apex.label.toUpperCase()}
        </text>
      ) : null}
      <text x={40} y={166} fontSize={9} fill="#8e8e99">
        {trace.caption}
      </text>
    </svg>
  )
}

function DriverTile({ code, speed, gear, throttle, brake, drs, delta, color }: BattleTelemetry & { color: string }) {
  return (
    <div className={`${tile} border-t-[3px] p-3.5`} style={{ borderTopColor: color }}>
      <div className="flex h-[19px] items-center justify-between gap-2 font-mono">
        <span className="text-xs font-bold">{code}</span>
        <span className="flex items-center gap-2">
          {delta ? <span className="text-[9px]">{delta}</span> : null}
          {drs ? <span className="rounded-[3px] bg-[#1f6f3f] px-1.5 py-[3px] text-[9px] text-[#e9fff1]">DRS</span> : null}
        </span>
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
  const v = Math.max(0, Math.min(100, value))
  return (
    <span
      role="meter"
      aria-label={label}
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      className="relative h-1.5 overflow-hidden rounded-[3px] bg-[#262b38]"
    >
      <span className="absolute inset-y-0 left-0 bg-[#e6e6ea]" style={{ width: `${v}%` }} />
    </span>
  )
}

/* ── Chequered flag ───────────────────────────────────────────────────── */

function Finish({ ch, color, team }: { ch: FinishChapter; color: Colors; team: (code: string) => string }) {
  return (
    <>
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
            {ch.results.map((r) => (
              <tr key={r.code} className={`border-t border-border ${r.pos === 1 ? 'bg-[#191d26]' : ''}`}>
                <td className="py-[11px] pl-4 font-mono font-bold">{r.pos}</td>
                <td className="py-[11px]">
                  <span className="inline-flex items-center gap-2.5">
                    <span className="h-4 w-[3px] rounded-sm" style={{ background: color(r.code) }} />
                    <b className="font-mono text-xs">{r.code}</b>
                    <span className="truncate text-muted">{team(r.code)}</span>
                  </span>
                </td>
                <td className="py-[11px] text-right font-mono text-xs">{r.gap}</td>
                <td className="py-[11px] pr-4 text-right font-mono text-xs">{r.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ch.fastestLap ? (
        <div className={`${tile} mt-2.5 flex items-center gap-2.5 px-3.5 py-3 font-mono text-[11px]`}>
          <Timer size={16} weight="bold" className="text-[#b48cff]" aria-hidden />
          <span className="text-muted">FASTEST LAP</span>
          <span>
            {ch.fastestLap.code} · {ch.fastestLap.time} · L{ch.fastestLap.lap}
          </span>
        </div>
      ) : null}
    </>
  )
}
