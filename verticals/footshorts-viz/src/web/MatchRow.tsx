'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { FixtureRow } from '../types';
import { Crest } from '../data/Crest';

type Variant = 'compact' | 'expanded';

type Props = { fixture: FixtureRow; variant?: Variant };

type Sizes = {
  padding: string;
  gap: string;
  crest: string;
  crestPx: number;
  teamText: string;
  scoreText: string;
  scoreTextFinished: string;
  dateText: string;
  scoreColMin: string;
};

const SIZES: Record<Variant, Sizes> = {
  compact: {
    padding: 'p-2',
    gap: 'gap-2',
    crest: 'h-[22px] w-[22px]',
    crestPx: 22,
    teamText: 'text-sm',
    scoreText: 'text-xs text-text/80',
    scoreTextFinished: 'text-sm font-semibold text-text',
    dateText: 'text-[10px]',
    scoreColMin: 'min-w-[72px] px-3',
  },
  expanded: {
    padding: 'p-4',
    gap: 'gap-3',
    crest: 'h-10 w-10',
    crestPx: 40,
    teamText: 'text-sm',
    scoreText: 'text-2xl text-text/80',
    scoreTextFinished: 'text-4xl font-semibold text-text',
    dateText: 'text-xs',
    scoreColMin: 'min-w-[96px] px-4',
  },
};

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

// Renders the kickoff time in the viewer's *local* timezone once `local` is
// true, falling back to UTC otherwise. We keep fixed month names (rather than
// toLocaleDateString, which produced "26 May" vs "May 26" server/client splits)
// so only the numeric values shift between zones. The server — and the very
// first client render — pass local=false so the markup matches and hydration
// stays clean; the component flips to local=true right after mount (see
// useHasMounted) to show the user's wall-clock time.
function kickoffLabel(iso: string, status: FixtureRow['status'], local: boolean): string {
  const d = new Date(iso);
  const month = local ? d.getMonth() : d.getUTCMonth();
  const date = local ? d.getDate() : d.getUTCDate();
  if (status === 'finished') {
    return `${MONTH_SHORT[month]} ${date}`;
  }
  if (status === 'live') return 'LIVE';
  if (status === 'postponed') return 'PPD';
  if (status === 'cancelled') return 'CXL';
  const hh = String(local ? d.getHours() : d.getUTCHours()).padStart(2, '0');
  const mm = String(local ? d.getMinutes() : d.getUTCMinutes()).padStart(2, '0');
  return `${MONTH_SHORT[month]} ${date} ${hh}:${mm}`;
}

// False on the server and during the first client render, then true. Lets the
// kickoff time hydrate as UTC (matching the server HTML) before swapping to the
// device's local timezone, avoiding a hydration mismatch.
function useHasMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function TeamCell({
  name,
  crest,
  slug,
  align,
  sizes,
}: {
  name: string;
  crest: string | null;
  slug: string | null;
  align: 'left' | 'right' | 'stack';
  sizes: Sizes;
}) {
  // Always horizontal so the row reads identically at every width and matches
  // the native MatchRow. The away cell is right-aligned with the crest rendered
  // *after* the name (rather than `flex-row-reverse`, a lone utility that only
  // appears here and is easily dropped from a partial CSS build). 'stack' is
  // used only by the expanded variant, which puts the crest above a centred
  // name like a scoreboard. `min-w-0` is required at every flex level so
  // `truncate` can actually shrink the text.
  const isStack = align === 'stack';
  const directionClass = isStack ? 'flex-col' : 'flex-row';
  const justifyClass = align === 'right' ? 'justify-end' : '';
  const innerClassName = `flex min-w-0 items-center ${sizes.gap} ${directionClass} ${justifyClass}`;
  const crestEl = (
    <Crest
      team={slug ?? name}
      crestUrl={crest ?? undefined}
      size={sizes.crestPx}
      className="shrink-0 object-contain"
    />
  );
  const nameEl = (
    <span
      className={`min-w-0 max-w-full truncate ${isStack ? 'text-center' : 'text-left'} ${sizes.teamText} text-text`}
    >
      {name}
    </span>
  );
  const children = (
    <div className={innerClassName}>
      {align === 'right' ? null : crestEl}
      {nameEl}
      {align === 'right' ? crestEl : null}
    </div>
  );
  if (!slug) return <div className="min-w-0 flex-1">{children}</div>;
  return (
    <Link href={`/team/${slug}`} className="min-w-0 flex-1">
      {children}
    </Link>
  );
}

export function MatchRow({ fixture, variant = 'compact' }: Props) {
  const sizes = SIZES[variant];
  const local = useHasMounted();
  const homeName = fixture.home?.name ?? fixture.home_team_name ?? 'TBD';
  const awayName = fixture.away?.name ?? fixture.away_team_name ?? 'TBD';
  const isFinished = fixture.status === 'finished';
  const scoreText =
    isFinished && fixture.home_score != null && fixture.away_score != null
      ? `${fixture.home_score} – ${fixture.away_score}`
      : 'vs';

  return (
    <div className={`flex items-center border-b border-border ${sizes.padding} last:border-b-0`}>
      <TeamCell
        name={homeName}
        crest={fixture.home?.crest_url ?? null}
        slug={fixture.home?.slug ?? null}
        align={variant === 'expanded' ? 'stack' : 'left'}
        sizes={sizes}
      />
      {/* Score column links to the match detail page (timeline + scorers). The
          team cells already link to /team/[slug], so the centre column is the
          natural affordance for the match itself. */}
      <Link
        href={`/match/${fixture.id}`}
        className={`flex ${sizes.scoreColMin} flex-col items-center transition-opacity hover:opacity-80`}
      >
        <span className={isFinished ? sizes.scoreTextFinished : sizes.scoreText}>{scoreText}</span>
        <span className={`mt-0.5 ${sizes.dateText} text-text/50`}>
          {kickoffLabel(fixture.kickoff_at, fixture.status, local)}
        </span>
      </Link>
      <TeamCell
        name={awayName}
        crest={fixture.away?.crest_url ?? null}
        slug={fixture.away?.slug ?? null}
        align={variant === 'expanded' ? 'stack' : 'right'}
        sizes={sizes}
      />
    </div>
  );
}
