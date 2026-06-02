# Studio Story Embed

The home page (`/`) includes a live preview of the *vizmaya-studio* story embedded in a browser-chrome frame. Scrolling the page drives the story forward — one shared scroll, no scroll hijacking, no per-device code.

## The model in one line

**The page is the only scroller.** It scrolls natively (wheel *and* touch). As it scrolls through a tall wrapper, the frame stays pinned and we mirror the page's progress (a `0..1` fraction) into the iframe, which maps it onto the story's own scroll range. That's it — there is no wheel interception, no momentum re-implementation, no lock, and no boundary-handoff logic, because the page owns its boundaries by definition.

## Files changed

| File | Role |
|------|------|
| `apps/vizmaya-fyi/components/HomeClient.tsx` | Tall wrapper + sticky frame; `scroll` listener that posts continuous progress and snaps to the nearest section on settle |
| `packages/story-reader/src/components/story/StoryMapShell.tsx` | Message receiver inside the iframe — sizes itself via `viz-story-ready`, mirrors `viz-story-progress` into `scrollTop` |

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
          <div .story-embed-scroll-cap />   ← transparent pointer shield over the iframe
```

### Why the tall wrapper?
The sticky frame stays pinned while the page scrolls through the wrapper. The wrapper's height (`sectionCount × 100svh`) provides the scroll distance — one viewport-height of page scroll per story section. The browser does all the scrolling; we only read its position.

### Why the scroll-cap overlay?
The transparent `position: absolute; z-index: 1` div sits above the iframe so wheel/touch land on a **page-owned** element. Without it, those gestures would be captured by the iframe's own scroll container and the page would never move. Note: it is a passive *pointer shield* — it carries no event listeners. (It also means the embedded story is intentionally non-interactive: no map drag, no chart hover.)

---

## Scroll sync — one path for every device

A single `scroll` listener on `window` (rAF-throttled) runs on every tick, regardless of input device:

```
const { top, height } = wrapper.getBoundingClientRect()
const pinned   = height - window.innerHeight      // px the page scrolls while pinned
const fraction = clamp(-top / pinned, 0, 1)        // 0 at pin start, 1 just before release
```

It posts `{ type: 'viz-story-progress', value: fraction }` to the iframe every tick. The iframe maps that fraction onto its **own** scroll range and writes `scrollTop` directly — a zero-latency, pixel-for-pixel mirror.

Because this is just native page scroll, **wheel and touch are identical** — iOS Safari, trackpad, mouse wheel, scrollbar drag all flow through the same path. To bound message spam, progress is only posted while the wrapper is within ~one viewport of the screen.

### Settle snap
After **140 ms** of scroll silence (momentum has died), the listener computes the nearest section and nudges the **page** there with `window.scrollTo({ behavior: 'smooth' })`. It does *not* message the iframe — the ongoing progress mirror carries the story smoothly into place as the page moves. One source of truth (page position), nothing to fight. A `snapping` guard ignores the scroll events that the snap itself produces so it can't re-trigger.

### Why normalize to 0..1?
The host's "section" is `window.innerHeight`; the iframe's "section" is the (smaller) iframe element height (`clamp(400px, 72vh, 820px)`). A normalized fraction is independent of both pixel heights *and* of section count — so portrait vs. landscape unit arrays (which can differ in length) need no special-casing on either side.

---

## postMessage protocol

All messages cross the page ↔ iframe boundary via `postMessage('*')`.

### iframe → host

| Type | Payload | When sent |
|------|---------|-----------|
| `viz-story-ready` | `{ sectionCount: int }` | On story mount, and again if the active unit array changes (e.g. portrait↔landscape) |

When `viz-story-ready` arrives, the host sets `--embed-sections` on the wrapper, resizing it to exactly `sectionCount × 100svh`.

### host → iframe

| Type | Payload | When sent |
|------|---------|-----------|
| `viz-story-progress` | `{ value: 0..1 }` — fraction of the pinned scroll range | Every `scroll` tick while the wrapper is near/in view |

> There is **no** `viz-story-seek` message. An earlier discrete "advance one section per gesture" design used one; it was replaced by the continuous mirror + page-side settle snap, which works on touch (the discrete path never did) and feels smooth rather than paginated. The single sender/receiver pair above is the whole protocol — keep it that way to avoid the doc/code drift that the seek path caused.

---

## Story-side changes (`StoryMapShell`)

### Message handler
```
viz-story-progress → root.scrollTop = clamp(value,0,1) × (root.scrollHeight − root.clientHeight)
```
Direct `scrollTop` assignment mirrors the page scroll with no added latency. `root` is the snap container (the scrollable element, also the IntersectionObserver root), so mirroring progress also drives the story's `activeUnit` → map flyTo / chart steps as sections cross the 0.55 threshold.

### CSS snap disabled in embed mode
`snap-y snap-mandatory` is applied only when `!isEmbed`. Without this, the direct `scrollTop` writes during continuous progress would be fought by the snap engine jumping to the nearest snap point every frame.

### Scrollbar hidden
`hide-scrollbar` is applied whenever `isEmbed` is true (in addition to the existing `isAutoplay` case).

### iframe `src`
The src uses a **relative URL** (`/story/vizmaya-studio?embed=1`) so the local dev build — which contains the message listeners — is what runs inside the frame. In production both resolve to the same origin.

---

## Sizing

The wrapper height is controlled by the CSS custom property `--embed-sections`:

```css
height: calc(var(--embed-sections, 6) * 100svh)
```

When `viz-story-ready` arrives the host calls:

```js
wrapper.style.setProperty('--embed-sections', String(sectionCount))
```

This resizes the wrapper to match the actual story length so the last section never runs out of scroll space.

---

## Sequence diagram

```
User scrolls page (wheel OR touch — same path)
        │
        ▼
window 'scroll' fires in HomeClient (rAF-throttled)
        │
        ├─ fraction = clamp(-wrapperTop / pinnedRange, 0, 1)
        │
        ├─ postMessage viz-story-progress { value: fraction }
        │        │
        │        ▼ (iframe)
        │   root.scrollTop = fraction × (scrollHeight − clientHeight)   ← zero-latency mirror
        │        │
        │        └─ IntersectionObserver crosses 0.55 → activeUnit → map flyTo / chart step
        │
        └─ after 140 ms silence: snapToNearest()
                 └─ window.scrollTo({ smooth }) → page rests on a section boundary
                          └─ progress mirror follows the page in → story lands cleanly
```
