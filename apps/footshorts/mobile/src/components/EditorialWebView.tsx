import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { Stack, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'

// Chrome-less WebView shell over vizmaya.fyi, shared by the Editorial story
// reader (`/editorial/[slug]`) and the epic reader (`/editorial/epic/[slug]`).
// The mobile-native viewer is out of scope — we lean on vizmaya's existing web
// implementation and overlay just a back chevron. On web (react-native-web)
// the WebView renders as an <iframe>.
export const VIZMAYA_ORIGIN = 'https://vizmaya.fyi'

// Spinner safety net: if onLoadEnd never fires (offline, blocked, etc.) we
// hide the indicator after this many ms so the user isn't staring at a
// permanent spinner over a blank page.
const LOAD_TIMEOUT_MS = 6000

export function EditorialWebView({ url }: { url: string }) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (loaded) return
    const t = setTimeout(() => setLoaded(true), LOAD_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [loaded])

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

      {/* Blurred pill back button — mirrors web's
          `rounded-full border bg-surface/80 backdrop-blur` chrome. */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 12,
          width: 40,
          height: 40,
          borderRadius: 20,
          overflow: 'hidden',
        }}
      >
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
        <View
          style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(22,22,29,0.55)' }}
        />
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityLabel="Back"
          className="w-10 h-10 rounded-full border border-border items-center justify-center"
        >
          <Text className="text-text" style={{ fontSize: 22, fontWeight: '600', marginTop: -2 }}>
            ‹
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
