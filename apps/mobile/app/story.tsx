import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useFollowedStories, type StoryGroup } from '@/lib/useFollowedStories';
import { useSeenArticles } from '@/lib/useSeenArticles';

const STORY_DURATION_MS = 6000;

function relativeTime(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function StoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { start } = useLocalSearchParams<{ start?: string }>();
  const { data: groups, isLoading } = useFollowedStories();
  const { seen, markSeen } = useSeenArticles();

  const initial = Math.max(0, Math.min(Number(start) || 0, (groups?.length ?? 1) - 1));

  // Snapshot of the seen set at the moment we enter an entity. Items marked
  // seen *during* this session don't get auto-skipped. If every item in a
  // group was already seen on entry, we clear the snapshot to play linearly
  // (the user explicitly tapped to replay).
  const snapshotRef = useRef<Set<string>>(new Set());
  const snapshotEntityRef = useRef<number>(-1);

  const [entityIdx, setEntityIdx] = useState(initial);
  const [storyIdx, setStoryIdx] = useState<number>(() => {
    const g = groups?.[initial];
    if (!g) return 0;
    const snap = new Set(seen);
    const first = g.items.findIndex((it) => !snap.has(it.article_id));
    snapshotRef.current = first < 0 ? new Set() : snap;
    snapshotEntityRef.current = initial;
    return first >= 0 ? first : 0;
  });
  const progress = useSharedValue(0);

  const group = groups?.[entityIdx];
  const story = group?.items[storyIdx];

  // Re-snapshot + jump to first unseen whenever we enter a new entity
  // (also handles the cold-load case where `groups` arrives after mount).
  useEffect(() => {
    if (!groups) return;
    const g = groups[entityIdx];
    if (!g) return;
    if (snapshotEntityRef.current === entityIdx) return;
    snapshotEntityRef.current = entityIdx;
    const snap = new Set(seen);
    const first = g.items.findIndex((it) => !snap.has(it.article_id));
    snapshotRef.current = first < 0 ? new Set() : snap;
    setStoryIdx(first >= 0 ? first : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityIdx, groups]);

  const close = () => router.back();

  const nextUnseenIdx = (g: StoryGroup, from: number): number => {
    const snap = snapshotRef.current;
    for (let i = from + 1; i < g.items.length; i++) {
      const it = g.items[i];
      if (it && !snap.has(it.article_id)) return i;
    }
    return -1;
  };

  const prevUnseenIdx = (g: StoryGroup, from: number): number => {
    const snap = snapshotRef.current;
    for (let i = from - 1; i >= 0; i--) {
      const it = g.items[i];
      if (it && !snap.has(it.article_id)) return i;
    }
    return -1;
  };

  const goNext = () => {
    if (!groups) return;
    const g = groups[entityIdx];
    if (!g) return close();
    const next = nextUnseenIdx(g, storyIdx);
    if (next >= 0) {
      setStoryIdx(next);
    } else if (entityIdx + 1 < groups.length) {
      setEntityIdx(entityIdx + 1);
    } else {
      close();
    }
  };

  const goPrev = () => {
    if (!groups) return;
    const g = groups[entityIdx];
    if (!g) return;
    const prev = prevUnseenIdx(g, storyIdx);
    if (prev >= 0) {
      setStoryIdx(prev);
      return;
    }
    if (entityIdx > 0) {
      const prevI = entityIdx - 1;
      const prevGroup = groups[prevI];
      if (!prevGroup) return;
      // Backward nav = user wants to review; play prev group linearly.
      snapshotEntityRef.current = prevI;
      snapshotRef.current = new Set();
      setEntityIdx(prevI);
      setStoryIdx(Math.max(0, prevGroup.items.length - 1));
    }
  };

  useEffect(() => {
    if (!story) return;
    markSeen(story.article_id);
    progress.value = 0;
    progress.value = withTiming(1, { duration: STORY_DURATION_MS }, (finished) => {
      if (finished) runOnJS(goNext)();
    });
    return () => cancelAnimation(progress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityIdx, storyIdx, story?.article_id]);

  // Press-and-hold to pause the countdown. Taps shorter than HOLD_THRESHOLD_MS
  // still navigate; anything longer is treated as a hold and suppresses nav.
  const HOLD_THRESHOLD_MS = 180;
  const pressStartRef = useRef<number>(0);

  const pauseProgress = () => {
    pressStartRef.current = Date.now();
    cancelAnimation(progress);
  };

  const resumeProgress = (onTap: () => void) => {
    const held = Date.now() - pressStartRef.current;
    if (held < HOLD_THRESHOLD_MS) {
      onTap();
      return;
    }
    const remaining = Math.max(0, STORY_DURATION_MS * (1 - progress.value));
    progress.value = withTiming(1, { duration: remaining }, (finished) => {
      if (finished) runOnJS(goNext)();
    });
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: '#000' }}>
        <ActivityIndicator color="#00D26A" />
      </View>
    );
  }

  if (!groups || groups.length === 0 || !group || !story) {
    return (
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: '#000' }}>
        <Text className="text-text text-lg mb-2">No stories</Text>
        <Pressable onPress={close} className="mt-4">
          <Text className="text-accent">Close</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex flex-col flex-1 justify-between bg-black">
      {story.image_url ? (
        <Image
          source={{ uri: story.image_url }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          contentFit="cover"
          transition={150}
        />
      ) : null}
      <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />

      <Pressable
        onPressIn={pauseProgress}
        onPressOut={() => resumeProgress(goPrev)}
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '33%' }}
      />
      <Pressable
        onPressIn={pauseProgress}
        onPressOut={() => resumeProgress(goNext)}
        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '67%' }}
      />

      <View className="flex flex-col" style={{ paddingTop: insets.top + 8, paddingHorizontal: 8 }}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {group.items.map((_, i) => (
            <ProgressBar key={i} state={i < storyIdx ? 'done' : i === storyIdx ? 'active' : 'pending'} progress={progress} />
          ))}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingHorizontal: 4 }}>
          <View className="w-7 h-7 rounded-full overflow-hiddle bg-white">
            {group.entity.crest_url ? (
              <Image
                source={{ uri: group.entity.crest_url }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            ) : null}
          </View>
          <Text className="text-text text-sm font-semibold ml-2" numberOfLines={1} style={{ flex: 1 }}>
            {group.entity.name}
          </Text>
          <Text className="text-text/70 text-xs ml-2">{relativeTime(story.published_at)}</Text>
          <Pressable onPress={close} hitSlop={12} className="z-10 ml-3">
            <Text className="text-text text-xl">✕</Text>
          </Pressable>
        </View>
      </View>

      <View className="flex m-2 rounded-xl flex-end px-4 pt-8 pb-10 mb-safe-offset-1 overflow-hidden">
        <BlurView
          intensity={50}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
        <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(22,22,29,0.35)' }} />
        <View className="bg-surface/80 self-start rounded-full px-3 py-1 mb-3 border border-border">
          <Text className="text-text text-xs font-medium">{story.publisher}</Text>
        </View>
        <Text className="text-text text-2xl font-bold leading-tight mb-3">{story.headline}</Text>
        {story.summary ? (
          <Text className="text-white text-[15px] leading-[22px]" numberOfLines={6}>
            {story.summary}
          </Text>
        ) : null}
        <Pressable
          onPress={() => router.push({ pathname: '/web', params: { url: story.url, publisher: story.publisher } })}
          className="mt-4 self-start"
          hitSlop={8}
        >
          <Text className="text-accent text-sm font-medium">Read at source →</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ProgressBar({
  state,
  progress,
}: {
  state: 'done' | 'active' | 'pending';
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleX: state === 'active' ? progress.value : state === 'done' ? 1 : 0 }],
  }));
  const baseFill = useMemo(
    () => ({
      flex: 1,
      height: 3,
      backgroundColor: 'rgba(255,255,255,0.3)' as const,
      borderRadius: 2,
      overflow: 'hidden' as const,
    }),
    []
  );
  return (
    <View style={baseFill}>
      <Animated.View
        style={[
          { height: '100%', width: '100%', backgroundColor: '#fff', transformOrigin: 'left' as const },
          style,
        ]}
      />
    </View>
  );
}
