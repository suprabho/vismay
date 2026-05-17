import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useState } from 'react';

export default function WebViewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { url, publisher } = useLocalSearchParams<{ url?: string; publisher?: string }>();
  const [loading, setLoading] = useState(true);

  if (!url) {
    return (
      <View className="flex-1 bg-bg items-center justify-center px-6">
        <Text className="text-text text-base">Missing URL</Text>
      </View>
    );
  }

  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  })();

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-4 py-2 border-b border-border">
        <Pressable onPress={() => router.back()} hitSlop={8} className="w-10">
          <Text className="text-text text-base">←</Text>
        </Pressable>
        <View className="flex-1 items-center">
          <Text className="text-text text-sm font-semibold" numberOfLines={1}>
            {publisher ?? host}
          </Text>
          <Text className="text-muted text-[11px]" numberOfLines={1}>
            {host}
          </Text>
        </View>
        <View className="w-10" />
      </View>

      {Platform.OS === 'web' ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-text text-base mb-2">WebView isn&apos;t supported on web.</Text>
          <Pressable
            onPress={() => {
              if (typeof window !== 'undefined') window.open(url, '_blank');
            }}
            className="bg-accent rounded-lg px-4 py-2"
          >
            <Text className="text-bg font-semibold">Open in new tab</Text>
          </Pressable>
        </View>
      ) : (
        <View className="flex-1">
          <WebView
            source={{ uri: url }}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            startInLoadingState
            renderLoading={() => (
              <View className="absolute inset-0 items-center justify-center bg-bg">
                <ActivityIndicator color="#00D26A" />
              </View>
            )}
          />
          {loading ? (
            <View className="absolute top-0 left-0 right-0 h-0.5 bg-accent" />
          ) : null}
        </View>
      )}
    </View>
  );
}
