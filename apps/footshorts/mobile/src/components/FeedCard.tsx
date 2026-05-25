import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCompetitionPalette, darkenHex } from '@vismay/footshorts-viz/native';
import type { FeedCardEntity } from '@footshorts/shared/schemas';

const VISIBLE_TAGS = 3;

function entityColor(e: FeedCardEntity): string | undefined {
  if (e.primary_color) return e.primary_color;
  if (e.type === 'league') return getCompetitionPalette(e.slug);
  return undefined;
}

type PlaceholderEntity = { entity: FeedCardEntity; color: string };

function pickPlaceholderEntities(entities: FeedCardEntity[]): PlaceholderEntity[] {
  const picked: PlaceholderEntity[] = [];
  for (const e of entities) {
    const color = entityColor(e);
    if (!color) continue;
    if (picked.some((p) => p.color.toLowerCase() === color.toLowerCase())) continue;
    picked.push({ entity: e, color });
    if (picked.length === 2) break;
  }
  return picked;
}

type Props = {
  headline: string;
  summary: string | null;
  imageUrl: string | null;
  publisher: string;
  url: string;
  publishedAt: string;
  entities?: FeedCardEntity[];
};

function relativeTime(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function FeedCard({ headline, summary, imageUrl, publisher, url, publishedAt, entities }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const tags = entities ?? [];
  const visibleTags = tagsExpanded ? tags : tags.slice(0, VISIBLE_TAGS);
  const hiddenCount = tags.length - visibleTags.length;

  return (
    <View className="flex-1 bg-bg">
      {/* Image: takes up top ~40% so the text block below has room for a 60-word summary */}
      <View style={{ flex: 0.4 }} className="bg-surface">
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <EntityPlaceholder entities={entities ?? []} />
        )}
      </View>

      <View className="flex-1 px-6 pt-5" style={{ paddingBottom: insets.bottom + 16 }}>
        <View className="flex-row items-center mb-3">
          <View className="bg-surface border border-border rounded-full px-3 py-1">
            <Text className="text-text text-xs font-medium">{publisher}</Text>
          </View>
          <Text className="text-muted text-xs ml-2">{relativeTime(publishedAt)}</Text>
        </View>

        <Text className="text-text text-xl font-bold leading-tight mb-3">{headline}</Text>

        {summary ? (
          <Text className="text-text text-[15px] leading-[22px]">{summary}</Text>
        ) : (
          <Text className="text-muted text-sm italic">Summary unavailable.</Text>
        )}

        {tags.length > 0 ? (
          <View className="mt-3 flex-row flex-wrap items-center gap-1.5">
            {visibleTags.map((e) => (
              <View
                key={e.id}
                className="flex-row items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1"
              >
                {e.crest_url ? (
                  <Image
                    source={{ uri: e.crest_url }}
                    style={{ width: 16, height: 16 }}
                    contentFit="contain"
                  />
                ) : null}
                <Text className="text-text text-xs font-medium">{e.name}</Text>
              </View>
            ))}
            {hiddenCount > 0 ? (
              <Pressable
                onPress={() => setTagsExpanded(true)}
                className="rounded-full border border-border bg-surface px-2.5 py-1"
                hitSlop={8}
              >
                <Text className="text-muted text-xs font-medium">+{hiddenCount} more</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Pressable
          onPress={() => router.push({ pathname: '/web', params: { url, publisher } })}
          className="mt-auto pt-4 self-start"
          hitSlop={8}
        >
          <Text className="text-accent text-sm font-medium">Read at source →</Text>
        </Pressable>
      </View>
    </View>
  );
}

// A drop shadow that follows the crest's silhouette: a darkened, blurred copy
// of the crest offset down behind it. RN's box-shadow props shadow the image's
// rectangular bounds instead, which reads as a floating panel.
function Crest({ uri, style }: { uri: string; style: ViewStyle }) {
  return (
    <View style={[style, { alignItems: 'center', justifyContent: 'center' }]}>
      <Image
        source={{ uri }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: 0.45,
          transform: [{ translateY: 8 }],
        }}
        contentFit="contain"
        tintColor="#000"
        blurRadius={8}
      />
      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
    </View>
  );
}

function EntityPlaceholder({ entities }: { entities: FeedCardEntity[] }) {
  const picked = pickPlaceholderEntities(entities);

  if (picked.length === 0) {
    // No entity has a usable color (e.g. team with no primary_color yet), but
    // we may still have a crest to surface — fall back to a neutral tile.
    const withCrest = entities.find((e) => e.crest_url);
    if (withCrest) {
      return (
        <View className="flex-1 items-center justify-center bg-surface">
          <Crest uri={withCrest.crest_url!} style={{ height: '50%', width: '70%' }} />
        </View>
      );
    }
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-muted text-sm">No image</Text>
      </View>
    );
  }

  if (picked.length === 1) {
    const a = picked[0]!;
    return (
      <LinearGradient
        colors={[a.color, darkenHex(a.color, 0.4)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        {a.entity.crest_url ? (
          <Crest uri={a.entity.crest_url} style={{ height: '55%', width: '70%' }} />
        ) : null}
      </LinearGradient>
    );
  }

  const a = picked[0]!;
  const b = picked[1]!;
  return (
    <LinearGradient
      colors={[a.color, a.color, b.color, b.color]}
      locations={[0, 0.5, 0.5, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: '12%',
      }}
    >
      {a.entity.crest_url ? (
        <Crest uri={a.entity.crest_url} style={{ height: '40%', width: '30%' }} />
      ) : (
        <View />
      )}
      {b.entity.crest_url ? (
        <Crest uri={b.entity.crest_url} style={{ height: '50%', width: '30%' }} />
      ) : (
        <View />
      )}
    </LinearGradient>
  );
}
