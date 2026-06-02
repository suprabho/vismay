'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import type { TacticsBoardConfig } from './index'
import type { PlayerSnapshot } from './types'
import { PITCH_LENGTH, PITCH_WIDTH, dataToSvg, pointsToPath, type SvgPoint } from './coordinates'
import { interpolateFrames } from './interpolate'
import { Pitch } from './Pitch'
import { Player } from './Player'

const PASS_DRAW_SEC = 0.55
const ZONE_FADE = 0.4

const DEFAULTS = {
  homeColor: '#2f6df6',
  awayColor: '#e23b4e',
  textColor: '#ffffff',
  accent: '#ffd23f',
  pitchColor: '#1f7a44',
  stripeColor: '#1c6f3e',
  lineColor: 'rgba(255,255,255,0.72)',
  runColor: 'rgba(255,255,255,0.92)',
} as const

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function shortLabel(p: PlayerSnapshot): string {
  return p.label ?? p.id.replace(/^A[_-]/, '')
}

function zoneOpacity(t: number, at: number, duration: number): number {
  const end = at + duration
  if (t < at || t > end) return 0
  return Math.min(clamp((t - at) / ZONE_FADE, 0, 1), clamp((end - t) / ZONE_FADE, 0, 1))
}

export default function TacticsBoardComponent({
  config,
  mode,
  isActive,
  noteReady,
}: VizRenderProps<TacticsBoardConfig>) {
  const { phase } = config
  const dur = phase.durationSec
  const accent = config.accent ?? DEFAULTS.accent
  const homeColor = config.homeColor ?? DEFAULTS.homeColor
  const awayColor = config.awayColor ?? DEFAULTS.awayColor

  const uid = useId().replace(/:/g, '')
  const passHead = `${uid}-pass`
  const runHead = `${uid}-run`

  const [tNow, setTNow] = useState(0)
  const [reduceMotion, setReduceMotion] = useState(false)
  const rafRef = useRef<number | undefined>(undefined)
  const startRef = useRef(0)
  const notedRef = useRef(false)

  const shouldSnap = mode === 'capture' || mode === 'print' || reduceMotion

  // Resolve annotation geometry once per phase — only the draw progress is
  // time-dependent, and that's cheap to recompute each frame.
  const resolved = useMemo(() => {
    const passes: { from: SvgPoint; to: SvgPoint; at: number; length: number }[] = []
    const runs: { d: string; at: number; duration: number; length: number }[] = []
    const zones: {
      polyString: string
      centroid: SvgPoint
      label?: string
      at: number
      duration: number
    }[] = []

    const posAt = (id: string, t: number): SvgPoint | null => {
      const snap = interpolateFrames(phase.frames, t)
      const p = snap.players.find((pl) => pl.id === id)
      return p ? dataToSvg(p.x, p.y) : null
    }

    for (const a of phase.annotations) {
      if (a.type === 'pass') {
        const from = posAt(a.from, a.at)
        const to = posAt(a.to, a.at)
        if (from && to) {
          passes.push({ from, to, at: a.at, length: Math.hypot(to.x - from.x, to.y - from.y) })
        }
      } else if (a.type === 'run') {
        const pts = a.path.map(([x, y]) => dataToSvg(x, y))
        let length = 0
        for (let i = 1; i < pts.length; i++) {
          length += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)
        }
        runs.push({ d: pointsToPath(a.path), at: a.at, duration: a.duration, length })
      } else {
        const pts = a.polygon.map(([x, y]) => dataToSvg(x, y))
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
        zones.push({
          polyString: pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '),
          centroid: { x: cx, y: cy },
          label: a.label,
          at: a.at,
          duration: a.duration,
        })
      }
    }
    return { passes, runs, zones }
  }, [phase])

  const play = useCallback(() => {
    if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
    startRef.current = performance.now()
    const tick = (now: number) => {
      const elapsed = (now - startRef.current) / 1000
      if (config.loop && elapsed >= dur) {
        startRef.current = now
        setTNow(0)
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      if (elapsed >= dur) {
        setTNow(dur)
        rafRef.current = undefined
        return
      }
      setTNow(elapsed)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [config.loop, dur])

  // Honour prefers-reduced-motion.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduceMotion(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReduceMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Signal first-paint readiness once (for the capture / PDF pipeline).
  useEffect(() => {
    if (notedRef.current) return
    const h = requestAnimationFrame(() => {
      notedRef.current = true
      noteReady()
    })
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  // Drive playback: snap to the final frame for capture / reduced motion,
  // otherwise play through when the unit is active (or in autoplay preview).
  useEffect(() => {
    if (shouldSnap) {
      setTNow(dur)
      return
    }
    if (isActive || mode === 'autoplay') play()
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
    }
  }, [shouldSnap, isActive, mode, dur, play])

  const onScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (rafRef.current !== undefined) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = undefined
    }
    setTNow(Number(e.target.value))
  }

  const snap = interpolateFrames(phase.frames, tNow)
  const ball = dataToSvg(snap.ball.x, snap.ball.y)
  const showControls = mode === 'scroll' || mode === 'autoplay'

  const ariaLabel =
    `Animated tactics board, formation ${phase.formation}.` +
    (config.title ? ` ${config.title}.` : '') +
    ` ${snap.players.length} players.`

  return (
    <div style={rootStyle}>
      <div style={captionStyle}>
        <span style={formationChip}>{phase.formation}</span>
        {config.title ? <span style={titleStyle}>{config.title}</span> : null}
      </div>

      <div style={boardFrame}>
        <svg
          viewBox={`-3 -3 ${PITCH_LENGTH + 6} ${PITCH_WIDTH + 6}`}
          preserveAspectRatio="xMidYMid meet"
          width="100%"
          height="100%"
          role="img"
          aria-label={ariaLabel}
          style={{ display: 'block' }}
        >
          <defs>
            <marker
              id={passHead}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerUnits="userSpaceOnUse"
              markerWidth={4}
              markerHeight={4}
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill={accent} />
            </marker>
            <marker
              id={runHead}
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerUnits="userSpaceOnUse"
              markerWidth={3.4}
              markerHeight={3.4}
              orient="auto-start-reverse"
            >
              <path
                d="M0,1 L9,5 L0,9"
                fill="none"
                stroke={DEFAULTS.runColor}
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </marker>
          </defs>

          <Pitch
            pitchColor={config.pitchColor ?? DEFAULTS.pitchColor}
            stripeColor={config.stripeColor ?? DEFAULTS.stripeColor}
            lineColor={DEFAULTS.lineColor}
          />

          {/* Zones (under everything) */}
          {resolved.zones.map((z, i) => {
            const o = zoneOpacity(tNow, z.at, z.duration)
            if (o <= 0) return null
            return (
              <polygon
                key={`z${i}`}
                points={z.polyString}
                fill={accent}
                fillOpacity={0.14 * o}
                stroke={accent}
                strokeOpacity={0.5 * o}
                strokeWidth={0.4}
                strokeDasharray="1.6 1.2"
              />
            )
          })}

          {/* Runs */}
          {resolved.runs.map((r, i) => {
            if (tNow < r.at) return null
            const progress = clamp((tNow - r.at) / Math.max(r.duration, 0.001), 0, 1)
            return (
              <path
                key={`r${i}`}
                d={r.d}
                fill="none"
                stroke={DEFAULTS.runColor}
                strokeWidth={0.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={r.length}
                strokeDashoffset={r.length * (1 - progress)}
                markerEnd={progress > 0.98 ? `url(#${runHead})` : undefined}
              />
            )
          })}

          {/* Passes */}
          {resolved.passes.map((p, i) => {
            if (tNow < p.at) return null
            const progress = clamp((tNow - p.at) / PASS_DRAW_SEC, 0, 1)
            return (
              <line
                key={`p${i}`}
                x1={p.from.x}
                y1={p.from.y}
                x2={p.to.x}
                y2={p.to.y}
                stroke={accent}
                strokeWidth={0.7}
                strokeLinecap="round"
                strokeDasharray={p.length}
                strokeDashoffset={p.length * (1 - progress)}
                markerEnd={progress > 0.98 ? `url(#${passHead})` : undefined}
              />
            )
          })}

          {/* Players */}
          {snap.players.map((pl) => (
            <Player
              key={pl.id}
              x={pl.x}
              y={pl.y}
              color={pl.team === 'home' ? homeColor : awayColor}
              textColor={DEFAULTS.textColor}
              label={shortLabel(pl)}
            />
          ))}

          {/* Ball */}
          <circle cx={ball.x} cy={ball.y} r={1.3} fill="#ffffff" stroke="rgba(0,0,0,0.55)" strokeWidth={0.35} />

          {/* Zone labels (above) */}
          {resolved.zones.map((z, i) => {
            const o = zoneOpacity(tNow, z.at, z.duration)
            if (o <= 0 || !z.label) return null
            return (
              <text
                key={`zl${i}`}
                x={z.centroid.x}
                y={z.centroid.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={2.4}
                fontWeight={600}
                fill="#ffffff"
                opacity={o}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {z.label}
              </text>
            )
          })}
        </svg>
      </div>

      {showControls ? (
        <div style={controlsStyle}>
          <button type="button" onClick={() => play()} style={replayButton} aria-label="Replay phase">
            ↺ Replay
          </button>
          <input
            type="range"
            min={0}
            max={dur}
            step={0.05}
            value={tNow}
            onChange={onScrub}
            aria-label="Scrub phase timeline"
            style={{ flex: 1, accentColor: accent, cursor: 'pointer' }}
          />
          <span style={timeReadout}>
            {tNow.toFixed(1)}s / {dur.toFixed(1)}s
          </span>
          <span style={legendWrap}>
            <span style={legendChip}>
              <span style={{ ...legendDot, background: homeColor }} />
              {config.homeLabel ?? 'Home'}
            </span>
            <span style={legendChip}>
              <span style={{ ...legendDot, background: awayColor }} />
              {config.awayLabel ?? 'Away'}
            </span>
          </span>
        </div>
      ) : null}
    </div>
  )
}

const rootStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.75rem',
  padding: '1rem',
  pointerEvents: 'none',
  color: 'var(--color-text, #e8eaf2)',
}

const captionStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  maxWidth: 'min(94vw, 1000px)',
  width: '100%',
}

const formationChip: CSSProperties = {
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  fontSize: '0.72rem',
  letterSpacing: '0.08em',
  padding: '0.18rem 0.5rem',
  borderRadius: '999px',
  background: 'var(--color-accent, #ffd23f)',
  color: 'var(--color-bg, #0a1a3a)',
  fontWeight: 700,
  whiteSpace: 'nowrap',
}

const titleStyle: CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 600,
  color: 'var(--color-text, #e8eaf2)',
}

