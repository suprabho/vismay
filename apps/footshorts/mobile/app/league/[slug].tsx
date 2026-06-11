import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMemo } from 'react';
import { useEntity } from '@/lib/useEntity';
import { useStandings, groupStandings } from '@/lib/useStandings';
import { useLeagueFixtures } from '@/lib/useFixtures';
import {
  StandingsTable,
  MatchRow,
  Bracket,
  buildBracket,
  isLeagueCompetition,
} from '@vismay/footshorts-viz/native';

// Mirror web's max-w-2xl readable column so the league hub sits in a
// centered 640px frame on tablets/landscape and bleeds-to-edge on phones.
const MAX_CONTENT_WIDTH = 640;

export default function LeagueScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const league = useEntity('league', slug);
  const standings = useStandings(slug);
  const pastFixtures = useLeagueFixtures(slug, 'past', 10);
  const upcomingFixtures = useLeagueFixtures(slug, 'upcoming', 10);
  // Bracket only applies to cups/tournaments — skip the wide fetch for plain
  // leagues (which never have knockout fixtures) by disabling the query there.
  const isLeague = isLeagueCompetition(slug);
  const bracketFixtures = useLeagueFixtures(isLeague ? undefined : slug, 'all', 200);

  const standingGroups = useMemo(
    () => (standings.data ? groupStandings(standings.data) : []),
    [standings.data],
  );
  const bracket = useMemo(
    () => buildBracket(bracketFixtures.data ?? []),
    [bracketFixtures.data],
  );

  if (league.isLoading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#00D26A" />
      </View>
    );
  }

  if (!league.data) {
    return (
      <View className="flex-1 bg-bg items-center justify-center px-6" style={{ paddingTop: insets.top }}>
        <Text className="text-text text-base">League not found</Text>
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
            {league.data.crest_url ? (
              <Image
                source={{ uri: league.data.crest_url }}
                style={{ width: 44, height: 44, marginRight: 12 }}
                contentFit="contain"
              />
            ) : null}
            <View className="flex-1">
              <Text className="text-text text-2xl font-bold">{league.data.name}</Text>
              {league.data.country ? (
                <Text className="text-muted text-xs mt-0.5">{league.data.country}</Text>
              ) : null}
            </View>
          </View>
        </View>

        <Section title="Standings">
          {standings.isLoading ? (
            <ActivityIndicator color="#00D26A" />
          ) : standingGroups.length > 0 ? (
            <View style={{ gap: 20 }}>
              {standingGroups.map((group) => (
                <View key={group.label || 'overall'}>
                  {group.label ? (
                    <Text
                      className="text-muted text-[11px] font-bold uppercase mb-2"
                      style={{ letterSpacing: 1.2 }}
                    >
                      {group.label}
                    </Text>
                  ) : null}
                  <StandingsTable rows={group.rows} />
                </View>
              ))}
            </View>
          ) : (
            <EmptyNote text="No standings yet." />
          )}
        </Section>

        {bracket ? (
          <Section title="Knockout bracket">
            <Bracket bracket={bracket} />
          </Section>
        ) : null}

        <Section title="Recent results">
          <FixtureList
            loading={pastFixtures.isLoading}
            data={pastFixtures.data ?? []}
            emptyText="No recent results."
          />
        </Section>

        <Section title="Upcoming">
          <FixtureList
            loading={upcomingFixtures.isLoading}
            data={upcomingFixtures.data ?? []}
            emptyText="No upcoming fixtures."
          />
        </Section>
      </View>
    </ScrollView>
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

function EmptyNote({ text }: { text: string }) {
  return <Text className="text-muted text-sm">{text}</Text>;
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
  if (data.length === 0) return <EmptyNote text={emptyText} />;
  // Bordered surface wrapper mirrors web's
  // `overflow-hidden rounded-xl border border-border bg-surface` block so
  // each fixture list reads as a coherent card instead of a bare list.
  return (
    <View className="rounded-xl overflow-hidden border border-border bg-surface">
      {data.map((f) => (
        <MatchRow key={f.id} fixture={f} />
      ))}
    </View>
  );
}
