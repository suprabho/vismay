import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTeams } from '@/lib/useEntities';
import { useFollowMutation, useFollows } from '@/lib/useFollows';
import { useAuth } from '@/lib/AuthProvider';
import { supabase } from '@/lib/supabase';
import { EntityChip } from '@/components/EntityChip';

const MIN_TEAMS = 3;

export default function OnboardingTeams() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, refreshProfile } = useAuth();
  const { leagues, edit } = useLocalSearchParams<{ leagues?: string; edit?: string }>();
  const leagueSlugs = useMemo(() => (leagues ? leagues.split(',').filter(Boolean) : []), [leagues]);

  const { data: teams, isLoading } = useTeams(leagueSlugs);
  const { data: follows } = useFollows();
  const { follow, unfollow } = useFollowMutation();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (seeded || !teams) return;
    if (edit && !follows) return;
    if (edit && follows) {
      const followed = new Set(follows.map((f) => f.entity_id));
      const seed = new Set(teams.filter((t) => followed.has(t.id)).map((t) => t.id));
      setPicked(seed);
      setInitial(seed);
    }
    setSeeded(true);
  }, [teams, follows, edit, seeded]);

  const filtered = useMemo(() => {
    const list = teams ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((t) => t.name.toLowerCase().includes(q));
  }, [teams, query]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function finish() {
    if (!session) return;
    setBusy(true);
    const toFollow = Array.from(picked).filter((id) => !initial.has(id));
    const toUnfollow = Array.from(initial).filter((id) => !picked.has(id));
    await Promise.all([
      ...toFollow.map((id) => follow.mutateAsync(id)),
      ...toUnfollow.map((id) => unfollow.mutateAsync(id)),
    ]);
    if (!edit) {
      await supabase
        .from('profiles')
        .update({ onboarded_at: new Date().toISOString() })
        .eq('id', session.user.id);
      await refreshProfile();
    }
    setBusy(false);
    router.replace(edit ? '/following' : '/(tabs)/feed');
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#00D26A" />
      </View>
    );
  }

  const canFinish = picked.size >= MIN_TEAMS;

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <View className="px-6 pt-6">
        <Text className="text-text text-3xl font-bold mb-1">Pick your teams</Text>
        <Text className="text-muted text-sm mb-4">Choose at least {MIN_TEAMS}. ({picked.size} selected)</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search teams"
          placeholderTextColor="#8E8E99"
          autoCapitalize="none"
          autoCorrect={false}
          className="bg-surface border border-border rounded-lg px-4 py-3 text-text mb-4"
        />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View className="flex-row flex-wrap">
          {filtered.map((t) => (
            <EntityChip
              key={t.id}
              name={t.name}
              crestUrl={t.crest_url}
              selected={picked.has(t.id)}
              onPress={() => toggle(t.id)}
            />
          ))}
        </View>
        {filtered.length === 0 ? (
          <Text className="text-muted text-sm text-center mt-6">No teams match your search.</Text>
        ) : null}
      </ScrollView>

      <View className="px-6 py-4 border-t border-border bg-bg" style={{ paddingBottom: insets.bottom + 16 }}>
        <Pressable
          onPress={finish}
          disabled={!canFinish || busy}
          className={`rounded-lg py-3 items-center ${canFinish && !busy ? 'bg-accent' : 'bg-surface'}`}
        >
          {busy ? (
            <ActivityIndicator color="#0B0B0F" />
          ) : (
            <Text className={canFinish ? 'text-bg font-semibold' : 'text-muted font-semibold'}>
              Finish
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
