import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MatchRow, MatchTimeline, getCompetitionDisplayName } from '@vismay/footshorts-viz/native';
import type { EventTypeFilter } from '@vismay/footshorts-viz/native';
import { useFixtureDetail } from '@/lib/useFixtureDetail';

// Match web's `max-w-2xl` so the match page sits in a readable column on wider
// devices and bleeds to edge on phones (same constant as team/[slug]).
const MAX_CONTENT_WIDTH = 640;

// Timeline filter tabs (value → label). Values mirror FixtureEventType; 'subst'
// is the type value even though the tab reads "Subs".
const FILTER_TABS: ReadonlyArray<[EventTypeFilter, string]> = [
  ['all', 'All'],
  ['goal', 'Goals'],
  ['card', 'Cards'],
  ['subst', 'Subs'],
];

function kickoffLine(iso: string): string {
  const d = new Date(iso);
  // UTC, deterministic — MatchRow localizes the hero time itself.
  return `${d.toISOString().slice(0, 10)} · ${d.toISOString().slice(11, 16)} UTC`;
}

// Filter-aware empty copy (mirrors the web match page).
function timelineEmptyText(isFinished: boolean, filter: EventTypeFilter): string {
  if (!isFinished) return 'Events appear once the match is finished.';
  if (filter === 'goal') return 'No goals in this match.';
  if (filter === 'card') return 'No cards in this match.';
  if (filter === 'subst') return 'No substitutions in this match.';
  return 'No event data for this match yet.';
}

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [filter, setFilter] = useState<EventTypeFilter>('all');

  const { data, isLoading, isError } = useFixtureDetail(id);

  if (isLoading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#00D26A" />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View
        className="flex-1 bg-bg items-center justify-center px-6"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-text text-base">Match not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4" hitSlop={12}>
          <Text className="text-accent text-sm">← Back</Text>
        </Pressable>
      </View>
    );
  }

  const { fixture, events } = data;
  const competition = getCompetitionDisplayName(fixture.competition_slug);
  const meta = [
    competition,
    fixture.matchday != null ? `Matchday ${fixture.matchday}` : null,
    kickoffLine(fixture.kickoff_at),
  ]
    .filter(Boolean)
    .join(' · ');

  const isFinished = fixture.status === 'finished';

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
    >
      <View style={{ width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' }}>
        <View className="px-5 pb-2">
          <Pressable onPress={() => router.back()} hitSlop={12} className="mb-4">
            <Text className="text-accent text-sm">← Back</Text>
          </Pressable>
          <Pressable onPress={() => router.push(`/league/${fixture.competition_slug}`)} hitSlop={4}>
            <Text className="text-accent text-xs">{competition}</Text>
          </Pressable>
          <Text className="text-muted text-xs mt-1">{meta}</Text>
        </View>

        {/* Scoreboard hero — reuses the expanded MatchRow (stacked crests + score). */}
        <View className="px-5 mt-2">
          <View className="rounded-xl overflow-hidden border border-border bg-surface">
            <MatchRow fixture={fixture} variant="expanded" />
          </View>
        </View>

        <View className="px-5 mt-6">
          <Text className="text-text text-base font-semibold mb-2">Timeline</Text>
          <View className="flex-row mb-3" style={{ gap: 8 }}>
            {FILTER_TABS.map(([value, label]) => {
              const active = filter === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setFilter(value)}
                  hitSlop={4}
                  className={`rounded-md px-3 py-1 ${active ? 'bg-accent' : 'border border-border'}`}
                >
                  <Text className={`text-xs ${active ? 'text-surface' : 'text-text'}`}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View className="rounded-xl border border-border bg-surface px-4 py-1">
            <MatchTimeline
              events={events}
              filter={filter}
              emptyText={timelineEmptyText(isFinished, filter)}
            />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
