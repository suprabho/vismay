import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
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
  // scheduled: show date + time
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
  const router = useRouter();
  const body = (
    <View className={`flex-row items-center flex-1 ${align === 'right' ? 'justify-end' : ''}`}>
      {align === 'left' && crest ? (
        <Image source={{ uri: crest }} style={{ width: 22, height: 22, marginRight: 8 }} contentFit="contain" />
      ) : null}
      <Text className="text-text text-sm flex-shrink" numberOfLines={1}>
        {name}
      </Text>
      {align === 'right' && crest ? (
        <Image source={{ uri: crest }} style={{ width: 22, height: 22, marginLeft: 8 }} contentFit="contain" />
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

export function MatchRow({ fixture }: Props) {
  const homeName = fixture.home?.name ?? fixture.home_team_name ?? 'TBD';
  const awayName = fixture.away?.name ?? fixture.away_team_name ?? 'TBD';
  const isFinished = fixture.status === 'finished';
  const scoreText =
    isFinished && fixture.home_score !== null && fixture.away_score !== null
      ? `${fixture.home_score} – ${fixture.away_score}`
      : 'vs';

  return (
    <View className="flex-row items-center p-2 border-b-2 border-white/30">
      <TeamCell
        name={homeName}
        crest={fixture.home?.crest_url ?? null}
        slug={fixture.home?.slug ?? null}
        align="left"
      />
      <View className="px-3 items-center min-w-[72px]">
        <Text className={isFinished ? 'text-text text-sm font-semibold' : 'text-text/80 text-xs'}>
          {scoreText}
        </Text>
        <Text className="text-text/50 text-[10px] mt-0.5">
          {kickoffLabel(fixture.kickoff_at, fixture.status)}
        </Text>
      </View>
      <TeamCell
        name={awayName}
        crest={fixture.away?.crest_url ?? null}
        slug={fixture.away?.slug ?? null}
        align="right"
      />
    </View>
  );
}
