import type { ReactNode } from 'react'
import { moodTone } from '@vismay/content-source/dcEditionTypes'
import BoomRing from './BoomRing'
import { boomShare, ringParticles, ringStaticDots } from './particleRing'

const TONE_VAR = { boom: 'var(--boom)', doom: 'var(--doom)', mid: 'var(--muted)' } as const

/** The colour a reading wears on marks (never on text). */
export function toneColor(score: number | null): string {
  return TONE_VAR[moodTone(score)]
}

/** The same seed as the edition hero's ring, so every ring of the series is one shape. */
const SEED = 7

/**
 * The ring's particles, still and already coloured: the boom share of them
 * in --boom, the rest --doom, all --dim when unscored. The same particles
 * (same seed, same order) the canvas animates, so the static and live rings
 * agree. Server-rendered SVG — cheap enough to repeat down the archive.
 */
function RingDots({ score, count, className = '' }: { score: number | null; count: number; className?: string }) {
  const share = score == null ? null : boomShare(score)
  const dots = ringStaticDots(count, SEED)
  const us = ringParticles(count, SEED)
  return (
    <svg className={`absolute inset-0 size-full ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.x}
          cy={d.y}
          r={d.r * 1.7}
          fill={share == null ? 'var(--dim)' : us[i].u < share ? 'var(--boom)' : 'var(--doom)'}
          opacity={share == null ? 0.5 : 0.9}
        />
      ))}
    </svg>
  )
}

/** A still Boom Score ring with whatever sits in its centre (usually the score). */
export function StaticRing({ score, count = 90, className = '', children }: { score: number | null; count?: number; className?: string; children?: ReactNode }) {
  return (
    <span className={`relative grid aspect-square place-items-center [container-type:inline-size] ${className}`}>
      <RingDots score={score} count={count} />
      {children && <span className="relative grid place-items-center text-center">{children}</span>}
    </span>
  )
}

/**
 * The animated ring (BoomRing) for a single headline score: the still dots
 * paint first and fade out once the canvas has drawn its first frame. Reads
 * its colours from the nearest `.dcd` or `[data-ring-palette]` host.
 */
export function LiveRing({ score, className = '', children }: { score: number | null; className?: string; children?: ReactNode }) {
  return (
    <span className={`relative grid aspect-square place-items-center [container-type:inline-size] [&:has(canvas.live)>svg]:opacity-0 ${className}`}>
      <BoomRing score={score} seed={SEED} className="absolute inset-0 size-full opacity-0 transition-opacity duration-500 [&.live]:opacity-100" />
      <RingDots score={score} count={160} className="transition-opacity duration-500" />
      {children && <span className="pointer-events-none relative grid place-items-center text-center">{children}</span>}
    </span>
  )
}
