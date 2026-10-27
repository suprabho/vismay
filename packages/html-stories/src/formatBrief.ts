/**
 * The brief's sections for the runtime-driven story formats (./formats): book,
 * board, deck, collage and recap. In a brief for one of them, the scroll format's "Motion and
 * scroll animation" section and its Mapbox sticky-map pattern are replaced by
 * the format's section here: what the reader does, what the hosted runtime
 * does, the page skeleton with the runtime's URLs, the authoring rules and
 * frame size, and "animate on enter" for charts and numbers. The hosting
 * contract, design direction, icons, charts and content sections stay.
 */

import type { RandomizerId } from '@vismay/randomizer/types'
import { HTML_STORY_APP_META, type HtmlStoryApp } from './apps'
import {
  HTML_STORY_FORMAT_META,
  formatExampleUrl,
  formatRuntimeUrls,
  suggestedFormatFor,
  type AuthorableHtmlStoryFormat,
  type PagedHtmlStoryFormat,
} from './formats'
import { MAPBOX_TOKEN_GLOBAL } from './mapbox'

const D3 = 'https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js'

const TITLES: Record<PagedHtmlStoryFormat, string> = {
  book: 'a book',
  board: 'a pinned board',
  deck: 'a deck',
  collage: 'a cut-out collage',
  recap: 'a race recap',
}

/** "a book", "a race recap": what the story is, for the brief's intro. */
export function formatTitle(format: PagedHtmlStoryFormat): string {
  return TITLES[format]
}

/** The format section's heading, for cross-references from the rest of the brief. */
export function formatHeading(format: PagedHtmlStoryFormat): string {
  return `Story format: ${TITLES[format]}`
}

function skeleton(format: PagedHtmlStoryFormat, app: HtmlStoryApp, body: string): string {
  const { css, js } = formatRuntimeUrls(app, format)
  const d3 = format === 'board' ? `<script src="${D3}"></script>  <!-- for your charts; the board needs it too -->` : `<script src="${D3}"></script>`
  return `\`\`\`html
<head>
  …the tags from the hosting contract…
  <meta name="vizmaya:format" content="${format}">
  <link rel="stylesheet" href="${css}">
  <style>/* your design, after the format's stylesheet */</style>
</head>
<body>
${body}
${d3}
<script src="${js}"></script>
<script>/* your charts: Story.charts.<name> = … (see below) */</script>
</body>
\`\`\``
}

function bookSection(app: HtmlStoryApp): string {
  return `The reader turns pages: a tap on the right-hand page goes forward and on
the left-hand page goes back, a page can be dragged across, and the arrow keys
work. Wide screens show a two-page spread, phones one page at a time. Nothing
scrolls inside the book and nothing is scroll-triggered.

A hosted runtime does the book: the sheets and page turns, the controls,
running heads and folios, "Read as one page" (the same pages as one column,
which is also what readers without JavaScript get), full screen, keys, deep
links (\`#p=7\`), and keeping only the visible pages reachable by keyboard and
screen readers. You write the pages, their design and their charts.

${skeleton(
  'book',
  app,
  `<main class="stage" aria-label="<headline>, as a book">
  <div class="pages" data-title="<short title for the running heads>">
    <article class="page cover" data-unit data-label="Cover">…</article>
    <article class="page" data-unit data-head="The distance">…</article>
    …
  </div>
</main>`,
)}

- **One idea per page.** Every page is laid out at a fixed 400 × 580 (CSS
  pixels) and the book is scaled to fit the screen, so a page never reflows.
  It can't scroll either: if a page doesn't fit, split it in two. Plan 16 to 24
  pages. A text page holds a heading and about 90 words at 17–18px; a chart
  page holds a heading, one chart with an explicit height (\`style="height:280px"\`)
  and a source line. The runtime warns in the browser console when a page
  overflows.
- **Spreads.** Page 1 sits alone on the right, like a cover; then pages 2–3,
  4–5 and so on face each other. Put a chart on the right-hand page and its
  words on the left.
- **Pages** are the direct children of \`.pages\`, in reading order. Optional:
  \`data-head\` (the running head on a right-hand page; left-hand pages show
  \`data-title\`), \`data-label\` (what the page counter announces), \`.bare\` (no
  running head or folio: title pages, full-page quotes; \`.cover\`, \`.endpaper\`
  and \`.backcover\` are bare too), \`.book-only\` (in the book but not in the
  one-column view: a "how to read" endpaper, a back cover), and \`data-goto="1"\`
  on a button to jump to a page.
- **Design the paper.** Give \`.page\` its background (a paper colour, a little
  texture from gradients), its padding (about \`46px 42px 50px\` leaves room for
  the running head and folio) and its type. A cover in cloth or leather,
  endpapers, drop caps and a ruled ledger make it feel like a book. Tokens for
  your \`:root\`: \`--book-paper\` (blank page backs on phones: your paper
  colour), \`--book-table\` (what the book lies on: a colour or a gradient),
  \`--book-head\` (running heads and folios).
- **The one-column view.** Without the runtime, or after "Read as one page",
  the pages stack up to 620px wide and size to their content, and charts become
  4:3 (set \`--chart-ratio\` on a chart to change that). Read the story that way
  once. Add \`html:not(.book-on) .book-only { display: none }\` to your own CSS,
  so it holds even if the format's stylesheet can't load.`
}

