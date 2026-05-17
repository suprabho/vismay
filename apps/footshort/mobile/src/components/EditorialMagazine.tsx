import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { EditorialStorySummary } from '@shortfoot/shared'
import { useEditorialStories } from '@/lib/useEditorialStories'

// Mirror of the web magazine's accent logic. Prefer the story's frontmatter
// theme.colors.accent hue; fall back to a hashed slug hue. Cover images live
// in story frontmatter and aren't fetched here yet — accent colour stands in.
function slugHue(slug: string): number {
  let hash = 0
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) | 0
  return Math.abs(hash) % 360
}

function hexToHue(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return null
  const r = parseInt(m[1].slice(0, 2), 16) / 255
  const g = parseInt(m[1].slice(2, 4), 16) / 255
  const b = parseInt(m[1].slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return 0
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h = Math.round(h * 60)
  if (h < 0) h += 360
  return h
}

function colorFor(slug: string, themeAccent: string | null): string {
  const hue = (themeAccent ? hexToHue(themeAccent) : null) ?? slugHue(slug)
  // hsl(...) is a valid CSS color literal that React Native accepts.
  return `hsl(${hue}, 60%, 22%)`
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function HeroCard({ story, onPress }: { story: EditorialStorySummary; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: colorFor(story.slug, story.themeAccent), aspectRatio: 5 / 4 }}
      className="rounded-2xl overflow-hidden border border-border"
    >
      <View className="flex-1 p-5 justify-between">
        <Text className="text-white/80 text-[10px] tracking-[2px] uppercase">
          Editorial · {formatDate(story.publishedAt ?? story.createdAt)}
          {story.byline ? ` · ${story.byline}` : ''}
        </Text>
        <View>
          <Text
            className="text-white text-2xl font-bold"
            numberOfLines={3}
            style={{ lineHeight: 30 }}
          >
            {story.title}
          </Text>
          {story.subtitle && (
            <Text
              className="text-white/80 text-sm mt-2"
              numberOfLines={3}
              style={{ lineHeight: 20 }}
            >
              {story.subtitle}
            </Text>
          )}
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
      style={{ backgroundColor: colorFor(story.slug, story.themeAccent), aspectRatio: 4 / 5 }}
      className="rounded-xl overflow-hidden border border-border flex-1"
    >
      <View className="flex-1 p-3 justify-between">
        <Text className="text-white/70 text-[9px] tracking-[2px] uppercase">
          {formatDate(story.publishedAt ?? story.createdAt)}
        </Text>
        <View>
          <Text className="text-white text-sm font-semibold" numberOfLines={3}>
            {story.title}
          </Text>
          {story.subtitle && (
            <Text className="text-white/70 text-xs mt-1" numberOfLines={2}>
              {story.subtitle}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  )
}

interface Props {
  topGap: number
}

export function EditorialMagazine({ topGap }: Props) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { data, isLoading, error } = useEditorialStories({ limit: 24 })

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

  const stories = data ?? []

  if (stories.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-text text-lg mb-2">No stories yet</Text>
        <Text className="text-muted text-sm text-center">
          Editorial pieces from vizmaya.fyi will appear here as they ship.
        </Text>
      </View>
    )
  }

  const hero = stories[0]
  const rest = stories.slice(1)
  if (!hero) return null

  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: topGap,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 16,
      }}
      showsVerticalScrollIndicator={false}
    >
      <HeroCard story={hero} onPress={() => router.push(`/editorial/${hero.slug}`)} />
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
