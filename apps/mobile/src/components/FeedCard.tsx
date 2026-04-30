import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  headline: string;
  summary: string | null;
  imageUrl: string | null;
  publisher: string;
  url: string;
  publishedAt: string;
};

function relativeTime(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function FeedCard({ headline, summary, imageUrl, publisher, url, publishedAt }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

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
          <View className="flex-1 items-center justify-center">
            <Text className="text-muted text-sm">No image</Text>
          </View>
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
          <Text className="text-white text-[15px] leading-[22px]">{summary}</Text>
        ) : (
          <Text className="text-muted text-sm italic">Summary unavailable.</Text>
        )}

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