function boardSection(app: HtmlStoryApp): string {
  return `The story is one large board of pinned sheets, index cards and sticky
notes. The reader follows a guided tour while the camera flies between items,
or drags and zooms around the board freely. Design it for a laptop first;
phones get tighter frames.

A hosted runtime does the board: the camera (it pulls back, travels and pushes
in between frames), the tour panel, strings from cards to what they point at,
pins, a minimap, a Whiteboard switch, "Read as one page" (every item in markup
order as one column, which is also what readers without JavaScript get), full
screen, keys (←/→, Esc for the whole board, + and −), deep links (\`#step=5\`),
and gestures that leave scrolling to the page (⌘/Ctrl + wheel, or two
fingers, move the board). It loads d3 itself if the page hasn't.

${skeleton(
  'board',
  app,
  `<main class="stage" aria-label="<headline>, as a pinned board">
  <div class="world" data-width="3400" data-height="2240">
    <div class="item bare" id="title" style="--x:150;--y:120;--w:720"><h1>…</h1><p>…</p></div>
    <div class="item paper" id="trip" style="--x:150;--y:680;--w:700;--r:-1">
      <h3>A week by galley. Ten years by Homer.</h3>
      <div class="chart" style="height:330px" data-chart="trip" data-alt="…"></div>
      <p class="src">Source: …</p>
    </div>
    <div class="item sticky gold" id="miles" style="--x:660;--y:520;--w:300;--r:3">…</div>
    <div class="item index" id="troy" data-pin-to="map:0" style="--x:2620;--y:250;--w:270;--r:2">…</div>
    <span class="zone-label" style="--x:160;--y:620">how long should it take?</span>
  </div>
  <ol class="tour board-only">
    <li data-unit data-target="board"><h2>…</h2><p>…</p></li>
    <li data-unit data-target="miles trip" data-target-sm="trip"><h2>…</h2><p>…</p></li>
    …
  </ol>
</main>`,
)}

- **The world** is a fixed canvas, 3400 × 2240 by default (\`data-width\`,
  \`data-height\`). Place each item with inline \`--x\` and \`--y\` (its top-left
  corner, in world pixels), \`--w\` (its width) and an optional \`--r\` (a tilt
  in degrees, within ±3). Its height is its content's. Leave 40px or more
  between items and group them into zones; a \`.zone-label\` names a zone.
- **Items** go in reading order in the markup: that is the order of the
  one-column view. Kinds: \`.paper\` (large sheets for charts and maps, under
  the strings), \`.index\` (ruled index cards, over the strings), \`.sticky\` with
  \`.gold\`, \`.rose\`, \`.blue\` or \`.sage\` (notes, on top), and \`.bare\` (a title
  or text straight on the board: no card, no pin, not clickable). \`.tape\`
  swaps the pin for tape. Each kind has a default look; restyle any of it.
- **Strings.** \`data-pin-to="troy"\` runs a string from this item's pin to the
  pin of the item with id \`troy\`; \`data-pin-to="map:6"\` runs it to point \`6\`
  of the chart in the item \`map\`, which the chart returns from \`anchor(key)\`
  (see below). Space-separate several.
- **The tour** is \`<ol class="tour board-only">\` with 8 to 14 steps, each
  \`<li data-unit data-target="id id …">\` with a heading and two or three
  sentences. The camera frames the union of those items; \`data-target="board"\`
  frames the whole board (use it for the first and last steps). Give a step
  \`data-target-sm\`, a tighter set of items, whenever its group is wider than
  one card: on a phone the panel takes the bottom 40% of the screen.
- **Legibility.** Items are read at whatever zoom frames them: body text 15px
  or more at world scale, headings 23–34px, a chart sheet 700–1200px wide.
- **Tokens** for your \`:root\`: \`--board-felt\`, \`--board-felt-2\` and
  \`--board-edge\` (the surface and its frame), \`--board-string\`,
  \`--board-pin\`, \`--board-label\`, \`--board-paper\`, \`--board-card\`,
  \`--board-ink\`, \`--board-ink-muted\`, \`--sticky-gold\` and the other sticky
  colours. The Whiteboard switch swaps the surface, string, pin and label
  tokens.`
}

/** The travel story told as a board: the git copy of the reference page, private to its trip. */
export const TRAVEL_BOARD_EXAMPLE = {
  slug: 'new-york-2026-day-3-board',
  trip: 'new-york-2026',
  path: 'apps/travel/web/content/html-stories/new-york-2026-day-3-board.html',
}

/**
 * Travel's board: one day of a trip pinned to a corkboard. The day's map is
 * the spine (a paper sheet whose chart projects the stops and anchors the
 * strings), each stop is a card with its photos taped around it, and the tour
 * walks the day in order. The map can lay a Mapbox Static Images picture
 * under its route when the deployment has a public token: a still image
 * scales with the board, where a live map canvas wouldn't.
 */
