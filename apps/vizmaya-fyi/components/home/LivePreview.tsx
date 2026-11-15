'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * A story (or an epic's landing page) shown live inside a tile: the real page
 * in an iframe, laid out at a full-size viewport and scaled down to fit. It is
 * a picture, not a control: it can't be clicked, focused or read by a screen
 * reader, and the tile's own link sits over it.
 *
 * A wall of these would be a dozen pages (and as many maps) running at once,
 * so the previews share a budget (below): a preview is only loaded while its
 * tile is on screen, at most two load at a time, and one that has been off
 * screen for a while is let go.
 */

// ── the budget ────────────────────────────────────────────────────────────

/** How many previews may load at once; the rest wait their turn, top first. */
const LOADING_MAX = 2
/** How long a preview that left the screen is kept, in case the reader scrolls back. */
const GRACE_MS = 15_000
/** A preview that never reports loaded stops holding up the queue after this. */
const LOAD_TIMEOUT_MS = 10_000
/** After the document loads, the story's own entrance (map tiles, type) gets this long before it shows. */
const SETTLE_MS = 700

interface Slot {
  el: Element
  visible: boolean
  live: boolean
  loading: boolean
  leftAt: number
  timer: ReturnType<typeof setTimeout> | null
  notify: () => void
}

const slots = new Set<Slot>()
let observer: IntersectionObserver | null = null

/** How many previews may be live: fewer on phones and small machines, none for a reader saving data. */
function liveMax(): number {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number }
  if (nav.connection?.saveData) return 0
  if (window.innerWidth < 720 || (nav.deviceMemory ?? 8) <= 4) return 4
  return 8
}

function release(slot: Slot) {
  if (slot.timer) clearTimeout(slot.timer)
  slot.timer = null
  slot.live = false
  slot.loading = false
  slot.notify()
}

/** Gives free places to the tiles on screen, top first, and lets go of previews long out of view. */
function pump() {
  const now = performance.now()
  const all = Array.from(slots)
  for (const s of all) if (s.live && !s.visible && now - s.leftAt >= GRACE_MS) release(s)

  const max = liveMax()
  let loading = all.filter((s) => s.loading).length
  const waiting = all
    .filter((s) => s.visible && !s.live)
    .sort((a, b) => a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top)
  for (const s of waiting) {
    if (loading >= LOADING_MAX) break
    if (all.filter((x) => x.live).length >= max) {
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

function watch(): IntersectionObserver {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const slot = Array.from(slots).find((s) => s.el === e.target)
        if (!slot || slot.visible === e.isIntersecting) continue
        slot.visible = e.isIntersecting
        if (!slot.visible) {
          slot.leftAt = performance.now()
          setTimeout(pump, GRACE_MS + 50)
        }
      }
      pump()
    },
    // Start a little before a tile arrives, so it is ready as it scrolls in.
    { rootMargin: '160px 0px' }
  )
  return observer
}

/** Whether this tile's preview holds a place in the budget, and how it reports that it has loaded. */
function usePreviewSlot(ref: React.RefObject<Element | null>): { live: boolean; loaded: () => void } {
  const [live, setLive] = useState(false)
  const slot = useRef<Slot | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const s: Slot = { el, visible: false, live: false, loading: false, leftAt: 0, timer: null, notify: () => setLive(s.live) }
    slot.current = s
    slots.add(s)
    watch().observe(el)
    return () => {
      observer?.unobserve(el)
      if (s.timer) clearTimeout(s.timer)
      slots.delete(s)
      slot.current = null
      pump()
    }
  }, [ref])
  return { live, loaded: () => slot.current && settle(slot.current) }
}

// ── the preview ───────────────────────────────────────────────────────────

/**
 * The viewport a page is laid out at for a tile of this shape: a desktop for
 * a wide tile, a tablet for a squarish one and a phone for a tall one, so the
 * page's own responsive layout fills the tile instead of being cropped.
 */
function viewportWidth(aspect: number): number {
  if (aspect >= 1.15) return 1280
  if (aspect >= 0.75) return 860
  return 420
}

/** The framed page: hidden until it has loaded and settled. Unmounted when its tile gives up its place, so it starts hidden again. */
function Frame({ src, title, width, height, scale, onLoaded }: { src: string; title: string; width: number; height: number; scale: number; onLoaded: () => void }) {
  const [shown, setShown] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  return (
    <iframe
      src={src}
      title={title}
      tabIndex={-1}
      // The page runs as itself (its own data and storage) but can't take
      // over this one: no navigating the top window, no popups, no dialogs.
      sandbox="allow-scripts allow-same-origin"
      referrerPolicy="same-origin"
      onLoad={() => {
        onLoaded()
        timer.current = setTimeout(() => setShown(true), SETTLE_MS)
      }}
      style={{ width, height, transform: `scale(${scale})`, transformOrigin: '0 0' }}
      className={`block max-w-none border-0 transition-opacity duration-700 ${shown ? 'opacity-100' : 'opacity-0'}`}
    />
  )
}

export default function LivePreview({ src, title, className = '' }: { src: string; title: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const { live, loaded } = usePreviewSlot(box)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setSize({ w: Math.round(width), h: Math.round(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const vw = size ? viewportWidth(size.w / size.h) : 0
  const scale = size ? size.w / vw : 1
  return (
    <div ref={box} aria-hidden inert className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {live && size && <Frame src={src} title={title} width={vw} height={Math.ceil(size.h / scale)} scale={scale} onLoaded={loaded} />}
    </div>
  )
}
