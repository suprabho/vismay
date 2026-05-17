'use client';

import Link from 'next/link';
import type { StandingRow } from '../types';

type Props = {
  rows: StandingRow[];
  /**
   * Compact layout for narrow containers (e.g. the engine's foreground viz
   * slot at ~480px). Drops the W/D/L/GD columns; keeps position, team,
   * played, and points. Default false.
   */
  compact?: boolean;
};

export function StandingsTable({ rows, compact = false }: Props) {
  const cols = compact
    ? 'grid-cols-[28px_1fr_28px_32px]'
    : 'grid-cols-[28px_1fr_28px_24px_24px_24px_32px_32px]';

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className={`grid ${cols} items-center gap-1 border-b border-border bg-bg px-3 py-2 text-[10px] text-muted`}>
        <span>#</span>
        <span>Team</span>
        <span className="text-center">P</span>
        {!compact && <span className="text-center">W</span>}
        {!compact && <span className="text-center">D</span>}
        {!compact && <span className="text-center">L</span>}
        {!compact && <span className="text-center">GD</span>}
        <span className="text-center">Pts</span>
      </div>

      {rows.map((r) => {
        const teamSlug = r.team?.slug;
        const inner = (
          <div className={`grid ${cols} items-center gap-1 border-b border-border/50 px-3 py-2.5 text-xs last:border-b-0`}>
            <span className="text-text">{r.position}</span>
            <span className="flex min-w-0 items-center gap-2">
              {r.team?.crest_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.team.crest_url} alt="" className="h-[18px] w-[18px] object-contain" />
              ) : null}
              <span className="truncate text-text">{r.team?.name ?? '—'}</span>
            </span>
            <span className="text-center text-text">{r.played}</span>
            {!compact && <span className="text-center text-text">{r.won}</span>}
            {!compact && <span className="text-center text-text">{r.draw}</span>}
            {!compact && <span className="text-center text-text">{r.lost}</span>}
            {!compact && <span className="text-center text-text">{r.goal_difference}</span>}
            <span className="text-center font-semibold text-text">{r.points}</span>
          </div>
        );
        if (!teamSlug) {
          return <div key={r.team_id}>{inner}</div>;
        }
        return (
          <Link key={r.team_id} href={`/team/${teamSlug}`} className="block hover:bg-bg/40">
            {inner}
          </Link>
        );
      })}
    </div>
  );
}
