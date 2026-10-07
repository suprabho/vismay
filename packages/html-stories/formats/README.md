# Story formats: book, board, deck, recap

Agent-authored HTML stories (`packages/html-stories`) are scrolling pages by
default. This folder holds the runtimes for four formats, which each site
hosts so an agent only writes the content, its design and its charts. Three
are not vertical scrollytelling; the fourth, the recap, scrolls, but beside a
3D race replay that its runtime drives:

| Format | What the reader does | Runtime |
|---|---|---|
| **Book** | Turns pages: tap, drag a page across, or the arrow keys. A two-page spread on wide screens, one page at a time on phones. | `book@1.css` + `book@1.js` |
| **Board** | Follows a guided tour while the camera flies between pinned items, or pans and zooms freely. Felt board or whiteboard. | `board@1.css` + `board@1.js` |
| **Deck** | Steps through slides, or switches to a stack of cards and swipes them away. | `deck@1.css` + `deck@1.js` |
| **Recap** (vizf1) | Scrolls chapters while the 3D race replay beside them jumps to each moment, camera and car. | `recap@1.css` + `recap@1.js` |

`examples/` tells the same story (`vizmaya-data/odyssey-voyage`) as a book, a
board and a deck, so the only difference between them is the format, and the
2024 Austrian Grand Prix as a recap. They are served at
`<site>/formats/examples/<file>.html` (`FORMAT_EXAMPLES` in `src/formats.ts`)
and the brief links to them.

## How it fits together

- **Sources** are plain files here: `story.js` (the shared `window.Story`
  runtime), `common.css` (controls, shared by every format), and one `.js` +
  `.css` per format.
- **Build:** `pnpm --filter @vismay/html-stories gen:formats` bundles them into
  `src/formatAssets.generated.ts` (`<format>@1.js` = `story.js` + the format's
  script; `<format>@1.css` = `common.css` + the format's sheet; `story@1.js`
  alone; the examples). Run it after any change here: `src/formats.test.ts`
  fails while the bundle is stale.
- **Serve:** `GET <site>/formats/<file>` on vizmaya.fyi, footshorts.com and vizf1.com
  (`apps/*/app/formats/[...path]/route.ts` → `src/formatsApi.ts`). Public,
  CORS-open, an hour in browsers and a day on the CDN (a deploy starts it
  fresh). The examples are served under the same CSP sandbox as a story.
- **Brief:** `htmlStoryBrief({ format })` (`src/brief.ts`, sections in
  `src/formatBrief.ts`). For a paged format, the scroll-only sections (motion
  and scroll animation, the Mapbox sticky map) are replaced by the format's
  section: what the reader does, the page skeleton with the runtime URLs, the
  authoring rules and frame size, and "animate on enter". Runtime URLs always
  point at the production site (`HTML_STORY_APP_META[app].siteUrl`), never at
  the deployment that served the brief. Ask for it with `?format=book` on
  `/api/html-stories/brief`, the format picker in admin, or `format` on the MCP
  `get_html_story_brief` tool.
- **Metadata and lint:** a page declares `<meta name="vizmaya:format"
  content="book">`. `extractFormatMeta` reads it, `saveHtmlStory` keeps it in
  `html_stories.format` (migration 089) and the listings badge it. `lintHtml`
  warns about an unknown value, a paged format that doesn't load its runtime,
  a page with no `[data-unit]`, `data-step` outside the scroll format, and a
  runtime loaded without the tag.

### Versioning

`@1` is a major version. Fixes and additions ship under it without a re-post:
published pages pick them up within the cache window. A change that would
break a published page (renamed classes or tokens, a different frame size, a
changed contract) becomes `@2`, served beside `@1`, with `FORMAT_RUNTIME_MAJOR`
in `src/formats.ts` and `MAJOR` in `scripts/gen-format-assets.ts` bumped
together; `@1` keeps being served for the pages that use it.