const boardFrame: CSSProperties = {
  width: '100%',
  maxWidth: 'min(94vw, 1000px)',
  aspectRatio: `${PITCH_LENGTH} / ${PITCH_WIDTH}`,
  borderRadius: '14px',
  overflow: 'hidden',
  boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
  border: '1px solid rgba(255,255,255,0.08)',
  pointerEvents: 'none',
}

const controlsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  flexWrap: 'wrap',
  maxWidth: 'min(94vw, 1000px)',
  width: '100%',
  pointerEvents: 'auto',
}

const replayButton: CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 600,
  padding: '0.32rem 0.7rem',
  borderRadius: '999px',
  border: '1px solid var(--color-line, rgba(255,255,255,0.18))',
  background: 'var(--color-surface, rgba(255,255,255,0.06))',
  color: 'var(--color-text, #e8eaf2)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const timeReadout: CSSProperties = {
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  fontSize: '0.72rem',
  color: 'var(--color-muted, #9aa0ad)',
  whiteSpace: 'nowrap',
  minWidth: '5.5rem',
  textAlign: 'right',
}

const legendWrap: CSSProperties = {
  display: 'flex',
  gap: '0.6rem',
  flexWrap: 'wrap',
}

const legendChip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  fontSize: '0.74rem',
  color: 'var(--color-muted, #9aa0ad)',
}

const legendDot: CSSProperties = {
  display: 'inline-block',
  width: '0.7rem',
  height: '0.7rem',
  borderRadius: '999px',
}
