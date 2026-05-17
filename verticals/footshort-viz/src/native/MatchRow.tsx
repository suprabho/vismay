import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';
import type { FixtureRow } from '../types';

/**
 * Called when the user taps a team. Consumers decide where the tap goes
 * (e.g. Footshort routes to `/team/<slug>` via expo-router). Omit to disable
 * tap-to-navigate — useful when the row is embedded in a context with no
 * team-detail screen.
 */
type OnTeamPress = (slug: string) => void;

type Props = {
  fixture: FixtureRow;
  onTeamPress?: OnTeamPress;
};

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
  onPress,
  align,
}: {
  name: string;
  crest: string | null;
  onPress: (() => void) | null;
  align: 'left' | 'right';
}) {
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
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} className="flex-1" hitSlop={4}>
      {body}
    </Pressable>
  );
}

export function MatchRow({ fixture, onTeamPress }: Props) {
  const homeName = fixture.home?.name ?? fixture.home_team_name ?? 'TBD';
  const awayName = fixture.away?.name ?? fixture.away_team_name ?? 'TBD';
  const homeSlug = fixture.home?.slug ?? null;
  const awaySlug = fixture.away?.slug ?? null;
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
        onPress={homeSlug && onTeamPress ? () => onTeamPress(homeSlug) : null}
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
        onPress={awaySlug && onTeamPress ? () => onTeamPress(awaySlug) : null}
        align="right"
      />
    </View>
  );
}
