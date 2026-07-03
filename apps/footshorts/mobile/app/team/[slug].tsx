import { useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEntity, usePlayersInTeam } from '@/lib/useEntity';
import { useTeamStanding } from '@/lib/useStandings';
import { useTeamFixtures } from '@/lib/useFixtures';
import { MatchRow, TeamFormStrip } from '@vismay/footshorts-viz/native';
import { EntityShareCards } from '@/components/EntityShareCards';

// Match web's `max-w-2xl` so team hubs sit in a readable column on wider
// devices and bleed-to-edge on phones.
const MAX_CONTENT_WIDTH = 640;

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

  // 'past' is ordered kickoff_at DESC; the form strip reads oldest → newest.
  const formItems = useMemo(
    () => [...(pastFixtures.data ?? [])].slice(0, 5).reverse(),
    [pastFixtures.data],
  );

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
      <View style={{ width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' }}>
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
          </View>
        ) : null}

        {/* Outside the standings guard so cup-only teams still get a form strip. */}
        {teamId && formItems.length > 0 ? (
          <View className="px-5">
            <TeamFormStrip fixtures={formItems} teamId={teamId} />
          </View>
        ) : null}

        <EntityShareCards entityId={teamId} />

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
            // Bordered surface wrapper with row dividers mirrors web's
            // `overflow-hidden rounded-xl border bg-surface` squad card.
            <View className="rounded-xl overflow-hidden border border-border bg-surface">
              {players.data.map((p, i) => (
                <Pressable
                  key={p.id}
                  onPress={() => router.push(`/player/${p.slug}`)}
                  className={`px-4 py-3 ${i < players.data!.length - 1 ? 'border-b border-border/50' : ''}`}
                >
                  <Text className="text-text text-sm">{p.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text className="text-muted text-sm">No players listed yet.</Text>
          )}
        </Section>
      </View>
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
    <View className="px-5 mt-6">
      <Text className="text-text text-base font-semibold mb-2">{title}</Text>
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
  // Bordered surface + expanded MatchRow variant mirror web's team-page
  // fixture treatment (`MatchRow variant="expanded"` inside a rounded card).
  return (
    <View className="rounded-xl overflow-hidden border border-border bg-surface">
      {data.map((f) => (
        <MatchRow key={f.id} fixture={f} variant="expanded" />
      ))}
    </View>
  );
}
