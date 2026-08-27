import { useMemo } from 'react';
import { FlatList, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { parseRatio, useEntityShareCards } from '@/lib/useShareCards';

const CARD_HEIGHT = 288;

/** A horizontal strip of share cards tagged with one entity, paged latest-first
 *  (the next page loads as the strip nears its end). Renders nothing when the
 *  entity has no shipped cards, so it's safe to drop on any page. */
export function EntityShareCards({
  entityId,
  title = 'Cards',
}: {
  entityId: string | undefined;
  title?: string;
}) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useEntityShareCards(entityId);
  const items = useMemo(() => (data?.pages ?? []).flat(), [data]);
  if (items.length === 0) return null;
  // Owns its horizontal padding: the heading aligns with the screens' px-5
  // sections while the strip itself bleeds edge-to-edge.
  return (
    <View className="mt-6">
      <Text className="text-text text-base font-semibold mb-3 px-5">{title}</Text>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(c) => c.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12, paddingHorizontal: 20, paddingBottom: 4 }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        renderItem={({ item: c }) => (
          <View className="rounded-xl border border-border overflow-hidden">
            <Image
              source={{ uri: c.image_url }}
              accessibilityLabel={c.name}
              style={{ height: CARD_HEIGHT, width: CARD_HEIGHT * parseRatio(c.ratio) }}
              contentFit="contain"
              transition={150}
            />
          </View>
        )}
      />
    </View>
  );
}
