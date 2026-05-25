import { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import type { StoryGroup } from '@/lib/useFollowedStories';

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

const RING_UNREAD = '#00D26A';
const RING_SEEN = '#2a2a30';

type Props = {
  groups: StoryGroup[];
  seen?: ReadonlySet<string>;
};

export function StoryRings({ groups, seen }: Props) {
  const router = useRouter();

  // Push fully-read groups to the end so unread stays up front; preserve
  // relative order within each bucket. Also map each group -> its original
  // index so navigation into the story viewer still opens the right entity.
  const ordered = useMemo(() => {
    const withIdx = groups.map((g, originalIndex) => {
      const allSeen = seen ? g.items.every((it) => seen.has(it.article_id)) : false;
      return { g, originalIndex, allSeen };
    });
    return [
      ...withIdx.filter((x) => !x.allSeen),
      ...withIdx.filter((x) => x.allSeen),
    ];
  }, [groups, seen]);

  return (
    <FlatList
      data={ordered}
      horizontal
      keyExtractor={({ g }) => g.entity.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 4, gap: 14 }}
      renderItem={({ item: { g, originalIndex, allSeen } }) => (
        <Pressable
          onPress={() => router.push({ pathname: '/story', params: { start: String(originalIndex) } })}
          hitSlop={4}
        >
          <View className="items-center" style={{ width: 72 }}>
            <View
              className="w-16 h-16 rounded-full items-center justify-center"
              style={{ padding: 2, backgroundColor: allSeen ? RING_SEEN : RING_UNREAD }}
            >
              <View
                className="flex-1 rounded-full bg-bg items-center justify-center"
                style={{ padding: 2, alignSelf: 'stretch' }}
              >
                <View
                  className="flex-1 self-stretch rounded-full bg-surface items-center justify-center overflow-hidden"
                  style={{ opacity: allSeen ? 0.55 : 1 }}
                >
                  {g.entity.crest_url ? (
                    <Image
                      source={{ uri: g.entity.crest_url }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                      transition={120}
                    />
                  ) : (
                    <Text className="text-text text-sm font-semibold">
                      {initialsOf(g.entity.name)}
                    </Text>
                  )}
                </View>
              </View>
            </View>
            <Text
              className="text-muted text-[11px] mt-1"
              numberOfLines={1}
              style={{ maxWidth: 72, opacity: allSeen ? 0.6 : 1 }}
            >
              {g.entity.name}
            </Text>
          </View>
        </Pressable>
      )}
    />
  );
}
