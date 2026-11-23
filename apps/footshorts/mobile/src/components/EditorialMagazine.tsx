import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useCallback } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { storyUrl } from '@vismay/story-embed/url'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { EditorialEpicSummary, EditorialStorySummary } from '@footshorts/shared'
import {
  useEditorialEpics,
  useEditorialStories,
} from '@/lib/useEditorialStories'
import { useHtmlStories, type HtmlStoryCard } from '@/lib/useHtmlStories'
import { htmlStoryPreviewUrl } from '@/lib/links'
import { LivePreview, checkPreviewVisibility, setPreviewsActive } from '@/components/LivePreview'

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

/**
 * One magazine card, whichever table it came from: a viz-engine editorial story
 * (`/editorial/<slug>`) or an agent-authored HTML story (`/editorial/html/<slug>`,
 * footshorts.com/s/<slug> in a WebView). Mirrors the web magazine.
 */
interface MagazineCard {
  key: string
  href: string
  title: string
  /** Sort key and the card's date: published_at, else created/updated. */
  date: string
  /**
   * The story itself, chrome-less, as the card previews it live (LivePreview):
   * the render service's embed for an editorial story, the HTML story's own
   * `?preview=1` (no site chrome, no format controls, no Listen player).
   */
  previewUri: string
  /** The page's declared background when it has one; else the slug colour. */
  backgroundColor: string
}

function editorialCard(story: EditorialStorySummary): MagazineCard {
  return {
    key: `editorial:${story.slug}`,
    href: `/editorial/${story.slug}`,
    title: story.title,
    date: story.publishedAt ?? story.createdAt,
    previewUri: storyUrl(story.slug),
    backgroundColor: colorFor(story.slug),
  }
}

/**
 * True for a hex colour dark enough to carry the cards' white text. Story
 * palettes are often light (cream paper); those cards keep the slug colour.
 */
function isDark(hex: string | undefined): hex is string {
  if (!hex || !/^#?[0-9a-f]{6}$/i.test(hex)) return false
  const n = parseInt(hex.slice(-6), 16)
  const lum = (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
  return lum < 0.4
}

/** An HTML story wears its own palette (its `vizmaya:theme` meta) when it declared a dark one. */
function htmlStoryCard(story: HtmlStoryCard): MagazineCard {
  const bg = story.theme?.surface ?? story.theme?.background
  return {
    key: `html:${story.slug}`,
    href: `/editorial/html/${story.slug}`,
    title: story.title,
    date: story.publishedAt ?? story.updatedAt,
    previewUri: htmlStoryPreviewUrl(story.slug),
    backgroundColor: isDark(bg) ? bg : colorFor(story.slug),
  }
}

// System serif so the editorial magazine has the same printed/longform feel
// as the web app's `font-serif` cards without bundling a custom font.
const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' })

/**
 * The card's picture: the story itself, running live (only while on screen;
 * see LivePreview), above the caption and fading into the card's colour, as
 * the vizmaya.fyi home wall shows its stories. Until it loads the colour shows.
 */
function CardPreview({ card }: { card: MagazineCard }) {
  return (
    <View className="flex-1 overflow-hidden">
      <LivePreview uri={card.previewUri} />
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', card.backgroundColor]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 32 }}
      />
    </View>
  )
}

function HeroCard({ card, onPress }: { card: MagazineCard; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: card.backgroundColor, aspectRatio: 4 / 5 }}
      className="rounded-2xl overflow-hidden border border-border"
    >
      <CardPreview card={card} />
      <View className="px-5 pb-5 pt-2">
        <Text className="text-white/80 text-[10px] tracking-[2px] uppercase" numberOfLines={1}>
          Editorial · {formatDate(card.date)}
        </Text>
        <Text
          className="text-white text-2xl mt-2"
          numberOfLines={3}
          style={{ lineHeight: 30, fontFamily: SERIF }}
        >
          {card.title}
        </Text>
        <Text className="text-white/80 text-sm mt-2">Read story →</Text>
      </View>
    </Pressable>
  )
}

function GridCard({ card, onPress }: { card: MagazineCard; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: card.backgroundColor, aspectRatio: 3 / 4 }}
      className="rounded-xl overflow-hidden border border-border flex-1"
    >
      <CardPreview card={card} />
      <View className="px-3 pb-3 pt-1">
        <Text className="text-white/70 text-[9px] tracking-[2px] uppercase" numberOfLines={1}>
          {formatDate(card.date)}
        </Text>
        <Text
          className="text-white text-sm mt-1"
          numberOfLines={3}
          style={{ fontFamily: SERIF }}
        >
          {card.title}
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
  // Agent-authored HTML stories (footshorts.com/s/<slug>) sit in the same
  // magazine, newest first alongside the editorial stories. Also independent:
  // a slow or failed read never blocks the rest.
  const { data: htmlStories } = useHtmlStories()

  // Live previews run only while the magazine is the screen in front: a story
  // reader pushed over it pauses them, coming back resumes the ones on screen.
  useFocusEffect(
    useCallback(() => {
      setPreviewsActive(true)
      return () => setPreviewsActive(false)
    }, [])
  )

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

  const cards: MagazineCard[] = [
    ...(stories ?? []).map(editorialCard),
    ...(htmlStories ?? []).map(htmlStoryCard),
  ].sort((a, b) => b.date.localeCompare(a.date))
  const safeEpics = epics ?? []

  if (cards.length === 0 && safeEpics.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-text text-lg mb-2">No stories yet</Text>
        <Text className="text-muted text-sm text-center">
          Editorial pieces from vizmaya.fyi will appear here as they ship.
        </Text>
      </View>
    )
  }

  const [hero, ...rest] = cards

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
      onScroll={checkPreviewVisibility}
      scrollEventThrottle={200}
      onMomentumScrollEnd={checkPreviewVisibility}
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
        <HeroCard card={hero} onPress={() => router.push(hero.href)} />
      ) : null}
      {rest.length > 0 && (
        <View className="mt-3 flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
          {rest.map((c) => (
            <View key={c.key} className="w-1/2 p-1">
              <GridCard
                card={c}
                onPress={() => router.push(c.href)}
              />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  )
}
