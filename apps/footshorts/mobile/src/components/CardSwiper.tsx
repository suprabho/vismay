import { useRef } from 'react';
import { FlatList, useWindowDimensions, View, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FeedCard as FeedCardType } from '@footshorts/shared/schemas';
import type { ShareCardItem } from '@/lib/useShareCards';
import { FeedCard } from './FeedCard';
import { ShareCardFeedItem } from './ShareCardFeedItem';

export type DiscoverRow =
  | { kind: 'article'; published_at: string; article: FeedCardType }
  | { kind: 'card'; published_at: string; card: ShareCardItem };

type Props = {
  rows: DiscoverRow[];
  onEndReached?: () => void;
  ListFooterComponent?: React.ReactElement;
  topGap?: number;
  onItemSeen?: (articleId: string) => void;
};

export function CardSwiper({ rows, onEndReached, ListFooterComponent, topGap: topGapOverride, onItemSeen }: Props) {
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
          const row = v.item as DiscoverRow | undefined;
          // Only article rows feed the persisted seen-set; swiping past a
          // share card in Discover never marks it seen (web parity).
          if (row?.kind === 'article') cb(row.article.article_id);
        }
      },
    },
  ]);

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) =>
        row.kind === 'article' ? `a:${row.article.article_id}` : `c:${row.card.id}`
      }
      renderItem={({ item }) => (
        <View style={{ height: cardHeight, paddingTop: topGap, paddingHorizontal: 12 }}>
          <View className="flex-1 rounded-t-3xl overflow-hidden bg-surface border border-b-0 border-border">
            {item.kind === 'article' ? (
              <FeedCard
                headline={item.article.headline}
                summary={item.article.summary}
                imageUrl={item.article.image_url}
                publisher={item.article.publisher}
                url={item.article.url}
                publishedAt={item.article.published_at}
                entities={item.article.entities}
              />
            ) : (
              <ShareCardFeedItem
                imageUrl={item.card.image_url}
                name={item.card.name}
                ratio={item.card.ratio}
                entities={item.card.entities}
              />
            )}
          </View>
        </View>
      )}
      pagingEnabled
      snapToInterval={cardHeight}
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      getItemLayout={(_, index) => ({ length: cardHeight, offset: cardHeight * index, index })}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListFooterComponent={ListFooterComponent}
      viewabilityConfigCallbackPairs={viewabilityPairs.current}
    />
  );
}