function travelBoardSection(app: HtmlStoryApp, mapboxToken: string | null): string {
  const tokenExpr = `window.${MAPBOX_TOKEN_GLOBAL} || '${mapboxToken ?? ''}'`
  const basemap = mapboxToken
    ? `- **Under the route, a real map.** Put a Mapbox Static Images picture
  under your SVG, at the same centre and zoom as your projection:
  \`https://api.mapbox.com/styles/v1/mapbox/light-v11/static/<lng>,<lat>,<zoom>,0/<w>x<h>@2x?access_token=<token>\`
  (\`w\` and \`h\` are the chart's size, at most 1280; the zoom may be
  fractional). A Web Mercator projection matches it exactly:
  \`d3.geoMercator().center([lng, lat]).scale(512 * Math.pow(2, zoom) / (2 * Math.PI)).translate([w / 2, h / 2])\`.
  Read the token as \`${tokenExpr}\`, exactly like that: the site sets
  \`window.${MAPBOX_TOKEN_GLOBAL}\` on the posted page, so a rotated token
  reaches it without a re-post. Warm it toward the paper with a CSS filter
  (\`sepia(.3) saturate(.8)\`), keep the Mapbox logo and attribution that
  come in the image, and draw the schematic below anyway, so a failed or
  refused image still leaves a map. Not Mapbox GL or Leaflet: a live map
  canvas doesn't belong inside a board that scales.`
    : `- **No live map.** This deployment has no Mapbox token, and a live map
  canvas (Mapbox GL, Leaflet) doesn't belong inside a board that scales. The
  schematic is the map: draw it carefully.`
  return `The story is the day pinned to one board: a traveller's corkboard
with the day's map as its spine, every stop a card with its photos taped
around it, a ticket stub or a tape note where the day left one, and strings
running from each stop's card to its place on the map. The reader follows the
day as a guided tour while the camera flies from stop to stop, or drags and
zooms around the board freely. Design it for a laptop first; phones get
tighter frames.

A hosted runtime does the board: the camera (it pulls back, travels and pushes
in between frames), the tour panel, the strings, pins, a minimap, a Whiteboard
switch, "Read as one page" (every item in markup order as one column, which is
also what readers without JavaScript get), full screen, keys (←/→, Esc for the
whole board, + and −), deep links (\`#step=5\`), and gestures that leave
scrolling to the page (⌘/Ctrl + wheel, or two fingers, move the board). It
loads d3 itself if the page hasn't. You write the board: the items, their
design, the map chart and the tour.

${skeleton(
  'board',
  app,
  `<main class="stage" aria-label="<the day's headline>, as a pinned board">
  <div class="world" data-width="5600" data-height="3800">
    <div class="item bare" id="title" style="--x:120;--y:110;--w:900">
      <p class="eyebrow">Day 3 · Mar 14, 2026</p><h1>New York</h1><p class="lede">…</p>
    </div>
    <div class="item paper tape" id="map" style="--x:2000;--y:150;--w:980">
      <div class="chart" data-chart="route" style="height:1280px" data-alt="Map of the day's route: …"></div>
      <p class="src">© Mapbox © OpenStreetMap · straight lines between the stops, in order</p>
    </div>
    <!-- one cluster per stop: its card, pinned and strung to the map, and its photos, taped -->
    <article class="item index" id="s1" data-pin-to="map:1" style="--x:160;--y:900;--w:380;--r:-1">
      <p class="when"><b>01</b> 7:50 AM</p><h3>The Brooklyn Bridge</h3>
      <p class="via"><i class="ph ph-train" aria-hidden="true"></i>F train · 11 min</p><p>…</p>
    </article>
    <figure class="item photo tape" id="s1-a" style="--x:580;--y:860;--w:460;--r:-2">
      <button type="button" data-full="https://…/d3-….jpg" aria-label="Open photo: …">
        <img src="https://…" alt="…" width="2560" height="1182" loading="lazy" decoding="async">
      </button>
      <figcaption>The bridge from below <time>8:02 AM</time></figcaption>
    </figure>
    <div class="item sticky gold" id="s3-note" style="--x:…;--y:…;--w:300;--r:3"><p>split one sandwich.</p></div>
    <span class="zone-label" style="--x:160;--y:820">brooklyn, first light</span>
    …
  </div>
  <ol class="tour board-only">
    <li data-unit data-target="board"><h2>…the day in one line…</h2><p>…</p></li>
    <li data-unit data-stop="1" data-target="s1 s1-a s1-b" data-target-sm="s1-a"><h2>…</h2><p>…</p></li>
    …
    <li data-unit data-target="board"><h2>The whole day</h2><p>…</p></li>
  </ol>
</main>`,
)}

- **The world** is a fixed canvas, 3400 × 2240 by default; a full day of
  photos wants more room (\`data-width\`, \`data-height\`; the reference page
  is 5600 × 3800). Place each item with inline \`--x\` and \`--y\` (its top-left
  corner, in world pixels), \`--w\` (its width) and an optional \`--r\` (a tilt
  in degrees, within ±3). Its height is its content's. Leave 40px or more
  between items.
- **Lay the day out in time.** The map is the spine; the stops go around it
  in the order they happened (morning on one side, evening on the other, or
  clockwise from the title), each stop a cluster: its card and its photos
  together, with a \`.zone-label\` in the handwriting font naming a stretch of
  the day ("brooklyn, first light", "museum mile"). Put a cluster on the side
  of the map where its stop is, when you can, so its string stays short.
- **Items** go in reading order in the markup: the order of the one-column
  view, so cluster by cluster, the day in order. Kinds: \`.paper\` (the map
  sheet, under the strings), \`.index\` (a stop's card: its number, time, how
  the travellers got there, a short paragraph, whose pick it was), photos
  (any element: a \`<figure class="item photo tape">\` mounted like a print or
  a polaroid, taped rather than pinned), \`.sticky\` with \`.gold\`, \`.rose\`,
  \`.blue\` or \`.sage\` (a tape note, the day's numbers), and \`.bare\` (the
  title, straight on the cork: no card, no pin, not clickable). A ticket stub
  or a postmark is an item too, styled your way.
- **Strings.** Every stop card carries \`data-pin-to="map:<n>"\`: the runtime
  runs a string from the card's pin to stop \`n\` on the map, which your map
  chart returns from \`anchor(n)\` (see below). Strings tie cards to places;
  don't string the photos.
- **The map is a chart** (\`Story.charts.route\`), drawn in SVG on the paper
  sheet: project the stops' \`[lng, lat]\` from the trip context with Web
  Mercator, fit to the day's stops with some margin, and draw the water and
  the land as a simple schematic (a few hand-placed shoreline points are
  enough for a city), the route as a dashed line joining the stops in order
  (the stay first and last when the day starts and ends there), and a
  numbered circle per stop with a short label. Return
  \`anchor: function (n) { return [x, y] }\` (stop \`n\`'s pixel position) for the
  strings. Make it tall and big: 900–1000px wide, as tall as the day's shape
  needs, with labels that don't collide.
${basemap}
- **The tour walks the day.** \`<ol class="tour board-only">\`: a first step on
  the whole board (\`data-target="board"\`: the day in one line), a step on the
  map (the shape of the day), one step per stop in order (\`data-target\` its
  card and photos), and a last step on the whole board. On a phone the panel
  takes the bottom 40% of the screen, so only one item fits at a readable
  size: give every step \`data-target-sm\` with the stop's best photo (or its
  ticket, or the card when the stop has no photo), and let the step's own
  text carry the words there. Each step has a heading and one to three
  sentences that add to the card rather than repeat it: the times the photos
  give, what happened between this stop and the next. Give each stop's step
  \`data-stop="<n>"\` and listen for \`story:enter\` on it to move the map
  along: the route drawn up to that stop and the stop highlighted (the
  runtime enters the step every time it is shown).
- **Photos.** Mount each like a print: a white border, a caption in the
  handwriting font with the time it was taken, a little tilt, a strip of tape.
  Link them at a display size (Supabase's
  \`/storage/v1/render/image/public/…?width=900&resize=contain\` for the
  story-assets bucket) with the original as the lightbox's \`data-full\`, and
  give each \`<img>\` its real \`width\` and \`height\` (phone photos are often
  portrait) so items keep their size before the image arrives. Don't wrap
  a whole photo in a button: the board can't be dragged by a button. A tap
  on a far-off print flies the camera there (the runtime does that); a tap
  on a print that is already close, or on a small corner button, opens it
  large in a lightbox (decide in a capture-phase click listener and call
  \`preventDefault()\`, which the runtime respects). A clip plays (muted, looped) when its stop's step is entered and
  pauses when the tour moves on; never under reduced motion.
- **Legibility.** Items are read at whatever zoom frames them: card text 16px
  or more at world scale, headings 26–34px, photos 300–560px wide, the map
  900–1000px wide.
- **Tokens** for your \`:root\`: \`--board-felt\`, \`--board-felt-2\` and
  \`--board-edge\` (the surface and its frame: cork and a wooden frame suit a
  trip), \`--board-string\`, \`--board-pin\`, \`--board-label\`, \`--board-paper\`,
  \`--board-card\`, \`--board-ink\`, \`--board-ink-muted\`, \`--sticky-gold\` and the
  other sticky colours. The Whiteboard switch swaps the surface, string, pin
  and label tokens.`
}

