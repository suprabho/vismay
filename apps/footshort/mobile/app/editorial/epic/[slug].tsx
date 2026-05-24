import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { EditorialStorySummary } from '@shortfoot/shared'
import { useEditorialEpic } from '@/lib/useEditorialStories'

// Native twin of apps/footshort/web/app/editorial/epic/[slug]/EditorialEpic.tsx
// — a data-driven epic landing (header + grid of stories). Stories from the
// epic still open in the WebView reader (`/editorial/[slug]`); only the epic
// frame itself is native so it matches the rest of mobile's editorial chrome.

function slugHue(slug: string): number {
  let hash = 0
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) | 0
  return Math.abs(hash) % 360
}

function colorFor(slug: string): string {
  const hue = slugHue(slug)
  return `hsl(${hue}, 60%, 22%)`
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' })

function StoryTile({
  story,
  onPress,
}: {
  story: EditorialStorySummary
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: colorFor(story.slug), aspectRatio: 4 / 5 }}
      className="rounded-xl overflow-hidden border border-border flex-1"
    >
      <View className="flex-1 p-3 justify-between">
        <Text className="text-white/70 text-[9px] tracking-[2px] uppercase">
          {formatDate(story.publishedAt ?? story.createdAt)}
        </Text>
        <Text
          className="text-white text-sm"
          numberOfLines={4}
          style={{ fontFamily: SERIF }}
        >
          {story.title}
        </Text>
      </View>
    </Pressable>
  )
}

export default function EditorialEpicScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { data, isLoading, error } = useEditorialEpic(slug ?? null)

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header (sticky-equivalent: lives above the scroll) */}
      <View
        style={{ paddingTop: insets.top + 8 }}
        className="px-4 pb-3 flex-row items-center border-b border-border bg-bg/95"
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Back"
          hitSlop={12}
          className="w-10 h-10 rounded-full border border-border bg-surface/80 items-center justify-center"
        >
          <Text className="text-text text-xl">‹</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 32,
          paddingTop: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View className="py-24 items-center justify-center">
            <ActivityIndicator color="#00D26A" />
          </View>
        ) : null}

        {error ? (
          <View className="py-24 items-center px-6">
            <Text className="text-text text-lg mb-2">Could not load</Text>
            <Text className="text-muted text-sm text-center">
              {(error as Error).message}
            </Text>
          </View>
        ) : null}

        {!isLoading && !error && !data ? (
          <View className="py-24 items-center px-6">
            <Text className="text-text text-lg mb-2">Epic not found</Text>
            <Text className="text-muted text-sm text-center">
              It may not be available in Footshort.
            </Text>
          </View>
        ) : null}

        {data ? (
          <>
            <View
              style={{ backgroundColor: colorFor(data.slug) }}
              className="rounded-2xl overflow-hidden border border-border p-6 mb-8"
            >
              <Text
                className="text-white/80 text-[10px] uppercase"
                style={{ letterSpacing: 2 }}
              >
                Epic
              </Text>
              <Text
                className="text-white text-3xl mt-2"
                style={{ fontFamily: SERIF, lineHeight: 36 }}
              >
                {data.name}
              </Text>
              {data.description ? (
                <Text className="text-white/90 text-sm mt-3 leading-snug">
                  {data.description}
                </Text>
              ) : null}
            </View>

            {data.stories.length === 0 ? (
              <Text className="text-muted text-sm text-center py-12">
                No stories in this epic yet.
              </Text>
            ) : (
              <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
                {data.stories.map((s) => (
                  <View key={s.slug} className="w-1/2 p-1">
                    <StoryTile
                      story={s}
                      onPress={() => router.push(`/editorial/${s.slug}`)}
                    />
                  </View>
                ))}
              </View>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  )
}
