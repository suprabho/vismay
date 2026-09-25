import { moodTone, moodWord, formatSigned } from '@vismay/content-source/dcEditionTypes'
import { boomScore } from './editionUtils'

const TONE_VAR = { boom: 'var(--boom)', doom: 'var(--doom)', mid: 'var(--muted)' } as const

/** The colour a reading wears on marks (never on text). */
export function toneColor(score: number | null): string {
  return TONE_VAR[moodTone(score)]
}

/**
 * A reading as a 0–100 track with a marker: doom on the left, boom on the
 * right, the balanced midpoint ticked. Pairs with the Boom Score number, which
 * carries the value in text; the track is the at-a-glance position.
 */
export function ScoreTrack({ score, className = '' }: { score: number | null; className?: string }) {
  const value = boomScore(score)
  return (
    <div className={`relative h-1.5 rounded-full bg-[var(--line)] ${className}`} aria-hidden="true">
      <span className="absolute inset-y-[-3px] left-1/2 w-px bg-[var(--line-strong)]" />
      {value != null && (
        <span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--elevated)]"
          style={{ left: `${value}%`, background: toneColor(score) }}
        />
      )}
    </div>
  )
}

/** Boom Score, its signed reading and the mood word — the headline numbers of an edition. */
export function ScoreReadout({ score, size = 'lg' }: { score: number | null; size?: 'lg' | 'sm' }) {
  const value = boomScore(score)
  return (
    <div className="flex items-end gap-3">
      <span
        className={`font-[family-name:var(--serif)] leading-none tabular-nums ${size === 'lg' ? 'text-[clamp(64px,9vw,104px)]' : 'text-[44px]'}`}
      >
        {value ?? '—'}
      </span>
      <span className="grid gap-1 pb-1.5">
        <span className="font-[family-name:var(--mono)] text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">
          Boom Score{value != null ? ' / 100' : ''}
        </span>
        <span className="flex items-center gap-2 text-sm">
          <span className="size-2 rounded-full" style={{ background: toneColor(score) }} aria-hidden="true" />
          <span>{moodWord(score)}</span>
          <span className="font-[family-name:var(--mono)] text-xs text-[var(--dim)]">{formatSigned(score)}</span>
        </span>
      </span>
    </div>
  )
}
