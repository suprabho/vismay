import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { FixtureRow } from '../types';

export type MatchRowVariant = 'compact' | 'expanded';

type Props = { fixture: FixtureRow; variant?: MatchRowVariant };

function kickoffLabel(
  iso: string,
  status: FixtureRow['status'],
  variant: MatchRowVariant,
): string {
  const d = new Date(iso);
  if (status === 'finished') {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  if (status === 'live') return 'LIVE';
  if (status === 'postponed') return 'PPD';
  if (status === 'cancelled') return 'CXL';
  // scheduled: 'expanded' shows full weekday context to match web's expanded
  // MatchRow variant (e.g. "Sat · Nov 8 · 3:00 PM"); 'compact' stays terse.
  if (variant === 'expanded') {
    const datePart = d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const timePart = d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${datePart} · ${timePart}`;
  }
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
  variant,
}: {
  name: string;
  crest: string | null;
  slug: string | null;
  align: 'left' | 'right';
  variant: MatchRowVariant;
}) {
  const router = useRouter();
  const crestSize = variant === 'expanded' ? 26 : 22;
  const textClass =
    variant === 'expanded'
      ? 'text-text text-base flex-shrink'
      : 'text-text text-sm flex-shrink';
  const body = (
    <View className={`flex-row items-center flex-1 ${align === 'right' ? 'justify-end' : ''}`}>
      {align === 'left' && crest ? (
        <Image source={{ uri: crest }} style={{ width: crestSize, height: crestSize, marginRight: 8 }} contentFit="contain" />
      ) : null}
      <Text className={textClass} numberOfLines={1}>
        {name}
      </Text>
      {align === 'right' && crest ? (
        <Image source={{ uri: crest }} style={{ width: crestSize, height: crestSize, marginLeft: 8 }} contentFit="contain" />
      ) : null}
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
  const homeName = fixture.home?.name ?? fixture.home_team_name ?? 'TBD';
  const awayName = fixture.away?.name ?? fixture.away_team_name ?? 'TBD';
  const isFinished = fixture.status === 'finished';
  const scoreText =
    isFinished && fixture.home_score !== null && fixture.away_score !== null
      ? `${fixture.home_score} – ${fixture.away_score}`
      : 'vs';

  // 'expanded' gives more vertical breathing room and a taller centre cell to
  // match web's expanded MatchRow used on team pages.
  const rowPadding = variant === 'expanded' ? 'p-3' : 'p-2';
  const centerMinWidth = variant === 'expanded' ? 88 : 72;
  const scoreClass =
    variant === 'expanded'
      ? isFinished
        ? 'text-text text-base font-semibold'
        : 'text-text/80 text-sm'
      : isFinished
        ? 'text-text text-sm font-semibold'
        : 'text-text/80 text-xs';

  return (
    <View className={`flex-row items-center ${rowPadding} border-b-2 border-white/30`}>
      <TeamCell
        name={homeName}
        crest={fixture.home?.crest_url ?? null}
        slug={fixture.home?.slug ?? null}
        align="left"
        variant={variant}
      />
      <View className="px-3 items-center" style={{ minWidth: centerMinWidth }}>
        <Text className={scoreClass}>{scoreText}</Text>
        <Text className="text-text/50 text-[10px] mt-0.5">
          {kickoffLabel(fixture.kickoff_at, fixture.status, variant)}
        </Text>
      </View>
      <TeamCell
        name={awayName}
        crest={fixture.away?.crest_url ?? null}
        slug={fixture.away?.slug ?? null}
        align="right"
        variant={variant}
      />
    </View>
  );
}
