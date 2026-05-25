import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { EditorialEpicSummary, EditorialStorySummary } from '@footshorts/shared'
import {
  useEditorialEpics,
  useEditorialStories,
} from '@/lib/useEditorialStories'

// Hash slug → HSL hue so each story/epic gets a deterministic accent colour.
// Mirrors the web magazine's approach. Cover images live in story frontmatter
// and aren't fetched here yet.
function slugHue(slug: string): number {
  let hash = 0
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) | 0
  return Math.abs(hash) % 360
}

function colorFor(slug: string): string {
  const hue = slugHue(slug)
  // hsl(...) is a valid CSS color literal that React Native accepts.
  return `hsl(${hue}, 60%, 22%)`
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// System serif so the editorial magazine has the same printed/longform feel
// as the web app's `font-serif` cards without bundling a custom font.
const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' })

function HeroCard({ story, onPress }: { story: EditorialStorySummary; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: colorFor(story.slug), aspectRatio: 5 / 4 }}
      className="rounded-2xl overflow-hidden border border-border"
    >
      <View className="flex-1 p-5 justify-between">
        <Text className="text-white/80 text-[10px] tracking-[2px] uppercase">
          Editorial · {formatDate(story.publishedAt ?? story.createdAt)}
        </Text>
        <View>
          <Text
            className="text-white text-2xl"
            numberOfLines={3}
            style={{ lineHeight: 30, fontFamily: SERIF }}
          >
            {story.title}
          </Text>
          <Text className="text-white/80 text-sm mt-2">Read story →</Text>
        </View>
      </View>
    </Pressable>
  )
}

function GridCard({ story, onPress }: { story: EditorialStorySummary; onPress: () => void }) {
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

function EpicCard({
  epic,
  width,
  onPress,
}: {
  epic: EditorialEpicSummary
  width: number
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width,
        aspectRatio: 16 / 9,
        backgroundColor: colorFor(epic.slug),
      }}
      className="rounded-xl overflow-hidden border border-border"
    >
      <View className="flex-1 p-4 justify-between">
        <Text className="text-white/80 text-[10px] tracking-[2px] uppercase">Epic</Text>
        <View>
          <Text
            className="text-white text-lg"
            numberOfLines={1}
            style={{ fontFamily: SERIF }}
          >
            {epic.name}
          </Text>
          {epic.description ? (
            <Text className="text-white/80 text-xs mt-1" numberOfLines={2}>
              {epic.description}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

interface Props {
  topGap: number
  // Magazine renders inside the feed tab — we need the horizontal frame so
  // EpicCards can be sized to 78% of the visible content width (matching web).
  contentWidth?: number
}

export function EditorialMagazine({ topGap, contentWidth }: Props) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { data: stories, isLoading, error } = useEditorialStories({ limit: 24 })
  // Epics load independently of stories — they're a separate strip and
  // shouldn't block the magazine from rendering when the stories query
  // returns first.
  const { data: epics } = useEditorialEpics()

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="#00D26A" />
      </View>
    )
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-text text-lg mb-2">Could not load</Text>
        <Text className="text-muted text-sm text-center">{(error as Error).message}</Text>
      </View>
    )
  }

  const safeStories = stories ?? []
  const safeEpics = epics ?? []

  if (safeStories.length === 0 && safeEpics.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-text text-lg mb-2">No stories yet</Text>
        <Text className="text-muted text-sm text-center">
          Editorial pieces from vizmaya.fyi will appear here as they ship.
        </Text>
      </View>
    )
  }

  const hero = safeStories[0]
  const rest = safeStories.slice(1)

  // Mirror web's 78%-of-frame, max 320 sizing. When the parent doesn't pass
  // contentWidth we fall back to 280 so the strip still renders sensibly.
  const epicWidth = Math.min(320, Math.round((contentWidth ?? 360) * 0.78))

  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: topGap,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 16,
      }}
      showsVerticalScrollIndicator={false}
    >
      {safeEpics.length > 0 ? (
        <View className="mb-4">
          <Text className="text-muted text-[10px] uppercase mb-2" style={{ letterSpacing: 2 }}>
            Epics
          </Text>
          <FlatList
            data={safeEpics}
            horizontal
            keyExtractor={(e) => e.slug}
            showsHorizontalScrollIndicator={false}
            snapToInterval={epicWidth + 12}
            decelerationRate="fast"
            // Negate the magazine's px-4 so the strip can run edge-to-edge —
            // matches web's `-mx-4` trick on the snap container.
            style={{ marginHorizontal: -16 }}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            renderItem={({ item }) => (
              <EpicCard
                epic={item}
                width={epicWidth}
                onPress={() => router.push(`/editorial/epic/${item.slug}`)}
              />
            )}
          />
        </View>
      ) : null}

      {hero ? (
        <HeroCard story={hero} onPress={() => router.push(`/editorial/${hero.slug}`)} />
      ) : null}
      {rest.length > 0 && (
        <View className="mt-3 flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
          {rest.map((s) => (
            <View key={s.slug} className="w-1/2 p-1">
              <GridCard story={s} onPress={() => router.push(`/editorial/${s.slug}`)} />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  )
}
