import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMemo, useState } from 'react';
import { useEntity } from '@/lib/useEntity';
import { useStandings, groupStandings } from '@/lib/useStandings';
import { useLeagueFixtures } from '@/lib/useFixtures';
import {
  StandingsTable,
  MatchRow,
  groupFixturesByRound,
} from '@vismay/footshorts-viz/native';

// Mirror web's max-w-2xl readable column so the league hub sits in a
// centered 640px frame on tablets/landscape and bleeds-to-edge on phones.
const MAX_CONTENT_WIDTH = 640;

type Tab = 'recent' | 'standings' | 'schedule';

const TAB_LABEL: Record<Tab, string> = {
  recent: 'Recent',
  standings: 'Standings',
  schedule: 'Schedule',
};

export default function LeagueScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('recent');

  const league = useEntity('league', slug);
  const standings = useStandings(slug);
  const pastFixtures = useLeagueFixtures(slug, 'past', 10);
  const upcomingFixtures = useLeagueFixtures(slug, 'upcoming', 10);
  // Full schedule for every competition — feeds the Schedule tab. A complete
  // domestic season is ~380 fixtures, so cap well above that.
  const scheduleFixtures = useLeagueFixtures(slug, 'all', 500);

  const standingGroups = useMemo(
    () => (standings.data ? groupStandings(standings.data) : []),
    [standings.data],
  );
  const scheduleRounds = useMemo(
    () => groupFixturesByRound(scheduleFixtures.data ?? []),
    [scheduleFixtures.data],
  );

  // Tabs surface only when their data exists. Recent is always available and is
  // the default. (Knockout brackets are authored in admin as editorial assets
  // rather than auto-derived here — football-data's free feed carries no draw
  // linkage, so the tree can't be reconstructed reliably from fixtures.)
  const availableTabs = useMemo<Tab[]>(
    () => [
      'recent',
      ...(standingGroups.length > 0 ? (['standings'] as const) : []),
      ...(scheduleRounds.length > 0 ? (['schedule'] as const) : []),
    ],
    [standingGroups.length, scheduleRounds.length],
  );
  const activeTab: Tab = availableTabs.includes(tab) ? tab : 'recent';

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

        <TabBar tabs={availableTabs} active={activeTab} onChange={setTab} />

        <View className="px-5 mt-6">
          {activeTab === 'recent' ? (
            <View style={{ gap: 24 }}>
              <View>
                <SubHeading>Recent results</SubHeading>
                <FixtureList
                  loading={pastFixtures.isLoading}
                  data={pastFixtures.data ?? []}
                  emptyText="No recent results."
                />
              </View>
              <View>
                <SubHeading>Upcoming</SubHeading>
                <FixtureList
                  loading={upcomingFixtures.isLoading}
                  data={upcomingFixtures.data ?? []}
                  emptyText="No upcoming fixtures."
                />
              </View>
            </View>
          ) : null}

          {activeTab === 'standings' ? (
            standings.isLoading ? (
              <ActivityIndicator color="#00D26A" />
            ) : standingGroups.length > 0 ? (
              <View style={{ gap: 20 }}>
                {standingGroups.map((group) => (
                  <View key={group.label || 'overall'}>
                    {group.label ? <SubHeading>{group.label}</SubHeading> : null}
                    <StandingsTable rows={group.rows} />
                  </View>
                ))}
              </View>
            ) : (
              <EmptyNote text="No standings yet." />
            )
          ) : null}

          {activeTab === 'schedule' ? (
            scheduleFixtures.isLoading ? (
              <ActivityIndicator color="#00D26A" />
            ) : scheduleRounds.length > 0 ? (
              <View style={{ gap: 20 }}>
                {scheduleRounds.map((round) => (
                  <View key={round.key}>
                    <SubHeading>{round.label}</SubHeading>
                    <View className="rounded-xl overflow-hidden border border-border bg-surface">
                      {round.fixtures.map((f) => (
                        <MatchRow key={f.id} fixture={f} />
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <EmptyNote text="No fixtures scheduled yet." />
            )
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: Tab[];
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <View className="px-5 flex-row border-b border-border" style={{ gap: 4 }}>
      {tabs.map((t) => {
        const isActive = t === active;
        return (
          <Pressable
            key={t}
            onPress={() => onChange(t)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginBottom: -1,
              borderBottomWidth: 2,
              borderBottomColor: isActive ? '#00D26A' : 'transparent',
            }}
          >
            <Text className={isActive ? 'text-text text-sm font-semibold' : 'text-muted text-sm font-semibold'}>
              {TAB_LABEL[t]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-muted text-[11px] font-bold uppercase mb-2" style={{ letterSpacing: 1.2 }}>
      {children}
    </Text>
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
