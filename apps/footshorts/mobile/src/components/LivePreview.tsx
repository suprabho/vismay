import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Dimensions, StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import { WebView, type WebViewNavigation } from 'react-native-webview'

/**
 * A story shown live inside a magazine card: the real page in a WebView, laid
 * out at a full-size viewport and scaled down to fit. The native twin of
 * apps/footshorts/web/components/LivePreview.tsx (itself ported from the
 * vizmaya.fyi home wall); keep the three in step.
 *
 * It is a picture, not a control: it never takes a touch (the card's Pressable
 * sits under it and still fires), is hidden from screen readers, and the page
 * can't navigate itself away.
 *
 * A magazine of these would be a dozen WebViews (and as many maps) running at
 * once, so the previews share a budget (below): a preview is only loaded while
 * its card is on screen, at most two load at a time, at most six stay live,
 * one that has been off screen for a while is let go, and none run while
 * another screen (a story reader) covers the magazine.
 *
 * Visibility comes from the cards measuring themselves: the scroll view calls
 * `checkPreviewVisibility` as it scrolls, and `setPreviewsActive` as its screen
 * gains and loses focus.
 */

// ── the budget ────────────────────────────────────────────────────────────

/** How many previews may load at once; the rest wait their turn, top first. */
const LOADING_MAX = 2
/** How many previews may be live at once: the hero and up to four cards fit on a phone's screen. */
const LIVE_MAX = 6
/** How long a preview that left the screen is kept, in case the reader scrolls back. */
const GRACE_MS = 15_000
/** A preview that never reports loaded stops holding up the queue after this. */
const LOAD_TIMEOUT_MS = 10_000
/** After the document loads, the story's own entrance (map tiles, type) gets this long before it shows. */
const SETTLE_MS = 700
/** Start a little before a card arrives, so it is ready as it scrolls in. */
const MARGIN = 160

interface Slot {
  view: View | null
  visible: boolean
  top: number
  live: boolean
  loading: boolean
  leftAt: number
  timer: ReturnType<typeof setTimeout> | null
  notify: () => void
}

const slots = new Set<Slot>()
let active = true

function release(slot: Slot) {
  if (slot.timer) clearTimeout(slot.timer)
  slot.timer = null
  slot.live = false
  slot.loading = false
  slot.notify()
}

/** Gives free places to the cards on screen, top first, and lets go of previews long out of view. */
function pump() {
  if (!active) return
  const now = Date.now()
  const all = Array.from(slots)
  for (const s of all) if (s.live && !s.visible && now - s.leftAt >= GRACE_MS) release(s)

  let loading = all.filter((s) => s.loading).length
  const waiting = all.filter((s) => s.visible && !s.live).sort((a, b) => a.top - b.top)
  for (const s of waiting) {
    if (loading >= LOADING_MAX) break
    if (all.filter((x) => x.live).length >= LIVE_MAX) {
      // Full: the preview that left the screen longest ago makes room.
      const idle = all.filter((x) => x.live && !x.visible).sort((a, b) => a.leftAt - b.leftAt)[0]
      if (!idle) break
      release(idle)
    }
    s.live = true
    s.loading = true
    loading++
    s.timer = setTimeout(() => settle(s), LOAD_TIMEOUT_MS)
    s.notify()
  }
}

/** A preview has loaded (or given up): the next one in the queue can start. */
function settle(slot: Slot) {
  if (!slot.loading) return
  if (slot.timer) clearTimeout(slot.timer)
  slot.timer = null
  slot.loading = false
  pump()
}

function measure(slot: Slot) {
  slot.view?.measureInWindow((x, y, w, h) => {
    const win = Dimensions.get('window')
    const visible = w > 0 && h > 0 && y < win.height + MARGIN && y + h > -MARGIN && x < win.width && x + w > 0
    slot.top = y
    if (visible !== slot.visible) {
      slot.visible = visible
      if (!visible) {
        slot.leftAt = Date.now()
        setTimeout(pump, GRACE_MS + 50)
      }
    }
    pump()
  })
}

