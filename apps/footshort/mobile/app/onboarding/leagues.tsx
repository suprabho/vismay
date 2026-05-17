import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLeagues } from '@/lib/useEntities';
import { useFollowMutation, useFollows } from '@/lib/useFollows';
import { EntityChip } from '@/components/EntityChip';

const MIN_LEAGUES = 3;

export default function OnboardingLeagues() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const { data: leagues, isLoading } = useLeagues();
  const { data: follows } = useFollows();
  const { follow, unfollow } = useFollowMutation();
  const [picked, setPicked] = useState<Set<string>>(new Set()); // entity IDs
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (seeded || !leagues) return;
    if (edit && !follows) return;
    if (edit && follows) {
      const followed = new Set(follows.map((f) => f.entity_id));
      const seed = new Set(leagues.filter((l) => followed.has(l.id)).map((l) => l.id));
      setPicked(seed);
      setInitial(seed);
    }
    setSeeded(true);
  }, [leagues, follows, edit, seeded]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function next() {
    setBusy(true);
    const toFollow = Array.from(picked).filter((id) => !initial.has(id));
    const toUnfollow = Array.from(initial).filter((id) => !picked.has(id));
    await Promise.all([
      ...toFollow.map((id) => follow.mutateAsync(id)),
      ...toUnfollow.map((id) => unfollow.mutateAsync(id)),
    ]);
    setBusy(false);
    const slugs = (leagues ?? []).filter((l) => picked.has(l.id)).map((l) => l.slug);
    router.push({
      pathname: '/onboarding/teams',
      params: { leagues: slugs.join(','), ...(edit ? { edit: '1' } : {}) },
    });
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#00D26A" />
      </View>
    );
  }

  const canContinue = picked.size >= MIN_LEAGUES;

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <View className="px-6 pt-6">
        <Text className="text-text text-3xl font-bold mb-1">Pick your leagues</Text>
        <Text className="text-muted text-sm mb-6">Choose at least {MIN_LEAGUES}. ({picked.size} selected)</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}>
        <View className="flex-row flex-wrap">
          {leagues?.map((l) => (
            <EntityChip
              key={l.id}
              name={l.name}
              crestUrl={l.crest_url}
              selected={picked.has(l.id)}
              onPress={() => toggle(l.id)}
            />
          ))}
        </View>
      </ScrollView>

      <View className="px-6 py-4 border-t border-border bg-bg" style={{ paddingBottom: insets.bottom + 16 }}>
        <Pressable
          onPress={next}
          disabled={!canContinue || busy}
          className={`rounded-lg py-3 items-center ${canContinue && !busy ? 'bg-accent' : 'bg-surface'}`}
        >
          {busy ? (
            <ActivityIndicator color="#0B0B0F" />
          ) : (
            <Text className={canContinue ? 'text-bg font-semibold' : 'text-muted font-semibold'}>
              Continue
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
