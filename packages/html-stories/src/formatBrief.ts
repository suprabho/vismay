/**
 * The brief's sections for the paged story formats (./formats): book, board
 * and deck. In a brief for one of them, the scroll format's "Motion and
 * scroll animation" section and its Mapbox sticky-map pattern are replaced by
 * the format's section here: what the reader does, what the hosted runtime
 * does, the page skeleton with the runtime's URLs, the authoring rules and
 * frame size, and "animate on enter" for charts and numbers. The hosting
 * contract, design direction, icons, charts and content sections stay.
 */

import type { HtmlStoryApp } from './apps'
import {
  HTML_STORY_FORMAT_META,
  formatExampleUrl,
  formatRuntimeUrls,
  suggestedFormatFor,
  type HtmlStoryFormat,
  type PagedHtmlStoryFormat,
} from './formats'

const D3 = 'https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js'

const TITLES: Record<PagedHtmlStoryFormat, string> = {
  book: 'a book',
  board: 'a pinned board',
  deck: 'a deck',
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

function enterSection(format: PagedHtmlStoryFormat, app: HtmlStoryApp): string {
  const unit = HTML_STORY_FORMAT_META[format].unit
  const verb = format === 'book' ? 'turned to' : format === 'board' ? 'flown to' : 'shown'
  const board =
    format === 'board'
      ? `
- The board draws every chart in its start state when it loads, so the
  overview shows the whole case; \`play()\` runs when the reader gets close.
  Make the start state readable (axes and labels drawn, data at zero).
- A chart can also return \`anchor: function (key) { return [x, y] }\` in its
  own pixels (a map projects place \`key\`), for strings to pin to.`
      : ''
  return `### Charts and numbers: animate on enter

Nothing here is scroll-triggered. A chart builds and plays once, when its
${unit} is ${verb}; after a resize or a switch to the one-column view it is
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
- Maps are charts too: D3-geo with world-atlas or us-atlas TopoJSON. A Mapbox
  or MapLibre canvas doesn't belong inside a scaled ${unit}.${board}

The runtime's controls take your \`vizmaya:theme\` colours. To restyle them,
set \`--vz-bg\`, \`--vz-surface\`, \`--vz-text\`, \`--vz-muted\`, \`--vz-line\` and
\`--vz-accent\` in your \`:root\`.

A complete example, the Odyssey voyage told as ${TITLES[format]}:
${formatExampleUrl(app, format)} (read its source).`
}

/** "## Story format: …": replaces the scroll format's motion and Mapbox sections. */
export function storyFormatSection(format: PagedHtmlStoryFormat, app: HtmlStoryApp): string {
  const body = format === 'book' ? bookSection(app) : format === 'board' ? boardSection(app) : deckSection(app)
  return `## ${formatHeading(format)}

${body}

${enterSection(format, app)}`
}

/** Extra lines for "Before you post", per format. */
export function formatChecks(format: PagedHtmlStoryFormat): string[] {
  if (format === 'book') {
    return [
      'any page the console says overflows its frame: split it',
      'pages you haven\'t turned to at both sizes, and the one-column view ("Read as one page") you haven\'t read',
    ]
  }
  if (format === 'board') {
    return [
      "tour steps whose items are off screen or under the panel at either size (step through the whole tour, then zoom into a few items by hand)",
      'text too small to read at the zoom that frames it',
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
export function formatHintSection(randomizer: 'desk' | 'atlas' | 'epics' | 'footshorts', format: HtmlStoryFormat): string | null {
  if (format !== 'scroll') return null
  const s = suggestedFormatFor(randomizer)
  const label = HTML_STORY_FORMAT_META[s].label.toLowerCase()
  return `## Story format

This brief is for a scrolling page. A story like this one, ${HTML_STORY_FORMAT_META[s].suits}, can also be told as a ${label}: ask for that brief instead (\`format=${s}\` on the brief URL, or \`format: "${s}"\` on \`get_html_story_brief\`).`
}
