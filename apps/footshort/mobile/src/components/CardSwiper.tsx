import { useRef } from 'react';
import { FlatList, useWindowDimensions, View, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FeedCard as FeedCardType } from '@shortfoot/shared/schemas';
import { FeedCard } from './FeedCard';

type Props = {
  items: FeedCardType[];
  onEndReached?: () => void;
  ListFooterComponent?: React.ReactElement;
  topGap?: number;
  onItemSeen?: (articleId: string) => void;
};

export function CardSwiper({ items, onEndReached, ListFooterComponent, topGap: topGapOverride, onItemSeen }: Props) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cardHeight = height;
  const topGap = topGapOverride ?? insets.top + 56;

  // FlatList requires stable refs for viewability config + callback.
  const onItemSeenRef = useRef(onItemSeen);
  onItemSeenRef.current = onItemSeen;

  const viewabilityPairs = useRef([
    {
      viewabilityConfig: { itemVisiblePercentThreshold: 80, minimumViewTime: 1000 },
      onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken[] }) => {
        const cb = onItemSeenRef.current;
        if (!cb) return;
        for (const v of viewableItems) {
          const id = (v.item as FeedCardType | undefined)?.article_id;
          if (id) cb(id);
        }
      },
    },
  ]);

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.article_id}
      renderItem={({ item }) => (
        <View style={{ height: cardHeight, paddingTop: topGap, paddingHorizontal: 12 }}>
          <View className="flex-1 rounded-t-3xl overflow-hidden bg-surface border border-b-0 border-border">
            <FeedCard
              headline={item.headline}
              summary={item.summary}
              imageUrl={item.image_url}
              publisher={item.publisher}
              url={item.url}
              publishedAt={item.published_at}
            />
          </View>
        </View>
      )}
      pagingEnabled
      snapToInterval={cardHeight}
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListFooterComponent={ListFooterComponent}
      viewabilityConfigCallbackPairs={viewabilityPairs.current}
    />
  );
}
