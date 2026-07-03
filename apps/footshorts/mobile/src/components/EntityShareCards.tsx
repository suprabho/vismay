import { ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { parseRatio, useEntityShareCards } from '@/lib/useShareCards';

const CARD_HEIGHT = 288;

/** A horizontal strip of share cards tagged with one entity. Renders nothing
 *  when the entity has no shipped cards, so it's safe to drop on any page. */
export function EntityShareCards({
  entityId,
  title = 'Cards',
}: {
  entityId: string | undefined;
  title?: string;
}) {
  const { data } = useEntityShareCards(entityId);
  const items = data ?? [];
  if (items.length === 0) return null;
  // Owns its horizontal padding: the heading aligns with the screens' px-5
  // sections while the strip itself bleeds edge-to-edge.
  return (
    <View className="mt-6">
      <Text className="text-text text-base font-semibold mb-3 px-5">{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12, paddingHorizontal: 20, paddingBottom: 4 }}
      >
        {items.map((c) => (
          <View key={c.id} className="rounded-xl border border-border overflow-hidden">
            <Image
              source={{ uri: c.image_url }}
              accessibilityLabel={c.name}
              style={{ height: CARD_HEIGHT, width: CARD_HEIGHT * parseRatio(c.ratio) }}
              contentFit="contain"
              transition={150}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
