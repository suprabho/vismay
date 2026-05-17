'use client';

import Link from 'next/link';
import type { FixtureRow } from '@/lib/useFixtures';

type Props = { fixture: FixtureRow };

function kickoffLabel(iso: string, status: FixtureRow['status']): string {
  const d = new Date(iso);
  if (status === 'finished') {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  if (status === 'live') return 'LIVE';
  if (status === 'postponed') return 'PPD';
  if (status === 'cancelled') return 'CXL';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function TeamCell({
  name,
  crest,
  slug,
  align,
}: {
  name: string;
  crest: string | null;
  slug: string | null;
  align: 'left' | 'right';
}) {
  const inner = (
    <span className={`flex flex-1 items-center gap-2 ${align === 'right' ? 'justify-end' : ''}`}>
      {align === 'left' && crest ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={crest} alt="" className="h-[22px] w-[22px] object-contain" />
      ) : null}
      <span className="truncate text-sm text-text">{name}</span>
      {align === 'right' && crest ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={crest} alt="" className="h-[22px] w-[22px] object-contain" />
      ) : null}
    </span>
  );
  if (!slug) return <div className="flex-1">{inner}</div>;
  return (
    <Link href={`/team/${slug}`} className="flex-1">
      {inner}
    </Link>
  );
}

export function MatchRow({ fixture }: Props) {
  const homeName = fixture.home?.name ?? fixture.home_team_name ?? 'TBD';
  const awayName = fixture.away?.name ?? fixture.away_team_name ?? 'TBD';
  const isFinished = fixture.status === 'finished';
  const scoreText =
    isFinished && fixture.home_score !== null && fixture.away_score !== null
      ? `${fixture.home_score} – ${fixture.away_score}`
      : 'vs';

  return (
    <div className="flex items-center border-b border-white/20 p-2 last:border-b-0">
      <TeamCell
        name={homeName}
        crest={fixture.home?.crest_url ?? null}
        slug={fixture.home?.slug ?? null}
        align="left"
      />
      <div className="flex min-w-[72px] flex-col items-center px-3">
        <span className={isFinished ? 'text-sm font-semibold text-text' : 'text-xs text-text/80'}>
          {scoreText}
        </span>
        <span className="mt-0.5 text-[10px] text-text/50">
          {kickoffLabel(fixture.kickoff_at, fixture.status)}
        </span>
      </div>
      <TeamCell
        name={awayName}
        crest={fixture.away?.crest_url ?? null}
        slug={fixture.away?.slug ?? null}
        align="right"
      />
    </div>
  );
}