## What all three share

### The page

```html
<head>
  …the hosting-contract tags…
  <meta name="vizmaya:format" content="book">
  <link rel="stylesheet" href="https://vizmaya.fyi/formats/book@1.css">
  <style>/* the story's design, after the format's sheet */</style>
</head>
<body>
<main class="stage" aria-label="…">…the format's content…</main>
<script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>
<script src="https://vizmaya.fyi/formats/book@1.js"></script>
<script>/* Story.charts.<name> = … */</script>
</body>
```

The runtime starts once the document is parsed, so a chart script after it is
registered in time. If the page forgets the stylesheet, the script links it
from beside itself and waits for it.

### The stage

The site's header is injected above the page and its footer below it
(`src/branding.ts`), and branding sets the header's height as
`--vizmaya-chrome-h` (65px, 57px under 480px on vizmaya; 61px and 53px on
footshorts: the bars' height plus their 1px border; 0px when the page is
served without chrome, `/s/<slug>?embed=1`). The stage fills the rest:
`height: calc(100svh - var(--vizmaya-chrome-h))`, so header plus stage fill
the screen exactly and the footer is one scroll away.

The stage never hijacks the page's own scroll. The book and the deck don't
handle the wheel at all; the board leaves a plain wheel and one finger to the
page (a hint says "Hold ⌘/Ctrl and scroll to zoom"), and ⌘/Ctrl + wheel, a
trackpad pinch or two fingers move the board.

### One DOM, two readings

Content is written in reading order: pages, board items, slides. The runtime
adds `html.js`, `html.vz-on` and `html.book-on` / `board-on` / `deck-on` when
it takes the page over, and all of its layout is keyed off those classes, so:

- **No JS, or the site unreachable:** the content reads as one column (the
  format's stylesheet lays it out; a page's own CSS should still read without
  it). Charts show their `data-alt` text.
- **"Read as one page":** the same column at runtime. Charts rebuild at the
  new size and play as they scroll into view (`Story.observe`). The deck keeps
  each slide in its frame and scales it into the column.

### `window.Story`: charts that play on enter

| | |
|---|---|
| `Story.charts.<name> = function (el, opts) { …; return { play() {} } }` | Draws `<div class="chart" data-chart="<name>">` at `Story.size(el)`, the element's **layout** size, so the format's CSS scale doesn't matter. `opts` is `el.dataset`. Draw the start state (the final one when `Story.reduced`); animate in `play()`. A chart may also return `anchor(key)` → `[x, y]` in its own pixels, for the board's strings. |
| `Story.enter(unit)` | Builds the unit's charts if needed, plays them **once**, counts up its `[data-count]` numbers once, and fires `story:enter` on the unit (every time). Formats call it when a unit becomes the one the reader is looking at: "animate on enter", not on load and not on scroll. |
| `Story.rebuildAll(root)` | Redraws after a size change. Charts that already played come back in their final state. |
| `Story.dur(ms)` | `ms`, or 0 under reduced motion and while a played chart is redrawn. Charts pass every duration and delay through it. |
| `Story.observe(units)` | Enters units as they come up the screen (the one-page view). |
| `Story.theme` | The page's `vizmaya:theme` colours. |
| `<span data-count="565">565</span>` | Counts up the first time its unit is entered; the final value stays in the markup and is put back exactly as written. |

Charts take their colours from CSS custom properties on an ancestor (the
examples use `--c-ink`, `--c-muted`, `--c-grid`, `--c-hi`, …), which is how
one chart reads on bone paper in the book, on index cards on the board and on
ink in the deck. A chart that throws is emptied, so its `data-alt` shows.

### Also common

- **Deep links** (`history.replaceState`, in a try/catch): `#p=7` (book),
  `#step=5` (board), `#s=4` and `#s=4&cards` (deck).
