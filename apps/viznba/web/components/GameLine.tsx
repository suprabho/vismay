import Link from 'next/link'
import type { LineRow, Tone } from '@/lib/calendarRows'
import { LiveDot, TeamBadge } from './ui'

export const TONE_TEXT: Record<Tone, string> = {
  final: 'text-dim',
  live: 'text-live-text',
  up: 'text-accent',
}

/** One-line game: badge · score (or @) · badge · status. */
export function GameLine({ row, inset = false }: { row: LineRow; inset?: boolean }) {
  return (
    <Link
      href={`/game/${row.id}`}
      className={`flex min-h-[52px] items-center gap-2 border px-3 ${inset ? 'rounded-xl bg-bg' : 'rounded-[14px] bg-surface'} ${
        row.tone === 'live' ? 'border-live/35' : 'border-border'
      }`}
    >
      <TeamBadge team={row.away} size={26} />
      <span className="font-mono text-[13px] font-semibold whitespace-nowrap">{row.line}</span>
      <TeamBadge team={row.home} size={26} />
      <span className="flex-1" />
      <span className={`flex items-center gap-1.5 text-[10.5px] font-bold tracking-[0.06em] ${TONE_TEXT[row.tone]}`}>
        {row.tone === 'live' && <LiveDot />}
        {row.status}
      </span>
    </Link>
  )
}
