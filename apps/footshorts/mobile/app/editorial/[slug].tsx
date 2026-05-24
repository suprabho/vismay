import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'

// Editorial reader is a chrome-less WebView shell over vizmaya.fyi. The
// mobile-native scrollytelling viewer is out of scope for v1 — we lean on
// vizmaya's existing web implementation and overlay just a back chevron.
const VIZMAYA_ORIGIN = 'https://vizmaya.fyi'

export default function EditorialReader() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [loaded, setLoaded] = useState(false)

  const url = slug
    ? `${VIZMAYA_ORIGIN}/story/${encodeURIComponent(slug)}`
    : VIZMAYA_ORIGIN

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen options={{ headerShown: false }} />
      <WebView
        source={{ uri: url }}
        onLoadEnd={() => setLoaded(true)}
        style={StyleSheet.absoluteFill}
        // Inline media + JS are required for the story's charts/maps.
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        // Hide the white WebView background flash while the page is loading.
        // Footshorts's bg colour shows through underneath the spinner instead.
        opaque={false}
      />

      {!loaded && (
        <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
          <ActivityIndicator color="#00D26A" size="large" />
        </View>
      )}

      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        accessibilityLabel="Back"
        style={{ position: 'absolute', top: insets.top + 8, left: 12 }}
        className="w-10 h-10 rounded-full bg-surface/80 border border-border items-center justify-center"
      >
        <Text className="text-text text-xl">‹</Text>
      </Pressable>
    </View>
  )
}
