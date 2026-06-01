# Studio Story Embed

The home page (`/`) includes a live preview of the *vizmaya-studio* story embedded in a browser-chrome frame. Scrolling the page drives the story forward — no custom scroll hijacking, no separate scroll context.

## Files changed

| File | Role |
|------|------|
| `components/HomeClient.tsx` | Scroll wrapper, sticky frame, wheel/scroll listeners, postMessage sender |
| `packages/story-reader/src/components/story/StoryMapShell.tsx` | Message receiver inside the iframe — progress sync, seek, ready advertisement |

---

## Layout

```
<section .story-embed>               ← tall wrapper: sectionCount × 100svh
  <div .story-embed-sticky>          ← position: sticky; top: 0; height: 100svh
    <div .story-embed-inner>
      <div .story-embed-frame>       ← border-radius + shadow (browser chrome)
        <div .story-embed-bar>       ← top bar: traffic-light dots + URL pill
        <div .story-embed-iframe-wrap>
          <iframe src="/story/vizmaya-studio?embed=1" />
          <div .story-embed-scroll-cap />   ← transparent overlay above iframe
```

### Why the tall wrapper?
The sticky frame stays pinned while the page scrolls through the wrapper. The wrapper's height (`sectionCount × 100svh`) provides the scroll distance — one viewport-height of page scroll per story section. No proprietary scroll hijacking is needed; the browser does all the work.

### Why the scroll-cap overlay?
The transparent `position: absolute; z-index: 1` div sits above the iframe so pointer events (wheel and touch) land on a page-owned element rather than the iframe document. Without it, the browser would route scroll events into the iframe's own scroll context and the page would not move.

---

## Scroll sync

### Desktop — wheel interception

A non-passive `wheel` listener on `.story-embed-sticky` handles mouse/trackpad:

1. At the first section (`currentIdx === 0`) and scrolling up, or at the last section and scrolling down, `preventDefault` is **not** called — the page scrolls away naturally.
2. Otherwise `e.preventDefault()` stops the browser, raw delta is accumulated into `pendingDelta`.
3. Once `pendingDelta` exceeds 80 px, `seekTo(next)` fires: the page is snapped to `wrapperTop + idx × innerHeight` with `window.scrollTo({ behavior: 'smooth' })` and a `viz-story-seek` message is posted. A 700 ms lock prevents gesture bursts from queuing.

### Mobile — native scroll + scroll-event sync

iOS Safari ignores `window.scrollBy` / `window.scrollTo` during an active touch gesture, so touch handlers are deliberately omitted. Instead:

- The scroll-cap overlay ensures native touch scrolls the **page**, not the iframe.
- The `window.scroll` listener fires on every tick and handles both sends (see below).

### The scroll event — continuous progress + snap

The `scroll` listener runs on every scroll tick regardless of input device:

```
progress = (-wrapperTop / wrapperHeight) × sectionCount   // float 0..N
```

It posts `{ type: 'viz-story-progress', value: progress }` to the iframe on every tick. After 200 ms of scroll silence (momentum has died) it calls `seekTo(Math.round(progress))` to snap the page and the story to the nearest exact section.

---

## postMessage protocol

All messages cross the page ↔ iframe boundary via `postMessage('*')`.

### Host → iframe

| Type | Payload | When sent |
|------|---------|-----------|
| `viz-story-progress` | `{ value: float }` — continuous 0..N | Every `scroll` tick while wrapper is in view |
| `viz-story-seek` | `{ index: int }` — section to snap to | After 200 ms scroll silence; also from `seekTo` on desktop wheel |

### iframe → host

| Type | Payload | When sent |
|------|---------|-----------|
| `viz-story-ready` | `{ sectionCount: int }` | On story mount (after `isEmbed` resolves to `true`) |

When `viz-story-ready` arrives, the host sets `--embed-sections` on the wrapper element, resizing it to exactly `sectionCount × 100svh`.

---

## Story-side changes (`StoryMapShell`)

### Message handler

```
viz-story-progress → root.scrollTop = value × root.clientHeight   (direct, no animation)
viz-story-seek     → root.scrollTo({ top: index × clientHeight, behavior: 'smooth' })
```

Direct `scrollTop` assignment mirrors the page scroll pixel-for-pixel with no added latency. `scrollTo({ smooth })` is reserved for the final snap so the landing feels deliberate.

### CSS snap disabled in embed mode

`snap-y snap-mandatory` is only applied when `!isEmbed`. Without this, direct `scrollTop` writes during continuous progress updates would be fought by the snap engine jumping to the nearest section point on every frame.

### Scrollbar hidden

`hide-scrollbar` is applied whenever `isEmbed` is true (in addition to the existing `isAutoplay` case).

### iframe `src`

The src uses a **relative URL** (`/story/vizmaya-studio?embed=1`) rather than the absolute production URL. This ensures the local dev build — which contains the message listeners — is what runs inside the frame. In production both resolve to the same origin.

---

## Sizing

The wrapper height is controlled by the CSS custom property `--embed-sections` (default `10`):

```css
height: calc(var(--embed-sections, 10) * 100svh)
```

When `viz-story-ready` arrives the host calls:

```js
wrapper.style.setProperty('--embed-sections', String(sectionCount))
```

This resizes the wrapper to match the actual story length so the last section never runs out of scroll space.

---

## Sequence diagram

```
User scrolls page
        │
        ▼
window.scroll fires in HomeClient
        │
        ├─ compute progress = (-wrapperTop / wrapperHeight) × N
        │
        ├─ postMessage viz-story-progress { value }
        │        │
        │        ▼ (iframe)
        │   root.scrollTop = value × clientHeight   ← zero-latency mirror
        │
        └─ after 200 ms silence: seekTo(Math.round(progress))
                 │
                 ├─ window.scrollTo({ smooth }) ← page snaps
                 │
                 └─ postMessage viz-story-seek { index }
                          │
                          ▼ (iframe)
                     root.scrollTo({ smooth }) ← story snaps
```