- **Keys:** ←/→ and PageUp/PageDown everywhere; Home/End in the book and the
  deck (and Space in the deck); Esc (or 0) for the whole board, + and − to zoom.
- **Full screen** on the stage when the sandbox allows it; the button is hidden
  otherwise (and on the deck under 560px).
- **Accessibility:** only the visible page or slide is reachable (`inert` and
  `aria-hidden` on the rest), the position is announced through an
  `aria-live` counter, board items get `tabindex="0"`, and tabbing to one
  brings it into view. Control labels that fold away on phones stay readable
  to screen readers.
- **Reduced motion:** page turns, card throws and camera flights are instant
  cuts, and charts appear in their final state.
- **Theme:** the runtime's controls take the page's `vizmaya:theme` colours as
  `--vz-bg`, `--vz-surface`, `--vz-text`, `--vz-muted`, `--vz-line`,
  `--vz-accent` (at zero specificity, so a page's own values win).
- **Aura:** when the site lays an aura scene behind the page
  (`<vizmaya-aura>`), the runtime adds `html.vz-aura`: the book's table goes
  transparent, and the board's felt and the deck's table drop to 85%.
- **Overflow:** a page or slide can't scroll, so the book and the deck measure
  theirs once fonts are in (the deck at all three frames, with charts set
  aside) and report any that overflow to the console and, as a
  `vizmaya:format-check` message, to the admin preview, which shows them with
  the lint. Only height is checked: a frame's width is fixed and text wraps to
  it, while a decoration bleeding off the side is usually deliberate.
- **Icons:** the controls draw their own small SVG icons, so they don't depend
  on the page loading Phosphor.

## Book (`book.css`, `book.js`)

**Authoring:** `<main class="stage">` holds `<div class="pages">` whose
children are `<article class="page" data-unit>` in reading order. Every page is
laid out at a fixed **400 × 580** (`--pw`, `--ph`) and the book is scaled to
fit, so a layout never reflows between devices. Optional: `data-title` on
`.pages` (left-hand running heads; default: the document title), `data-head`
(a right-hand page's running head), `data-label` (the counter), `.bare` (no
running head or folio; `.cover`, `.endpaper` and `.backcover` count as bare),
`.book-only` (hidden in the one-column view), `data-goto="<page>"` on a button.
Tokens: `--book-paper`, `--book-table`, `--book-head`.

**Runtime:**
- On a wide screen (≥720px, with room for a spread at ≥0.8 scale), sheet *k*
  carries page 2k on its front and page 2k+1 on its back. The closed book and
  the back cover sit centred, and the book slides across as the cover turns.
- On a narrow screen each page is the front of its own sheet with a blank
  back, and a turned sheet swings off to the left and is hidden. Switching
  between the two keeps the reader on the same page.
- A turn is one tween of turn progress `p` from 0 to 1: `rotateY(-180·p)` on
  the sheet and `--vz-s: p` for the shading (front faces darken as they rise,
  back faces lighten as they land). Dragging scrubs the same `p`; released
  past 30% it completes, otherwise it springs back.
- A tap on the right page goes forward and on the left page back (on phones
  the split is at 40% of the width). Links and buttons inside pages work.
- Running heads (`.vz-head`) and folios (`.vz-folio`) are added by the runtime.

**Known limits:** the page turns as a flat plane rather than curling (a WebGL
or canvas curl like turn.js / StPageFlip would be the upgrade). Pages can't
overflow, so the rule is "one idea per page; if it doesn't fit, split it".

## Board (`board.css`, `board.js`)

**Authoring:**
- `<div class="world">` is a fixed **3400 × 2240** canvas (`data-width`,
  `data-height`). Each `.item` is placed with inline `--x`, `--y`, `--w` and
  an optional `--r` (tilt), and is one of:
  - `.paper`: large sheets for charts and maps, under the strings;
  - `.index`: ruled index cards, over the strings;
  - `.sticky` (`.gold`, `.rose`, `.blue`, `.sage`): notes on top;
  - `.bare`: a title or text straight on the board (no card, no pin, not
    clickable); `.tape` swaps a pin for tape.
  Each kind has a default look (tokens `--board-paper`, `--board-card`,
  `--board-ink`, `--sticky-gold`, …); a page restyles them freely.
- `data-pin-to="id"` runs a string from an item's pin to another item's pin;
  `data-pin-to="id:key"` runs it to point `key` of the chart in that item
  (its `anchor(key)`). Space-separate several.
- The tour is `<ol class="tour board-only">` of
  `<li data-unit data-target="id id …">`. The frame is the union of the
  targets' boxes; `board` frames the whole board; `data-target-sm` gives
  phones a tighter frame.
- `.zone-label` (placed like an item) names a zone; it's hidden in the
  one-column view.

**Runtime:**
- The camera is `d3-zoom` on a `.vz-viewport` wrapped around the world, and
  the world's transform is the zoom transform. The runtime loads d3@7.9.0 if
  the page hasn't.
- A step change is a `zoom.transform` transition, so it uses
  `d3.interpolateZoom` (van Wijk–Nuij): the camera pulls back, travels, then
  pushes in, with the duration scaled to the distance.
- The frame fits into the part of the screen the tour panel doesn't cover:
  right of the panel on desktop, above it on phones.
- On arrival, `Story.enter` runs on the step and its framed items. In free
  exploration, any item zoomed into at k ≥ 0.35 near the middle of the screen
  is entered too. Every chart is drawn in its start state at load, so the
  overview shows the whole case.
- Clicking a card flies to it; if a tour step frames that card, the tour jumps
  to that step. The minimap (desktop) shows every item and the current view,
  and clicking it flies there.
- The **Whiteboard** switch sets `data-surface="whiteboard"` on the stage,
  which swaps `--board-felt`, `--board-string`, `--board-pin` and
  `--board-label`: felt → whiteboard, red string → indigo marker line, gold
  pins → wine magnets.

**Known limits:** strings are straight with a little sag and don't avoid
cards. Phones are the weak spot: the board is small and the panel takes up to
40% of the screen, which is what `data-target-sm` is for. Keep body text on
items at 15px or more at world scale, and design for a laptop first.

## Deck (`deck.css`, `deck.js`)

**Authoring:** `<div class="deck">` holds `<section class="slide" data-unit>`.
A slide is a **size container** (`container: slide / size`) and its layout is
written with container queries, so the same markup works at three frames:

| Mode | Frame | When |
|---|---|---|
| Slides, landscape | 1280 × 720 | the stage is wider than it is tall |
| Slides, portrait | 450 × 780 | phones and narrow windows |
| Cards | 460 × 680 | card mode, on any screen |

`@container slide (orientation: portrait)` restacks and shrinks. Helpers:
`.in` (the padded inner box), `.cols` (text beside a chart, stacked in
portrait), `.hide-portrait`. `.bare` slides get no folio; `data-title` on
`.deck` is the folio's title. Tokens: `--deck-table`, `--deck-folio`.

**Runtime:**
- **Slides:** the current slide is `.vz-cur`, the others `.vz-before` /
  `.vz-after`, sliding and fading sideways. A swipe follows the finger, with
  resistance at either end.
- **Cards:** the next three cards fan out behind the current one (offset,
  scale and alternating tilt). Swiping the top card either way deals it off in
  that direction, where it stays; Previous brings the last card back.
- A tap on the left fifth of a slide goes back; anywhere else goes forward.
- When the frame changes (mode switch, rotation, resize), charts are rebuilt
  at the new size.

**Known limits:** no slide-overview grid yet (a G key showing thumbnails
would be a good next step), and no presenter notes.

## Recap (`recap.css`, `recap.js`) — vizf1 only

**Authoring:** `<main class="stage">` holds `<div class="replay"
data-session="<session key>" data-laps="71">` and `<div class="chapters">` of
`<section class="chapter" data-unit data-label="…">`. A chapter, or any
element inside one, is a **cue** when it has `data-lap` (the start of that
lap) or `data-at` (an exact session time, in seconds), with optional
`data-cam` (`auto`, `pov`, `chase`, `tv`, `heli`, `orbit`) and `data-focus`
(a three-letter driver code); an element without them takes its chapter's.
`data-play="false"` holds the replay at the cue. Tokens: `--recap-rail-w`,
`--recap-band-h`, `--recap-dim`, `--recap-cue`. The brief's race context lists
each race's **replay moments** with ready-made cues
(`@vismay/f1-viz/recap`'s `findMoments`: the start, duels, passes located to
the second, undercuts, lead changes, safety cars, retirements, the fastest
lap, the flag), so an agent never guesses a session key or a time.

**Runtime:**
- The replay is vizf1's `/embed/replay?session=<key>` (on the origin that
  served `recap@1.js`; `data-src` overrides it for previews), framed sticky
  beside the chapters on wide screens and as a band above them under 900px.
  It runs inside the story's sandbox, so its own requests are cross-origin:
  `/api/replay/*` sends CORS, and vizf1's `next.config.ts` adds it for
  `/fixtures/*` and `/_next/static/media/*`.
