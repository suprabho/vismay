import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFollows, useFollowMutation } from '@/lib/useFollows';
import { EntityChip } from '@/components/EntityChip';

export default function FollowingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: follows, isLoading } = useFollows();
  const { unfollow } = useFollowMutation();

  if (isLoading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#00D26A" />
      </View>
    );
  }

  const byType = {
    league: follows?.filter((f) => f.entity.type === 'league') ?? [],
    team: follows?.filter((f) => f.entity.type === 'team') ?? [],
    player: follows?.filter((f) => f.entity.type === 'player') ?? [],
  };

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-6 pt-4 pb-2">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text className="text-muted text-base">←</Text>
        </Pressable>
        <Text className="text-text text-lg font-semibold">Following</Text>
        <View style={{ width: 16 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: insets.bottom + 24 }}>
        <Pressable
          onPress={() => router.push('/onboarding/leagues?edit=1')}
          className="rounded-lg border border-border py-3 items-center mb-6"
        >
          <Text className="text-text font-semibold">Edit preferences</Text>
        </Pressable>

        <Text className="text-muted text-sm mb-6">Tap to unfollow.</Text>

        {(['league', 'team', 'player'] as const).map((type) =>
          byType[type].length > 0 ? (
            <View key={type} className="mb-6">
              <Text className="text-muted text-xs uppercase tracking-wide mb-2">
                {type}s · {byType[type].length}
              </Text>
              <View className="flex-row flex-wrap">
                {byType[type].map((f) => (
                  <EntityChip
                    key={f.entity_id}
                    name={f.entity.name}
                    crestUrl={f.entity.crest_url}
                    selected
                    onPress={() => unfollow.mutate(f.entity_id)}
                  />
                ))}
              </View>
            </View>
          ) : null
        )}

        {(!follows || follows.length === 0) && (
          <Text className="text-muted text-sm">You&apos;re not following anything yet.</Text>
        )}
      </ScrollView>
    </View>
  );
}