function deckSection(app: HtmlStoryApp): string {
  return `The reader steps through slides (a tap on the right of a slide or a
swipe goes on, the left fifth goes back; the arrow keys and Space work too), or
switches to a stack of cards and swipes them away.

A hosted runtime does the deck: the frames and the scaling, the slide and card
transitions, folios, a progress bar, the controls (a Slides/Cards switch,
"Read as one page", full screen), swipes, keys and deep links (\`#s=4\`,
\`#s=4&cards\`). "Read as one page" shows every slide in its frame, scaled into
one column; readers without JavaScript get the same column, unscaled.

${skeleton(
  'deck',
  app,
  `<main class="stage" aria-label="<headline>, as a deck">
  <div class="deck" data-title="<short title for the folios>">
    <section class="slide s-title bare" data-unit aria-label="Title">…</section>
    <section class="slide" data-unit aria-label="The cost">
      <div class="in"><div class="cols">
        <div><h2>720 men leave Troy. One comes home.</h2><p>…</p><p class="src hide-portrait">Source: …</p></div>
        <div><div class="chart" data-chart="attrition" data-alt="…"></div></div>
      </div></div>
    </section>
  </div>
</main>`,
)}

- **One point per slide**, 10 to 16 slides. A slide with more than a
  headline, two short paragraphs and one chart (or one big number, or one
  quote) holds two points: split it.
- **Three frames, one markup.** Every slide is a size container
  (\`container: slide / size\`) laid out at a fixed frame and scaled to fit:
  1280 × 720 for slides on a wide screen, 450 × 780 for slides on a phone or a
  narrow window, and 460 × 680 for every card in card mode. Write the landscape
  layout first, then adapt it inside
  \`@container slide (orientation: portrait) { … }\` (smaller type, stacked
  columns). Nothing may overflow any of the three frames: the runtime measures
  every slide at each one and warns in the browser console.
- **Helpers.** \`.in\` is the slide's padded inner box (a flex column filling
  the slide). \`.cols\` puts text beside a chart (34% and the rest) and stacks
  them in portrait; a \`.chart\` in it takes the remaining height, so it needs
  no fixed height. \`.hide-portrait\` hides an extra (a source line, a legend)
  in portrait frames. \`.bare\` slides get no folio (title slides, full-bleed
  colour).
- **Paint every slide.** Give \`.slide\` its background, border and text
  colour, and vary them for emphasis: a full-bleed colour band, a quote on the
  accent, a title slide with a faint chart behind it. \`--deck-table\` is what
  the deck sits on.`
}


