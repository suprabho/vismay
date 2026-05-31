import { useEffect, useState, type ReactNode } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { storyUrl, VIZMAYA_ORIGIN } from './url'

export interface StoryEmbedNativeProps {
  /** Story slug (combined with `origin`). Ignored when `url` is provided. */
  slug?: string
  /** Full URL override — e.g. epic readers that build their own path. */
  url?: string
  /** Render origin. Defaults to vizmaya.fyi. */
  origin?: string
  /** ms before the loading indicator is force-hidden (safety net). */
  timeoutMs?: number
  /** ActivityIndicator colour. */
  spinnerColor?: string
  /** Backdrop behind the WebView. Defaults to transparent so the host bg shows. */
  backgroundColor?: string
  /** Branding/chrome overlaid on top of the WebView (back button, …). */
  children?: ReactNode
}

/**
 * Native counterpart of the web StoryEmbed: a chrome-less react-native-webview
 * over the vizmaya story view, with host chrome overlaid via `children`. On web
 * (react-native-web) the WebView renders as an <iframe>.
 *
 * Replicating in a new mobile app: `<StoryEmbed slug={slug}>{backButton}</StoryEmbed>`.
 */
export function StoryEmbed({
  slug,
  url,
  origin = VIZMAYA_ORIGIN,
  timeoutMs = 6000,
  spinnerColor = '#888',
  backgroundColor = 'transparent',
  children,
}: StoryEmbedNativeProps) {
  const uri = url ?? (slug ? storyUrl(slug, origin) : VIZMAYA_ORIGIN)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (loaded) return
    const t = setTimeout(() => setLoaded(true), timeoutMs)
    return () => clearTimeout(t)
  }, [loaded, timeoutMs])

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <WebView
        source={{ uri }}
        onLoadEnd={() => setLoaded(true)}
        style={StyleSheet.absoluteFill}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        opaque={false}
      />

      {!loaded && (
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <ActivityIndicator color={spinnerColor} size="large" />
        </View>
      )}

      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
})