- The page scrolls as usual. The cue in charge is the last one whose top has
  passed the reading line (40% down what the replay leaves of the screen); a
  new one posts `{ type: 'vizf1:replay-cue', lap, at, cam, focus, play, laps }`
  to the frame (resent when it says `vizf1:replay-ready`). A session the
  replay doesn't have plays the demo race, with laps scaled by `data-laps`.
- `Story.enter` runs on a chapter when it becomes the current one; the others
  dim. The nav lists the chapters (a counter on phones); ←/→ jump between
  them; `#c=3` deep-links.
- "Read as one page" drops the replay (and pauses it): the chapters as one
  column, entering as they come up the screen.

**Known limits:** the replay needs the race's car positions ingested
(`vizf1_car_positions`); without them it plays the demo. A cue that repeats
the camera the reader has switched away from doesn't switch it back.

## Changing a runtime

1. Edit the files here, then `pnpm --filter @vismay/html-stories gen:formats`.
2. `npx tsx src/formats.test.ts` (bundle in sync, scripts parse, the route,
   the examples lint clean), plus `brief`, `meta` and `branding` tests.
3. Open an example in a browser at 1440 × 900 and 375 × 740 (wrapped in the
   site chrome via `brandHtmlStory`, with `https://vizmaya.fyi/formats/*`
   served from the bundle): turn every page, step the whole tour, deal the
   cards, switch to the one-page view and back, and try reduced motion.
4. Keep `@1` backwards compatible (see Versioning).

## Content notes on the examples

- **The recap example** (`austria-2024-recap.html`) uses the 2024 Austrian
  Grand Prix as the FastF1 ingest stores it (lap times, positions, stints,
  pit lane times from OpenF1, the lap-65 telemetry), inlined, so it reads
  without the database; its replay needs the race's positions ingested.
- **Data:** `vizmaya-data/odyssey-voyage/voyage_stops.csv` had row 6
  (Laestrygonians) with `ships_after` and `men_after` swapped; it now reads
  `1,48` at the source.
- **Share image:** `og:image` still points at a placeholder
  (`https://vizmaya.fyi/og/odyssey-voyage.png`). Replace it with a real
  1200 × 630 image before publishing any of them as a story.
- **Base map:** land comes from `world-atlas@2.0.2/land-50m.json`, clipped in
  screen space so Antarctica can't fill the frame in Mercator.
- **Unaccounted time:** the "where the years went" chart shows 20 of the 120
  months as *not accounted for*: months the poem doesn't spell out, and the
  chart says so rather than spreading them across the islands.