function collageSection(app: HtmlStoryApp): string {
  return `The story is a cut-out collage: a kraft board with torn-paper pieces taped
to it, the way a scrapbook or a ransom note is made. Each scene is a plate: a
torn sheet of notes beside a cut-paper figure, alternating sides down the
page. The page scrolls as usual, but nothing glides. Pieces land, bars
stretch, stamps press down and numbers tick up in held poses, like stop-motion
paper, as the reader scrolls them into view. The charts are cut from paper
too: strips, blocks, strata, a dashed thread for a route. A rubber stamp on
every scene says how firm its claim is.

A hosted runtime does the collage: the board and its grain, the torn edges,
tape, slips, stamps and number patches, the stop-motion choreography from
scroll position, the cover's parallax, a sewing-thread progress rail down the
left edge with a knot per scene, and registered charts and count-ups that play
when their scene comes up the screen. Readers without JavaScript, or with
reduced motion, see every piece in its finished place. You write the pieces:
their words, their colours, their charts.

${skeleton(
  'collage',
  app,
  `<main class="stage" aria-label="<headline>, as a cut-out collage">
  <header class="cover wrap" data-unit>
    <div class="cover-grid">
      <div class="cover-text">
        <span class="slip dark enter par" data-par=".55" style="--d:.05s;rotate:-2deg">Where · What kind of story</span>
        <h1>
          <span class="strip dark enter par" data-par=".32" data-parx="-.08" style="--d:.15s;--ex:-30px">The first half of the headline</span>
          <span class="ransom enter" style="--d:.6s;--ey:40px" aria-hidden="true"><span class="boil par" data-par=".22">4</span><span class="boil par" data-par=".5">4</span></span><span class="sr">44</span>
          <span class="strip light enter par" data-par=".26" style="--d:.85s;--ey:20px">…the rest.</span>
        </h1>
        <div class="piece enter par" data-par=".12" style="--d:1s;--tilt:-.6deg"><span class="tape"></span><div class="paper" style="--cut:var(--torn-all)"><p>…the dek…</p></div></div>
        <p class="byline">…</p>
      </div>
      <figure class="piece enter" style="--d:.2s;--tilt:1.6deg;margin:0"><span class="tape r"></span><div class="paper cool">
        <div class="chart" data-chart="map" data-alt="…" style="height:420px"></div>
        <figcaption class="typed">…</figcaption>
      </div></figure>
    </div>
  </header>

  <section class="scene wrap" data-unit data-knot="1" aria-labelledby="s1-h">
    <div class="notes">
      <span class="bignum par" data-drift=".22" aria-hidden="true">1</span>
      <div class="piece fly" style="--nt:-1.2deg;--fx:-50px;--fy:40px"><span class="tape"></span><div class="paper">
        <div class="meta"><span class="slip dark">1 · Where this scene is</span><span class="stamp documented">Documented</span></div>
        <h2 id="s1-h">…the claim, with its <span class="n">44,000</span> in a patch…</h2>
        <p>…</p>
        <p class="aside">…what is argued, who says so…</p>
      </div></div>
    </div>
    <figure class="plate"><div class="piece" style="--pt:1.4deg"><span class="tape r"></span><div class="paper warm halftone" style="--cut:var(--torn-all)">
      <p class="plate-title">…what the figure shows…</p>
      <div class="cmp">
        <div class="crow"><div class="crow-h"><span>…</span><b>44,000+</b></div>
          <div class="ctrack"><div class="cbar grow" style="width:88%"></div></div></div>
        <div class="crow"><div class="crow-h"><span>…</span><b data-count="10000">10,000</b></div>
          <div class="ctrack"><div class="cbar grow fuzzy" style="width:20%;background:var(--collage-paper)"></div></div></div>
        <div class="ctick" aria-hidden="true"><span style="left:0">0</span><span style="left:50%">25k</span><span style="left:100%">50k</span></div>
      </div>
      <p class="plate-note">…scale, caveat…</p>
    </div></div></figure>
  </section>
  <section class="scene flip wrap" data-unit data-knot="2" aria-labelledby="s2-h">…</section>
  …
  <section class="band wrap" data-unit aria-labelledby="num-h">
    <div class="head"><span class="slip" style="rotate:-1.5deg;justify-self:start">Numbers</span><h2 id="num-h">…</h2></div>
    <div class="tiles">
      <div class="piece tile fly" style="--fy:70px"><div class="paper accent"><b data-count="812728">812,728</b><p>…</p><span class="src">…</span></div></div>
      …
    </div>
  </section>
  <footer class="end wrap">
    <div class="piece sheet" style="--tilt:-.3deg"><span class="tape l"></span><span class="tape r"></span><div class="paper"><h2>The route table</h2><div class="tablewrap"><table>…</table></div></div></div>
    <div class="piece sheet" style="--tilt:.4deg"><span class="tape"></span><div class="paper"><h2>Method and caveats</h2>…</div></div>
    <div class="piece sheet" style="--tilt:-.2deg"><span class="tape l"></span><div class="paper"><h2>Sources</h2><ul>…</ul></div></div>
    <p class="colophon">…</p>
  </footer>
</main>`,
)}

- **Scenes, not screens.** Plan a cover, one plate that sets the whole scale
  (a ruler, a map), 5 to 8 scenes, a band of numbers and the end matter (a
  table of everything the story visited, a method-and-caveats sheet, the
  sources). A scene is \`<section class="scene wrap" data-unit data-knot>\`:
  \`.notes\` (a \`.piece.fly\` with a \`.tape\` and a torn \`.paper\`: a numbered
  \`.slip\`, a \`.stamp\`, an \`h2\` that states the claim, a paragraph or two, an
  \`.aside\` for what is argued) beside a \`.plate\` (a \`.piece\` with a coloured
  \`.paper\` holding one figure, its \`.plate-title\` and a \`.plate-note\`). Add
  \`.flip\` to every other scene so the notes change sides. Every section is a
  \`data-unit\`; every scene has \`data-knot\` (its number on the thread rail).
- **The paper kit.** \`.piece\` is the thing on the board (\`--tilt\`, a
  shadow); \`.paper\` inside it is the torn sheet (\`--cut: var(--torn-all)\`,
  \`var(--torn-tb)\` (the default: torn top and bottom) or \`var(--torn-t)\`;
  colours \`.accent\`, \`.warm\`, \`.dark\`, \`.cool\`; textures \`.halftone\`,
  \`.ruled\`). \`.halftone\` goes only on a sheet that holds a figure (a
  \`.plate\`), never on one with running text: its dots sit over the words. \`.tape\` sits across the top edge (\`.l\` or \`.r\` for a corner).
  \`.slip\` is a typed label on a cut strip (\`.dark\`, \`.accent\`). \`.n\` sets a
  number on a patch of paper that slides in as it is read. \`.strip\` cuts a
  headline into ransom-note bands (\`.dark\`, \`.light\`, \`.accent\`) and
  \`.ransom\` makes one number out of cut digits (\`.plain\` for a comma).
  \`.bignum\` is the big outlined scene number behind the notes. Five papers
  at most, one accent, and tilts within ±2°: it is a composition, not a mess.
- **Cut the charts from paper first.** Comparison strips: \`.cmp\` of \`.crow\`
  (a \`.crow-h\` with the label and the value, then a \`.ctrack\` of \`.cbar\`s
  placed with inline \`left\` and \`width\` percentages), and a \`.ctick\` axis;
  \`.hatch\` for a claimed range, \`.fuzzy\` for an estimate with soft ends. A
  stack of blocks (\`.cstack\` of \`.blk\`, one block one unit, \`data-seq=".blk"\`
  on the stack to drop them one at a time). The format styles \`.cstack\` as
  a single bottom-up column of torn, tilted blocks, so never reuse \`.cstack\`
  or \`.blk\` for a waffle or wrapping grid of squares: your own flex or grid
  rules won't undo its \`flex-direction\`, \`clip-path\` and \`rotate\`, and the
  grid collapses into one tall column. Give a waffle its own class names
  (say \`.waffle\` of \`.sq\`). Strata, a vein, a silhouette:
  inline SVG polygons in the paper colours. Anything that needs a real
  scale (a map, a log axis, 120 squares, a line over time) is a registered
  chart (below) on its own coloured paper: every paper sets \`--c-ink\`,
  \`--c-muted\`, \`--c-grid\`, \`--c-hi\`, \`--c-paper\`, \`--c-halo\` and
  \`--font-chart\` for it, so one chart reads on any sheet.
- **Stop-motion, not easing.** Choreography is a class and an inline
  variable or two: \`.fly\` (the piece lands; \`--fx\`, \`--fy\`, \`--fr\`),
  \`.grow\` on a bar (stretches from the left), \`.swim\` on a cut-out (crosses
  its sheet; \`--sw\`), \`.ring\` on an SVG circle; inside a \`[data-seq]\`
  container, \`.seq-drop\`, \`.seq-slide\` and \`.seq-pop\` play one after
  another. \`.tape\`, \`.stamp\` and \`.n\` move on their own. On the cover,
  \`.enter\` lands a piece on load (\`--d\` staggers; \`--ex\`, \`--ey\`), \`.boil\`
  jitters a cut-out, \`data-par\` and \`data-parx\` give it parallax; a
  \`.bignum\` takes \`data-drift\`. Everything has a finished default, so a
  piece is never hidden waiting for a scroll. Don't animate running text, and
  don't add your own scroll handler: \`Story.collage.add(selector, '--p',
  from, to, steps)\` registers a new motion class instead.
- **Say how firm it is.** Every scene's \`.stamp\` is \`.documented\` (a lab
  date, a record, a census), \`.contested\` (rival claims, a disputed date) or
  \`.inferred\` (an estimate, a tradition). Hatch a claimed range, soften an
  estimate, draw a disputed span as a dashed vein, and put the contest in
  the \`.aside\`. The method sheet at the end says which numbers are fact,
  which are interpretation, and what was left off.
- **Type and colour.** Three faces: a condensed display for headlines and
  big numbers, a serif for the notes, a typewriter for slips, axes, sources
  and anything "typed". The defaults are Bricolage Grotesque, Newsreader and
  Courier Prime (load them from Google Fonts), set as \`--collage-display\`,
  \`--collage-body\` and \`--collage-typed\`. The board is kraft; the papers are
  newsprint, the accent (your \`vizmaya:theme\` accent), a warm ochre, a near
  black and a cool blue (the theme's \`accent2\`). Keep the theme meta in step
  with the board: background is the board, surface the paper.
- **Photos belong on the board too.** A real photograph is a print: a
  \`<figure class="piece">\` with a \`.tape\` and a \`.paper\` holding the
  \`<img>\` and a typed \`<figcaption>\` with its credit. Cut-outs are for what
  no photograph shows.
- **Tokens** for your \`:root\`: \`--collage-board\`, \`--collage-board-deep\`,
  \`--collage-ink\`, \`--collage-ink-soft\` (text straight on the board),
  \`--collage-paper\`, \`--collage-paper-ink\`, \`--collage-paper-soft\`,
  \`--collage-accent\` / \`-ink\`, \`--collage-warm\` / \`-ink\`, \`--collage-dark\`
  / \`-ink\` / \`-soft\`, \`--collage-cool\` / \`-ink\`, \`--collage-tape\`,
  \`--collage-shadow\`. \`data-surface="dark"\` on the stage swaps the kraft
  for slate.
- **Phones.** Under 820px a scene stacks (notes, then plate) and the cover
  goes to one column. Keep a plate's figure legible at 340px wide: shorten
  labels, fewer ticks, and \`.tablewrap\` around any table wider than that.
  The thread rail takes the left 10px, so nothing touches the left edge.`
}

