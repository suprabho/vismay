import { Pressable, StyleSheet, Text, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { Stack, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StoryEmbed } from '@vismay/story-embed/native'

// vizmaya.fyi renders the story (the "general Viz story view"). We embed it via
// the shared StoryEmbed and overlay a blurred back chevron. Shared by the
// editorial reader (`/editorial/[slug]`) and the epic reader
// (`/editorial/epic/[slug]`); both pass a full vizmaya URL.
export { VIZMAYA_ORIGIN } from '@vismay/story-embed/url'

export function EditorialWebView({ url }: { url: string }) {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen options={{ headerShown: false }} />
      {/* Footshorts bg shows through (StoryEmbed bg is transparent + WebView
          opaque={false}) so there's no white flash while the story loads. */}
      <StoryEmbed url={url} spinnerColor="#00D26A">
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
      </StoryEmbed>
    </View>
  )
}
