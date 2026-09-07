import { useRef, useState } from 'react';
import { FlatList, useWindowDimensions, View, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FeedCard as FeedCardType } from '@footshorts/shared/schemas';
import { trackArticleSeen } from '@/lib/analytics';
import type { ShareCardItem } from '@/lib/useShareCards';
import { FeedCard } from './FeedCard';
import { ShareCardFeedItem } from './ShareCardFeedItem';

export type DiscoverRow =
  | { kind: 'article'; published_at: string; article: FeedCardType }
  | { kind: 'card'; published_at: string; card: ShareCardItem };

function rowKey(row: DiscoverRow): string {
  return row.kind === 'article' ? `a:${row.article.article_id}` : `c:${row.card.id}`;
}

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

  // The row currently filling the viewport, so only its video plays — the list
  // keeps a window of cards mounted, and every one of them would otherwise be
  // streaming. Tracked with a zero-dwell config, separate from the 1s "seen"
  // one, so playback starts on the first paint of a card.
  const [activeKey, setActiveKey] = useState<string | null>(null);

  // FlatList requires stable refs for viewability config + callback.
  const onItemSeenRef = useRef(onItemSeen);
  onItemSeenRef.current = onItemSeen;

  const viewabilityPairs = useRef([
    {
      viewabilityConfig: { itemVisiblePercentThreshold: 50, minimumViewTime: 0 },
      onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken[] }) => {
        const row = viewableItems[0]?.item as DiscoverRow | undefined;
        setActiveKey(row ? rowKey(row) : null);
      },
    },
    {
      viewabilityConfig: { itemVisiblePercentThreshold: 80, minimumViewTime: 1000 },
      onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken[] }) => {
        const cb = onItemSeenRef.current;
        for (const v of viewableItems) {
          const row = v.item as DiscoverRow | undefined;
          // Only article rows feed the persisted seen-set; swiping past a
          // share card in Discover never marks it seen (web parity).
          if (row?.kind === 'article') {
            cb?.(row.article.article_id);
            trackArticleSeen(row.article.article_id, row.article.publisher);
          }
        }
      },
    },
  ]);

  return (
    <FlatList
      data={rows}
      keyExtractor={rowKey}
      extraData={activeKey}
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
                active={rowKey(item) === activeKey}
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
