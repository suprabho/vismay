'use client';

import Link from 'next/link';
import type { StandingRow } from '@/lib/useStandings';

type Props = { rows: StandingRow[] };

export function StandingsTable({ rows }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="grid grid-cols-[28px_1fr_28px_24px_24px_24px_32px_32px] items-center gap-1 border-b border-border bg-bg px-3 py-2 text-[10px] text-muted">
        <span>#</span>
        <span>Team</span>
        <span className="text-center">P</span>
        <span className="text-center">W</span>
        <span className="text-center">D</span>
        <span className="text-center">L</span>
        <span className="text-center">GD</span>
        <span className="text-center">Pts</span>
      </div>

      {rows.map((r) => {
        const teamSlug = r.team?.slug;
        const inner = (
          <div className="grid grid-cols-[28px_1fr_28px_24px_24px_24px_32px_32px] items-center gap-1 border-b border-border/50 px-3 py-2.5 text-xs last:border-b-0">
            <span className="text-text">{r.position}</span>
            <span className="flex min-w-0 items-center gap-2">
              {r.team?.crest_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.team.crest_url} alt="" className="h-[18px] w-[18px] object-contain" />
              ) : null}
              <span className="truncate text-text">{r.team?.name ?? '—'}</span>
            </span>
            <span className="text-center text-text">{r.played}</span>
            <span className="text-center text-text">{r.won}</span>
            <span className="text-center text-text">{r.draw}</span>
            <span className="text-center text-text">{r.lost}</span>
            <span className="text-center text-text">{r.goal_difference}</span>
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
