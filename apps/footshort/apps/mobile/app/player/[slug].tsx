import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEntity } from '@/lib/useEntity';

export default function PlayerScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const player = useEntity('player', slug);

  if (player.isLoading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#00D26A" />
      </View>
    );
  }

  if (!player.data) {
    return (
      <View className="flex-1 bg-bg items-center justify-center px-6" style={{ paddingTop: insets.top }}>
        <Text className="text-text text-base">Player not found</Text>
        <Text className="text-muted text-xs mt-2 text-center">
          Player profiles require a paid football-data tier (squad endpoint). Coming in Phase 2.
        </Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-accent text-sm">← Back</Text>
        </Pressable>
      </View>
    );
  }

  const teamSlug = player.data.team_slug ?? undefined;
  const leagueSlug = player.data.league_slug ?? undefined;

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
          {player.data.crest_url ? (
            <Image
              source={{ uri: player.data.crest_url }}
              style={{ width: 60, height: 60, marginRight: 12, borderRadius: 30 }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{ width: 60, height: 60, marginRight: 12, borderRadius: 30 }}
              className="bg-surface items-center justify-center"
            >
              <Text className="text-muted text-xl">
                {player.data.name
                  .split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')}
              </Text>
            </View>
          )}
          <View className="flex-1">
            <Text className="text-text text-2xl font-bold">{player.data.name}</Text>
            {player.data.country ? (
              <Text className="text-muted text-xs mt-0.5">{player.data.country}</Text>
            ) : null}
          </View>
        </View>
      </View>

      {(teamSlug || leagueSlug) ? (
        <View className="px-5 mt-2">
          {teamSlug ? (
            <Pressable
              onPress={() => router.push(`/team/${teamSlug}`)}
              className="bg-surface border border-border rounded-xl px-4 py-3 mb-2"
            >
              <Text className="text-muted text-[10px]">Team</Text>
              <Text className="text-text text-sm mt-0.5">{teamSlug}</Text>
            </Pressable>
          ) : null}
          {leagueSlug ? (
            <Pressable
              onPress={() => router.push(`/league/${leagueSlug}`)}
              className="bg-surface border border-border rounded-xl px-4 py-3"
            >
              <Text className="text-muted text-[10px]">League</Text>
              <Text className="text-text text-sm mt-0.5">{leagueSlug}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View className="px-5 mt-6">
        <Text className="text-muted text-xs">
          Detailed player stats (appearances, goals, assists) land in Phase 2 when squad data is
          backfilled.
        </Text>
      </View>
    </ScrollView>
  );
}