function enterSection(format: PagedHtmlStoryFormat, app: HtmlStoryApp): string {
  const unit = HTML_STORY_FORMAT_META[format].unit
  const travelBoard = isTravelBoard(format, app)
  const verb =
    format === 'book'
      ? 'turned to'
      : format === 'board'
        ? 'flown to'
        : format === 'recap' || format === 'collage'
          ? 'scrolled to'
          : 'shown'
  const board =
    format === 'board'
      ? `
- The board draws every chart in its start state when it loads, so the
  overview shows the whole board; \`play()\` runs when the reader gets close.
  Make the start state readable (axes and labels drawn, data at zero).
- A chart can also return \`anchor: function (key) { return [x, y] }\` in its
  own pixels (a map projects place \`key\`), for strings to pin to.`
      : ''
  const trigger =
    format === 'recap'
      ? `Charts aren't tied to scroll position. A chart builds and plays once, when its
chapter becomes the one being read`
      : format === 'collage'
        ? `The cut-paper pieces follow the scroll; a registered chart doesn't. It builds
and plays once, when its scene comes up the screen`
        : `Nothing here is scroll-triggered. A chart builds and plays once, when its
${unit} is ${verb}`
  const maps =
    format === 'recap'
      ? `- The replay is the race's map: don't add a Mapbox or MapLibre map of the
  circuit. A map of somewhere else (the calendar, a driver's home) is a D3-geo
  chart.`
      : travelBoard
        ? `- The day's map is a chart too (see "The map is a chart" above); a map of
  somewhere bigger (the flight in, the country) is D3-geo with world-atlas
  TopoJSON. A live map canvas doesn't belong inside a scaled ${unit}.`
        : format === 'collage'
          ? `- Maps are charts cut from paper: D3-geo with world-atlas or us-atlas
  TopoJSON on a \`.paper.cool\` sheet, the land filled in a paper colour with a
  drop shadow, the route a dashed thread, each stop a numbered pin with a
  typed slip. Not a Mapbox or MapLibre canvas: a live map isn't paper.`
          : `- Maps are charts too: D3-geo with world-atlas or us-atlas TopoJSON. A Mapbox
  or MapLibre canvas doesn't belong inside a scaled ${unit}.`
  const example =
    format === 'recap'
      ? `A complete example, the 2024 Austrian Grand Prix told as a race recap:`
      : travelBoard
        ? `A complete example, day 3 of the New York trip as a trip board, is the
story \`${TRAVEL_BOARD_EXAMPLE.slug}\`:
${HTML_STORY_APP_META.travel.siteUrl}/s/${TRAVEL_BOARD_EXAMPLE.slug} (behind that trip's
password; its source is \`${TRAVEL_BOARD_EXAMPLE.path}\` in the vismay
repository). It is private, so for the runtime's mechanics alone, read the
public reference board, the Odyssey voyage told as ${TITLES[format]}:`
        : `A complete example, the Odyssey voyage told as ${TITLES[format]}:`
  return `### Charts and numbers: animate on enter

${trigger}; after a resize or a switch to the one-column view it is
redrawn in its final state. The runtime does that for the charts you register,
so don't draw them on load yourself:

\`\`\`js
Story.charts.attrition = function (el, opts) {
  var size = Story.size(el), W = size[0], H = size[1] // layout size: the frame's scale doesn't matter
  var svg = d3.select(el).append('svg').attr('viewBox', [0, 0, W, H]).attr('width', W).attr('height', H)
  // …draw the start state (bars at zero, lines undrawn), or the final state when Story.reduced…
  return {
    play: function () {
      // …animate to the final state, every duration and delay through Story.dur(ms)…
    }
  }
}
\`\`\`

- Register charts inside \`if (window.Story) { … }\`, so the page still reads
  as one column if the runtime can't load.
- Mark its place with \`<div class="chart" data-chart="attrition" data-alt="…">\`.
  \`data-alt\` is the chart's accessible label and what shows if scripts fail:
  one sentence with the numbers.
- \`opts\` is the element's \`dataset\` (\`data-labels="none"\` arrives as
  \`opts.labels\`), so one chart function can draw several variants.
- Use \`Story.dur(ms)\` for every duration and delay: it is 0 under reduced
  motion and while a chart that already played is being redrawn.
- Read colours from CSS custom properties on an ancestor (\`var(--c-ink)\`,
  \`var(--c-hi)\`) rather than hex in the chart code, so one chart reads on
  paper, on a card and on a dark slide.
- A big number counts up the first time its ${unit} is ${verb}:
  \`<span data-count="565">565</span>\`. The final value stays in the markup.
- For anything else on arrival (a highlight, a video), listen for
  \`story:enter\` on the ${unit}.
${maps}${board}

The runtime's controls take your \`vizmaya:theme\` colours. To restyle them,
set \`--vz-bg\`, \`--vz-surface\`, \`--vz-text\`, \`--vz-muted\`, \`--vz-line\` and
\`--vz-accent\` in your \`:root\`.

${example}
${formatExampleUrl(app, format)} (read its source).`
}

