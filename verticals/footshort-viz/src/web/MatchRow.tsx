'use client';

import Link from 'next/link';
import type { FixtureRow } from '../types';

type Variant = 'compact' | 'expanded';

type Props = { fixture: FixtureRow; variant?: Variant };

type Sizes = {
  padding: string;
  gap: string;
  crest: string;
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
  sizes,
}: {
  name: string;
  crest: string | null;
  slug: string | null;
  align: 'left' | 'right' | 'stack';
  sizes: Sizes;
}) {
  // Flat structure: flex + flex-1 + justify go directly on the link/div so
  // the img and name are real flex children. The previous nested-span layout
  // had two flex-1 boxes fighting over width (the <a> as a flex item, and an
  // inner span re-declaring flex-1) which silently collapsed `justify-end`
  // because the inner span never actually stretched to the cell's width.
  const innerClassName = `flex items-center ${sizes.gap} ${align === 'stack' ? 'flex-col' : align === 'right' ? 'flex-row-reverse' : 'flex-row'}`;
  const children = (
    <div className={innerClassName}>
      {crest ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={crest} alt="" className={`${sizes.crest} object-contain`} />
      ) : null}
      <span className={`flex-row truncate ${sizes.teamText} text-text`}>{name}</span>
    </div>
  );
  if (!slug) return <div className="flex-1">{children}</div>;
  return (
    <Link href={`/team/${slug}`} className="flex-1">
      {children}
    </Link>
  );
}

export function MatchRow({ fixture, variant = 'compact' }: Props) {
  const sizes = SIZES[variant];
  const homeName = fixture.home?.name ?? fixture.home_team_name ?? 'TBD';
  const awayName = fixture.away?.name ?? fixture.away_team_name ?? 'TBD';
  const isFinished = fixture.status === 'finished';
  const scoreText =
    isFinished && fixture.home_score !== null && fixture.away_score !== null
      ? `${fixture.home_score} – ${fixture.away_score}`
      : 'vs';

  return (
    <div className={`flex items-center border-b border-white/20 ${sizes.padding} last:border-b-0`}>
      <TeamCell
        name={homeName}
        crest={fixture.home?.crest_url ?? null}
        slug={fixture.home?.slug ?? null}
        align={variant === 'expanded' ? 'stack' : 'left'}
        sizes={sizes}
      />
      <div className={`flex ${sizes.scoreColMin} flex-col items-center`}>
        <span className={isFinished ? sizes.scoreTextFinished : sizes.scoreText}>{scoreText}</span>
        <span className={`mt-0.5 ${sizes.dateText} text-text/50`}>
          {kickoffLabel(fixture.kickoff_at, fixture.status)}
        </span>
      </div>
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
