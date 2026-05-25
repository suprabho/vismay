import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MatchTile } from '@vismay/footshorts-viz/native';
import { useAuth } from '@/lib/AuthProvider';
import { useLandingMatchSnapshot } from '@/lib/useLandingMatchSnapshot';

/**
 * Mobile landing for logged-out users. Mirrors the web landing's spine
 * (hero + match strip + secondary CTA + footer) but skips the marketing
 * sections (features, coverage grid) because the native app is the product —
 * the only thing a logged-out visitor needs is a reason to log in.
 *
 * Logged-in users never see this; they're redirected by the index route to
 * onboarding or /feed.
 */
export default function LandingScreen() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const { data: snapshot } = useLandingMatchSnapshot();

  // If a logged-in user lands here directly (deep link, back stack), bounce
  // out to the index router which will pick onboarding vs feed.
  if (!loading && session) return <Redirect href="/" />;

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="flex-row items-center justify-between px-6 pt-2 pb-3">
        <Text className="text-text text-lg font-bold">ShortFoot</Text>
        <Pressable
          onPress={() => router.push('/login')}
          className="rounded-full border border-border px-4 py-1.5"
          hitSlop={6}
        >
          <Text className="text-text text-sm font-medium">Login</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View className="px-6 pt-10 pb-8">
          <Text className="text-text text-4xl font-bold leading-tight">
            Your football in short.
          </Text>
          <Text className="text-muted text-base mt-3 leading-snug">
            Follow your clubs and leagues. Glanceable schedules, scores,
            standings, and bite-size briefs — no doomscrolling.
          </Text>
          <View className="flex-row items-center gap-3 mt-6">
            <Pressable
              onPress={() => router.push('/login')}
              className="bg-accent rounded-full px-5 py-3"
            >
              <Text className="text-bg font-semibold">Get started</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/login')}
              className="rounded-full border border-border px-5 py-3"
            >
              <Text className="text-text font-medium">I have an account</Text>
            </Pressable>
          </View>
        </View>

        {/* Match strip */}
        {snapshot && snapshot.length > 0 ? (
          <View className="mb-10">
            <Text className="text-muted text-xs uppercase tracking-wider px-6 mb-3">
              Recent & upcoming
            </Text>
            <FlatList
              data={snapshot}
              horizontal
              keyExtractor={(f) => f.id}
              showsHorizontalScrollIndicator={false}
              snapToInterval={296}
              decelerationRate="fast"
              contentContainerStyle={{ paddingHorizontal: 24, gap: 16 }}
              renderItem={({ item }) => (
                <View style={{ width: 280 }}>
                  <MatchTile fixture={item} />
                </View>
              )}
            />
          </View>
        ) : null}

        {/* Secondary CTA */}
        <View className="px-6">
          <View className="rounded-2xl border border-border bg-surface p-6">
            <Text className="text-text text-xl font-bold">
              Football scheduling, simplified.
            </Text>
            <Text className="text-muted text-sm mt-2">
              Build a watchlist of teams and leagues. We'll keep you in the loop
              when matches are about to start and when they're done.
            </Text>
            <Pressable
              onPress={() => router.push('/login')}
              className="bg-accent rounded-full px-5 py-3 mt-5 self-start"
            >
              <Text className="text-bg font-semibold">Get started</Text>
            </Pressable>
          </View>
        </View>

        {/* Footer */}
        <View className="flex-row items-center justify-center gap-4 mt-10 px-6">
          <Text className="text-muted text-xs">Terms</Text>
          <Text className="text-muted text-xs">·</Text>
          <Text className="text-muted text-xs">Privacy</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