function recapSection(app: HtmlStoryApp): string {
  return `The story is a race told through its moments. The reader scrolls the
chapters as on any page; beside them (above them on phones) the site's 3D race
replay plays the real race, with true-scale cars and broadcast cameras, and
jumps to each moment as the reader reaches it: the lap, the camera and the car
to follow. The reader can still pause, scrub, switch camera and orbit.

A hosted runtime does the recap: the replay and its controls, the chapter nav,
dimming the chapters you aren't reading, "Read as one page" (the chapters as
one column without the replay, which is also what readers without JavaScript
get), keys (←/→ between chapters) and deep links (\`#c=3\`). You write the
chapters, their design, their charts and the cues that drive the replay.

${skeleton(
  'recap',
  app,
  `<main class="stage" aria-label="<headline>, a race recap">
  <div class="replay" data-session="<session key>" data-laps="<race laps>"
       data-alt="3D replay of the <year> <Grand Prix>"></div>
  <div class="chapters">
    <section class="chapter" data-unit data-label="Lights out"
             data-lap="1" data-cam="heli" data-focus="VER">
      <p class="kicker">Lap 1</p>
      <h2>…the chapter's point, as a headline…</h2>
      <p>…</p>
      <p data-lap="3" data-cam="tv" data-focus="LEC">…a beat: the replay moves when this paragraph reaches the reading line…</p>
      <div class="chart" data-chart="lapOne" data-alt="…" style="height:260px"></div>
    </section>
    …
  </div>
</main>`,
)}

- **The race.** \`data-session\` on \`.replay\` is the race's session key, copied
  exactly from "Replay moments" in the race context, and \`data-laps\` its lap
  count. Never invent or guess a session key: a wrong one plays another race,
  or the demo. Only a race (not a qualifying or practice session) has a replay
  worth framing.
- **Cues.** A chapter, or any element inside one, moves the replay:
  - \`data-lap="34"\`: the start of lap 34, or \`data-at="7929.9"\`: an exact
    moment, in seconds of session time. Use a \`data-at\` only when "Replay
    moments" gives one; never estimate it.
  - \`data-cam\`: \`heli\` (aerial, follows a car: starts, a gap opening
    up), \`chase\` (behind a car: a car hunting the one ahead), \`pov\`
    (onboard: a move from the driver's seat), \`tv\` (trackside: a pass, the
    flag), \`orbit\` (the whole circuit: strategy, the order), \`auto\` (a
    director that cuts to the action).
  - \`data-focus\`: the three-letter code of the car to follow.
  An element without \`data-cam\` or \`data-focus\` takes its chapter's. The
  cue in charge is the last one whose top has passed the reading line (40% down
  what the replay leaves of the screen), so cues on paragraphs a few lines
  apart move the replay as the reader reads.
- **Chapters, not cards.** Plan 6 to 10 chapters, each built around one moment
  and one point, and give each a different shape: a big number, a chart, a
  table, a quote, a timeline, small multiples, a duel told in three beats. Put
  2 to 4 beats in the chapters that carry the race (a fight that builds over
  laps; a strategy call and its payoff), so the replay walks through them.
  Open with a title chapter on the whole race (orbit or heli) and end with the
  result and what it changes in the championship.
- **Size.** On a laptop the chapter column is about 44% of the screen (560–
  640px of content), on phones the full width under the replay band. Design
  charts for about 520px wide; they can be as tall as they need: the page
  scrolls. A chapter needs at least a screenful of reading so its cues get
  time on screen.
- **The replay is the race's map.** Don't draw the circuit or embed another
  map or video of the race; draw the numbers: gaps, lap times, positions,
  speed traces, stints.
- **No controls of your own.** The replay brings play/pause, a scrubber,
  cameras and the lap; the runtime brings the chapter nav.
- **Read it without the replay.** In the one-column view the replay is gone,
  so every chapter has to make its point in words and charts, not "watch
  this".
- **Tokens** for your \`:root\`: \`--recap-rail-w\` (the chapter column on
  wide screens, 44%), \`--recap-band-h\` (the replay above the chapters on
  phones, 40svh), \`--recap-dim\` (the chapters you aren't reading, .32),
  \`--recap-cue\` (the mark beside the cue in charge). A dark page sits best
  beside the replay.`
}

