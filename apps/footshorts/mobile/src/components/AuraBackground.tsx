import { StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { WebView } from 'react-native-webview'

// Per-story aura visual (aura.promad.design) used as a card background — the
// mobile twin of apps/footshorts/web/components/AuraBackground.tsx. Fills its
// parent, never intercepts taps (so the card Pressable still fires), and lays
// a bottom-up scrim over the embed so card text stays legible. On web
// (react-native-web) the WebView renders as an <iframe>.
//
// Each instance is a live embed, so callers cap how many mount at once rather
// than auraing an entire scrolled list.
export function AuraBackground({ slug }: { slug: string }) {
  const uri = `https://aura.promad.design/embed/${slug}?hideText=true&hideIcons=true&input=off&theme=light`
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <WebView
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        // Let the card's own background show through the embed's transparent
        // regions instead of a white flash.
        opaque={false}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.6)']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  )
}
