'use client';

import Link from 'next/link';
import type { FixtureRow } from '../types';

type Props = { fixture: FixtureRow };

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function kickoffLabel(iso: string, status: FixtureRow['status']): string {
  const d = new Date(iso);
  if (status === 'finished') {
    // Locale-independent — toLocaleDateString(undefined, ...) produced
    // server/client mismatches ("26 May" vs "May 26") that broke hydration.
    return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
  }
  if (status === 'live') return 'LIVE';
  if (status === 'postponed') return 'PPD';
  if (status === 'cancelled') return 'CXL';
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()} ${hh}:${mm}`;
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
  // Flat structure: flex + flex-1 + justify go directly on the link/div so
  // the img and name are real flex children. The previous nested-span layout
  // had two flex-1 boxes fighting over width (the <a> as a flex item, and an
  // inner span re-declaring flex-1) which silently collapsed `justify-end`
  // because the inner span never actually stretched to the cell's width.
  const className = `flex flex-1 items-center gap-2 ${align === 'right' ? 'justify-end' : ''}`;
  const children = (
    <>
      {align === 'left' && crest ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={crest} alt="" className="h-[22px] w-[22px] object-contain" />
      ) : null}
      <span className="truncate text-sm text-text">{name}</span>
      {align === 'right' && crest ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={crest} alt="" className="h-[22px] w-[22px] object-contain" />
      ) : null}
    </>
  );
  if (!slug) return <div className={className}>{children}</div>;
  return (
    <Link href={`/team/${slug}`} className={className}>
      {children}
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