/** Travel's board is its own: a day of a trip on a corkboard, strung to the day's map. */
function isTravelBoard(format: PagedHtmlStoryFormat, app: HtmlStoryApp): boolean {
  return format === 'board' && app === 'travel'
}

/**
 * "## Story format: …": replaces the scroll format's motion and Mapbox sections.
 * `mapboxToken` is the deployment's public token (./mapbox): only travel's
 * board uses it, for a static picture under the day's map.
 */
export function storyFormatSection(
  format: PagedHtmlStoryFormat,
  app: HtmlStoryApp,
  { mapboxToken = null }: { mapboxToken?: string | null } = {},
): string {
  const body =
    format === 'book'
      ? bookSection(app)
      : format === 'board'
        ? app === 'travel'
          ? travelBoardSection(app, mapboxToken)
          : boardSection(app)
        : format === 'recap'
          ? recapSection(app)
          : format === 'collage'
            ? collageSection(app)
            : deckSection(app)
  return `## ${formatHeading(format)}

${body}

${enterSection(format, app)}`
}

/** Extra lines for "Before you post", per format. */
export function formatChecks(format: PagedHtmlStoryFormat, app?: HtmlStoryApp): string[] {
  if (app && isTravelBoard(format, app)) {
    return [
      "tour steps whose items are off screen or under the panel at either size (step through the whole tour, then zoom into a few items by hand)",
      'a stop card without a string, or a string that lands on the wrong stop (every card\'s `data-pin-to="map:<n>"` must be a stop your map chart anchors)',
      'a step that doesn\'t move the map along, and photos without their real width and height (items jump as images arrive)',
      'text too small to read at the zoom that frames it, and the one-column view ("Read as one page") you haven\'t read',
    ]
  }
  if (format === 'book') {
    return [
      'any page the console says overflows its frame: split it',
      'pages you haven\'t turned to at both sizes, and the one-column view ("Read as one page") you haven\'t read',
    ]
  }
  if (format === 'recap') {
    return [
      'a data-session, data-at or lap that isn\'t copied from "Replay moments" (open the page and check the replay shows the moment each chapter describes)',
      'a chapter with no cue, or a big moment with a single cue where two or three beats would walk the reader through it',
      'the one-column view ("Read as one page") you haven\'t read: every chapter must stand without the replay',
    ]
  }
  if (format === 'board') {
    return [
      "tour steps whose items are off screen or under the panel at either size (step through the whole tour, then zoom into a few items by hand)",
      'text too small to read at the zoom that frames it',
    ]
  }
  if (format === 'collage') {
    return [
      'a piece that lands over its neighbour or hides text at either size (scroll the whole page slowly at both; every piece must settle inside its column)',
      'a scene without a stamp, or an estimate drawn as a solid bar (hatch a claimed range, soften an estimate with .fuzzy)',
      'the page with scripts off, or with reduced motion on: every piece must already sit in its finished place, and the thread rail must not cover anything',
    ]
  }
  return [
    'any slide the console says overflows a frame: split it or cut words',
    'slides you haven\'t seen in both modes (slides and cards) at both sizes',
  ]
}

/**
 * A spin's brief is a scroll brief unless it asks for a format; say which
 * paged format its kind of story tends to suit, and how to ask for it.
 */
export function formatHintSection(randomizer: RandomizerId, format: AuthorableHtmlStoryFormat): string | null {
  if (format !== 'scroll') return null
  const s = suggestedFormatFor(randomizer)
  const label = HTML_STORY_FORMAT_META[s].label.toLowerCase()
  return `## Story format

This brief is for a scrolling page. A story like this one, ${HTML_STORY_FORMAT_META[s].suits}, can also be told as a ${label}: ask for that brief instead (\`format=${s}\` on the brief URL, or \`format: "${s}"\` on \`get_html_story_brief\`).`
}
