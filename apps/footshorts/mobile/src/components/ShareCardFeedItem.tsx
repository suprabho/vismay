import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FeedCardEntity } from '@footshorts/shared/schemas';
import { parseRatio } from '@/lib/useShareCards';

type Props = {
  imageUrl: string;
  name: string;
  ratio: string | null;
  entities?: FeedCardEntity[];
};

/** A shipped share card as a full-bleed feed item: the rendered PNG centered on
 *  the surface, with its entity tags as links underneath. The page frame
 *  (fixed height, rounded surface) is supplied by CardSwiper's wrapper. */
export function ShareCardFeedItem({ imageUrl, name, ratio, entities }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  const tags = entities ?? [];
  const ar = parseRatio(ratio);
  const width = box ? Math.min(box.w, box.h * ar) : 0;
  const height = width / ar;

  const openEntity = (e: FeedCardEntity) => {
    if (e.type === 'league') router.push(`/league/${e.slug}`);
    else if (e.type === 'team') router.push(`/team/${e.slug}`);
    else router.push(`/player/${e.slug}`);
  };

  return (
    <View className="flex-1 bg-bg">
      <View className="flex-1 p-4">
        <View
          className="flex-1 items-center justify-center"
          onLayout={(e) =>
            setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
          }
        >
          {box ? (
            <View
              style={{
                width,
                height,
                borderRadius: 16,
                shadowColor: '#000',
                shadowOpacity: 0.35,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 8 },
                elevation: 8,
              }}
            >
              <Image
                source={{ uri: imageUrl }}
                accessibilityLabel={name}
                style={{ width: '100%', height: '100%', borderRadius: 16 }}
                contentFit="cover"
                transition={150}
              />
            </View>
          ) : null}
        </View>
      </View>

      {tags.length > 0 ? (
        <View
          className="flex-row flex-wrap items-center gap-1.5 px-4 pt-1"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          {tags.map((e) => (
            <Pressable
              key={e.id}
              onPress={() => openEntity(e)}
              className="flex-row items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1"
              hitSlop={4}
            >
              {e.crest_url ? (
                <Image
                  source={{ uri: e.crest_url }}
                  style={{ width: 16, height: 16 }}
                  contentFit="contain"
                />
              ) : null}
              <Text className="text-text text-xs font-medium">{e.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
