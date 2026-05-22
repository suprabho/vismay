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
  // On mobile the compact row stacks crest above name so the name gets the
  // cell's full width instead of competing with the 22px crest + gap; from
  // `sm:` upward it lays out horizontally. `min-w-0` is required at every
  // flex level so `truncate` can actually shrink the nowrap text.
  const directionClass =
    align === 'stack'
      ? 'flex-col'
      : align === 'right'
        ? 'flex-col sm:flex-row-reverse'
        : 'flex-col sm:flex-row';
  const innerClassName = `flex min-w-0 items-center ${sizes.gap} ${directionClass}`;
  const children = (
    <div className={innerClassName}>
      {crest ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={crest} alt="" className={`${sizes.crest} shrink-0 object-contain`} />
      ) : null}
      <span
        className={`min-w-0 max-w-full truncate text-center sm:text-left ${sizes.teamText} text-text`}
      >
        {name}
      </span>
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