/** Re-measures every card against the window. Call it as the magazine scrolls (throttled) and settles. */
export function checkPreviewVisibility() {
  if (!active) return
  for (const s of slots) measure(s)
}

/** Pauses every preview (another screen covers the magazine) or resumes the ones on screen. */
export function setPreviewsActive(on: boolean) {
  active = on
  if (on) checkPreviewVisibility()
  else for (const s of slots) release(s)
}

/** Whether this card's preview holds a place in the budget, and how it reports that it has loaded. */
function usePreviewSlot(): { ref: (v: View | null) => void; onLayout: () => void; live: boolean; loaded: () => void } {
  const [live, setLive] = useState(false)
  const slot = useRef<Slot | null>(null)
  if (!slot.current) {
    const s: Slot = { view: null, visible: false, top: 0, live: false, loading: false, leftAt: 0, timer: null, notify: () => setLive(s.live) }
    slot.current = s
  }
  useEffect(() => {
    const s = slot.current!
    slots.add(s)
    if (active) measure(s)
    return () => {
      if (s.timer) clearTimeout(s.timer)
      slots.delete(s)
      pump()
    }
  }, [])
  const ref = useCallback((v: View | null) => {
    if (slot.current) slot.current.view = v
  }, [])
  const onLayout = useCallback(() => {
    if (slot.current && active) measure(slot.current)
  }, [])
  const loaded = useCallback(() => {
    if (slot.current) settle(slot.current)
  }, [])
  return { ref, onLayout, live, loaded }
}

// ── the preview ───────────────────────────────────────────────────────────

/**
 * The viewport a page is laid out at for a card of this shape: a desktop for a
 * wide card, a tablet for a squarish one and a phone for a tall one, so the
 * page's own responsive layout fills the card instead of being cropped.
 */
function viewportWidth(aspect: number): number {
  if (aspect >= 1.15) return 1280
  if (aspect >= 0.75) return 860
  return 420
}

/** A URL's site: scheme and host, without a leading www. (footshorts.com redirects to www.footshorts.com). */
function originOf(uri: string): string {
  const m = /^(https?:\/\/[^/]+)/i.exec(uri)
  return m?.[1] ? m[1].toLowerCase().replace('://www.', '://') : uri
}

/** The framed page: hidden until it has loaded and settled. Unmounted when its card gives up its place, so it starts hidden again. */
function Frame({ uri, width, height, scale, onLoaded }: { uri: string; width: number; height: number; scale: number; onLoaded: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const origin = originOf(uri)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  // The page runs as itself but can't take the frame anywhere else: no
  // following links off its own site, no popups.
  const stayHome = useCallback(
    (req: WebViewNavigation & { isTopFrame?: boolean }) =>
      req.isTopFrame === false || req.url === 'about:blank' || originOf(req.url) === origin,
    [origin]
  )
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width,
        height,
        opacity,
        transform: [{ scale }],
        transformOrigin: 'top left',
      }}
    >
      <WebView
        source={{ uri }}
        style={{ width, height, backgroundColor: 'transparent' }}
        pointerEvents="none"
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        mediaPlaybackRequiresUserAction
        onShouldStartLoadWithRequest={stayHome}
        onLoadEnd={() => {
          onLoaded()
          timer.current = setTimeout(() => {
            Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }).start()
          }, SETTLE_MS)
        }}
        onError={onLoaded}
      />
    </Animated.View>
  )
}

export function LivePreview({ uri }: { uri: string }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const { ref, onLayout, live, loaded } = usePreviewSlot()

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    if (width > 0 && height > 0) setSize({ w: Math.round(width), h: Math.round(height) })
    onLayout()
  }

  const vw = size ? viewportWidth(size.w / size.h) : 0
  const scale = size ? size.w / vw : 1
  return (
    <View
      ref={ref}
      onLayout={handleLayout}
      collapsable={false}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}
    >
      {live && size ? (
        <Frame uri={uri} width={vw} height={Math.ceil(size.h / scale)} scale={scale} onLoaded={loaded} />
      ) : null}
    </View>
  )
}
