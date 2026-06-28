import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { FixtureRow } from '../types';
import { teamCrestUrl } from '../data/teams';

export type MatchRowVariant = 'compact' | 'expanded';

type Props = { fixture: FixtureRow; variant?: MatchRowVariant };

type Sizes = {
  padding: string;
  gap: string;
  crest: number;
  teamText: string;
  scoreText: string;
  scoreTextFinished: string;
  dateText: string;
  scoreColMin: number;
  scoreColPad: string;
};

// Mirrors web/MatchRow.tsx SIZES so the two platforms render identically.
const SIZES: Record<MatchRowVariant, Sizes> = {
  compact: {
    padding: 'p-2',
    gap: 'gap-2',
    crest: 22,
    teamText: 'text-sm',
    scoreText: 'text-xs text-text/80',
    scoreTextFinished: 'text-sm font-semibold text-text',
    dateText: 'text-[10px]',
    scoreColMin: 72,
    scoreColPad: 'px-3',
  },
  expanded: {
    padding: 'p-4',
    gap: 'gap-3',
    crest: 40,
    teamText: 'text-sm',
    scoreText: 'text-2xl text-text/80',
    scoreTextFinished: 'text-4xl font-semibold text-text',
    dateText: 'text-xs',
    scoreColMin: 96,
    scoreColPad: 'px-4',
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

// Kicks off in the *device's* local timezone so a 19:00 UTC match reads as the
// user's wall-clock time. We use fixed month names (rather than toLocale*) to
// keep the string format stable across locales — "Feb 16" / "Feb 16 14:30".
// Native has no SSR, so the local getters are safe to call directly here; the
// web sibling defers the same conversion until after hydration.
function kickoffLabel(iso: string, status: FixtureRow['status']): string {
  const d = new Date(iso);
  if (status === 'finished') {
    return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
  }
  if (status === 'live') return 'LIVE';
  if (status === 'postponed') return 'PPD';
  if (status === 'cancelled') return 'CXL';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()} ${hh}:${mm}`;
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
  const router = useRouter();
  // 'stack' (expanded) puts the crest above a centred name like web's expanded
  // MatchRow; 'left'/'right' lay out horizontally. The away cell is right-
  // aligned with the crest rendered *after* the name — we avoid `flex-row-
  // reverse` because a View's default flexDirection in RN is `column`, so if
  // that lone utility ever fails to compile the cell silently stacks instead.
  const isStack = align === 'stack';
  const directionClass = isStack ? 'flex-col' : 'flex-row';
  const justifyClass = align === 'right' ? 'justify-end' : '';
  const nameClass = isStack
    ? `w-full text-center ${sizes.teamText} text-text`
    : `flex-shrink ${sizes.teamText} text-text`;
  // Explicit crest_url wins, else fall back to the bundled palette crest so
  // teams show a badge everywhere (Crest's SVG monogram is web-only).
  const crestUri = crest ?? teamCrestUrl(slug ?? name);
  const crestEl = crestUri ? (
    <Image
      source={{ uri: crestUri }}
      style={{ width: sizes.crest, height: sizes.crest }}
      contentFit="contain"
    />
  ) : null;
  const body = (
    <View className={`flex-1 items-center ${sizes.gap} ${directionClass} ${justifyClass}`}>
      {align === 'right' ? null : crestEl}
      <Text className={nameClass} numberOfLines={1}>
        {name}
      </Text>
      {align === 'right' ? crestEl : null}
    </View>
  );
  if (!slug) return body;
  return (
    <Pressable onPress={() => router.push(`/team/${slug}`)} className="flex-1" hitSlop={4}>
      {body}
    </Pressable>
  );
}

export function MatchRow({ fixture, variant = 'compact' }: Props) {
  const router = useRouter();
  const sizes = SIZES[variant];
  const homeName = fixture.home?.name ?? fixture.home_team_name ?? 'TBD';
  const awayName = fixture.away?.name ?? fixture.away_team_name ?? 'TBD';
  const isFinished = fixture.status === 'finished';
  const scoreText =
    isFinished && fixture.home_score != null && fixture.away_score != null
      ? `${fixture.home_score} – ${fixture.away_score}`
      : 'vs';

  return (
    <View className={`flex-row items-center border-b border-border ${sizes.padding}`}>
      <TeamCell
        name={homeName}
        crest={fixture.home?.crest_url ?? null}
        slug={fixture.home?.slug ?? null}
        align={variant === 'expanded' ? 'stack' : 'left'}
        sizes={sizes}
      />
      {/* Score column taps through to the match detail page (timeline +
          scorers). The team cells already route to /team/{slug}, so the centre
          column is the natural affordance for the match itself — mirrors web. */}
      <Pressable
        onPress={() => router.push(`/match/${fixture.id}`)}
        className={`items-center ${sizes.scoreColPad}`}
        style={{ minWidth: sizes.scoreColMin }}
        hitSlop={4}
      >
        <Text className={isFinished ? sizes.scoreTextFinished : sizes.scoreText}>{scoreText}</Text>
        <Text className={`mt-0.5 ${sizes.dateText} text-text/50`}>
          {kickoffLabel(fixture.kickoff_at, fixture.status)}
        </Text>
      </Pressable>
      <TeamCell
        name={awayName}
        crest={fixture.away?.crest_url ?? null}
        slug={fixture.away?.slug ?? null}
        align={variant === 'expanded' ? 'stack' : 'right'}
        sizes={sizes}
      />
    </View>
  );
}
