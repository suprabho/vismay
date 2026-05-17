import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEntity, usePlayersInTeam } from '@/lib/useEntity';
import { useTeamStanding } from '@/lib/useStandings';
import { useTeamFixtures } from '@/lib/useFixtures';
import { MatchRow } from '@/components/MatchRow';

export default function TeamScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const team = useEntity('team', slug);
  const teamId = team.data?.id;
  const leagueSlug = team.data?.league_slug ?? undefined;

  const standing = useTeamStanding(teamId, leagueSlug);
  const pastFixtures = useTeamFixtures(teamId, 'past', 10);
  const upcomingFixtures = useTeamFixtures(teamId, 'upcoming', 5);
  const players = usePlayersInTeam(slug);

  if (team.isLoading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#00D26A" />
      </View>
    );
  }

  if (!team.data) {
    return (
      <View className="flex-1 bg-bg items-center justify-center px-6" style={{ paddingTop: insets.top }}>
        <Text className="text-text text-base">Team not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-accent text-sm">← Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
    >
      <View className="px-5 pb-4">
        <Pressable onPress={() => router.back()} hitSlop={12} className="mb-4">
          <Text className="text-accent text-sm">← Back</Text>
        </Pressable>
        <View className="flex-row items-center">
          {team.data.crest_url ? (
            <Image
              source={{ uri: team.data.crest_url }}
              style={{ width: 52, height: 52, marginRight: 12 }}
              contentFit="contain"
            />
          ) : null}
          <View className="flex-1">
            <Text className="text-text text-2xl font-bold">{team.data.name}</Text>
            {leagueSlug ? (
              <Pressable onPress={() => router.push(`/league/${leagueSlug}`)} hitSlop={4}>
                <Text className="text-accent text-xs mt-1">{leagueSlug}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      {standing.data ? (
        <View className="px-5 mt-2">
          <View className="flex-row bg-surface border border-border rounded-xl px-4 py-3">
            <Stat label="Pos" value={`#${standing.data.position}`} />
            <Stat label="P" value={standing.data.played} />
            <Stat label="W" value={standing.data.won} />
            <Stat label="D" value={standing.data.draw} />
            <Stat label="L" value={standing.data.lost} />
            <Stat label="GD" value={standing.data.goal_difference} />
            <Stat label="Pts" value={standing.data.points} emphasis />
          </View>
          {standing.data.form ? (
            <Text className="text-muted text-xs mt-2">Form: {standing.data.form}</Text>
          ) : null}
        </View>
      ) : null}

      <Section title="Upcoming">
        <FixtureList
          loading={upcomingFixtures.isLoading}
          data={upcomingFixtures.data ?? []}
          emptyText="No upcoming fixtures."
        />
      </Section>

      <Section title="Recent results">
        <FixtureList
          loading={pastFixtures.isLoading}
          data={pastFixtures.data ?? []}
          emptyText="No recent results."
        />
      </Section>

      <Section title="Squad">
        {players.isLoading ? (
          <ActivityIndicator color="#00D26A" />
        ) : players.data && players.data.length > 0 ? (
          <View>
            {players.data.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => router.push(`/player/${p.slug}`)}
                className="bg-surface border border-border rounded-xl px-3 py-3 mb-2"
              >
                <Text className="text-text text-sm">{p.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text className="text-muted text-sm">No players listed yet.</Text>
        )}
      </Section>
    </ScrollView>
  );
}

function Stat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number | string;
  emphasis?: boolean;
}) {
  return (
    <View className="flex-1 items-center">
      <Text className={`text-[10px] ${emphasis ? 'text-accent' : 'text-muted'}`}>{label}</Text>
      <Text className={`text-sm mt-0.5 ${emphasis ? 'text-accent font-semibold' : 'text-text'}`}>
        {value}
      </Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="px-5 mt-5">
      <Text className="text-text text-base font-semibold mb-3">{title}</Text>
      {children}
    </View>
  );
}

function FixtureList({
  loading,
  data,
  emptyText,
}: {
  loading: boolean;
  data: import('@/lib/useFixtures').FixtureRow[];
  emptyText: string;
}) {
  if (loading) return <ActivityIndicator color="#00D26A" />;
  if (data.length === 0) return <Text className="text-muted text-sm">{emptyText}</Text>;
  return (
    <View>
      {data.map((f) => (
        <MatchRow key={f.id} fixture={f} />
      ))}
    </View>
  );
}
