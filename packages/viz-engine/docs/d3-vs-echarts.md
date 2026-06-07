# D3 vs Apache ECharts — a deep dive

A working comparison for the Vismay viz engine. The engine currently ships ECharts
(`echarts@^6`, `echarts-for-react@^3`) plus deck.gl/Mapbox for geo. This doc
exists to make the trade-offs explicit so we can decide where (if anywhere) D3
should enter the stack.

---

## 1. What each library actually is

The most important thing to understand before comparing them is that **D3 and
ECharts are not the same kind of thing**. Comparing them as "charting libraries"
is misleading.

### D3 (v7) — a data-binding & DOM toolkit

D3 is a low-level kit of orthogonal modules. There is no "chart" primitive in
D3; you compose one. The pieces that matter:

- **`d3-selection`** — data joins; bind data to DOM (SVG, HTML, or canvas
  contexts) and let enter/update/exit drive rendering.
- **`d3-scale`** — linear, log, time, ordinal, band, sequential, diverging
  scales. This is the single most reusable part of D3.
- **`d3-shape`** — generators for lines, areas, arcs, stacks, links, curves.
- **`d3-axis`, `d3-format`, `d3-time-format`** — tick generation and labels.
- **`d3-hierarchy`** — treemap, partition, pack, tree, cluster layouts.
- **`d3-force`** — physics simulation for network/force graphs.
- **`d3-geo`** — projections, GeoJSON path generation, graticules.
- **`d3-zoom`, `d3-drag`, `d3-brush`** — interaction behaviors.
- **`d3-transition`** — interpolated animations on selections.
- **`d3-delaunay`** — Voronoi/Delaunay for proximity hit-testing (huge for
  scatterplots and dense charts).

D3 outputs whatever you tell it to: SVG paths, canvas draw calls, WebGL via a
companion lib, or even HTML elements. You own the render loop, the layout, and
the interaction model.

### ECharts (v6) — a high-level chart framework

ECharts is a finished product. You hand it an `option` object that describes
series, axes, tooltips, legends, dataZoom, brushes, animations, themes, and
it produces a fully interactive canvas (or SVG) chart with all the affordances
already wired. Chart types are first-class concepts: `line`, `bar`, `pie`,
`scatter`, `candlestick`, `treemap`, `sunburst`, `boxplot`, `heatmap`, `radar`,
`parallel`, `sankey`, `graph`, `funnel`, `gauge`, `pictorialBar`, `themeRiver`,
`map`, plus 3D types via `echarts-gl`.

ECharts ships with:

- **Coordinate systems**: cartesian2d, polar, geo, calendar, parallel, single,
  radar, none.
- **Components**: title, legend, tooltip, axisPointer, dataZoom (slider/inside),
  visualMap (continuous/piecewise), toolbox, brush, markPoint/markLine/markArea,
  timeline, graphic (raw shapes/text/images on top).
- **A renderer abstraction**: canvas (default) and SVG.
- **Universal transitions** between series of the same `id`.
- **Built-in theming** via JSON theme files.

In one sentence: ECharts is a configurator over a finished render engine; D3
is a builder kit you use to roll your own engine.

---

## 2. Architecture & rendering

### D3

- Default output is **SVG**. One DOM node per mark, which is what makes D3
  inspectable and accessible but caps cell count at ~10k nodes before scroll
  jank.
- For higher density, render to a 2D canvas (`d3-selection` works against
  contexts via `context.fillRect(…)` etc., or you compute layouts with D3 and
  paint with a custom canvas pass).
- For very high density, pair D3 layouts with deck.gl/regl/PIXI — D3 produces
  positions, the GPU paints.
- No virtual DOM. Updates are imperative selections; in React you either let
  React render the SVG (declarative D3-with-React) or carve out a ref and let
  D3 own the subtree.

### ECharts

- **Canvas-first** (the SVG renderer exists but is the second-class path).
- One canvas per chart instance; ECharts manages a layered z-order internally.
- Uses **ZRender** as its render engine — handles dirty-rect redraws, hit
  testing, animations on its own scheduler. Performance is good out of the box.
- Resizes are explicit (`echarts.getInstanceByDom(el)?.resize()`), but
  `echarts-for-react` handles this on prop change.
- Stateless from React's POV: you re-render by giving a new `option`.

**Vismay implication.** Our `GenericChart` already lives on canvas via ECharts,
and we've hit the canvas-alpha issue on landscape PDF export
(`packages/viz-engine/src/charts/GenericChart.tsx:142-148`). With D3-SVG that
class of bug disappears — SVG composites cleanly in the PDF pipeline — but you
trade it for SVG's node-count ceiling. On the other side, D3-canvas reintroduces
the same alpha/compositor surface area you'd have with ECharts canvas.

---

## 3. Bundle size

Numbers below are minified+gzip, approximate, as of early 2026.

| Library                          | min+gzip       | Notes                                              |
|----------------------------------|----------------|----------------------------------------------------|
| `echarts` (full)                 | ~340 KB        | Everything: all charts, components, both renderers |
| `echarts` (tree-shaken core+line+bar+canvas+grid+tooltip+legend) | ~140–170 KB | Practical floor for a "real" dashboard |
| `echarts` (custom build, single chart) | ~90–110 KB  | Lower bound; awkward to maintain                   |
| `d3` (umbrella)                  | ~85 KB         | Pulls in everything; almost no one ships this      |
| `d3-selection`+`d3-scale`+`d3-shape`+`d3-axis` (typical chart kit) | ~20–30 KB | Tree-shakes well via ESM submodules        |
| `d3-geo`                         | +18 KB         | Add for choropleths                                |
| `d3-hierarchy`                   | +5 KB          | Add for treemap/pack/partition                     |
| `d3-force`                       | +9 KB          | Add for network/force layouts                      |
| `d3-zoom`                        | +6 KB          | Add for pan/zoom behavior                          |

The headline: a hand-built D3 chart can ship in well under 30 KB; an ECharts
chart starts at ~140 KB and reuses that overhead across N charts on the page.
Past 3–4 chart types on a single page, ECharts wins on amortized size.

For Vismay specifically: we load ECharts on every story that has a chart slot,
and most stories have multiple charts. ECharts amortizes well here. Where D3
would win on size is **one-off bespoke graphics** in a story — exactly the
"hand-built explainer" use case — because we'd ship 20 KB instead of 140 KB
just for one chart.

---

## 4. Chart types: who has what natively

| Chart type        | ECharts native? | D3 native?                      | Notes                                                |
|-------------------|------------------|---------------------------------|------------------------------------------------------|
| Line / area       | ✅               | ✅ (`d3-shape.line/area`)        | Both straightforward.                                |
| Bar / stacked bar | ✅               | ✅ (manual rects)                | D3 stacks via `d3-shape.stack`.                       |
| Scatter           | ✅               | ✅                              | D3 wins on hit-testing via `d3-delaunay`.            |
| Candlestick / OHLC| ✅               | ✋ manual                       | Custom path generation in D3.                        |
| Pie / donut       | ✅               | ✅ (`d3-shape.arc`)              | D3 gives more control over label collision.          |
| Radar             | ✅               | ✋ manual                       | Radial layout by hand in D3.                         |
| Boxplot           | ✅               | ✋ manual                       | Stats computed by hand in D3.                        |
| Heatmap           | ✅               | ✋ manual                       | Trivial in both, but ECharts has visualMap.          |
| Treemap / sunburst| ✅               | ✅ (`d3-hierarchy`)              | D3's layout, your render.                            |
| Sankey            | ✅               | ✅ (`d3-sankey` plugin)          | Both fine; ECharts has nicer defaults.               |
| Graph / network   | ✅ (force/circular) | ✅ (`d3-force`)              | D3-force is the gold standard for force-directed.    |
| Choropleth / map  | ✅ (`geo`)        | ✅ (`d3-geo` + topojson)        | D3-geo is far more flexible (projections, clipping). |
| Calendar heatmap  | ✅               | ✋ manual                       | Easy enough in D3.                                   |
| Parallel coords   | ✅               | ✋ manual                       | A few hundred lines in D3.                           |
| Chord diagram     | ✋ manual         | ✅ (`d3-chord`)                  | D3 wins.                                             |
| Voronoi / Delaunay| ✋ manual         | ✅ (`d3-delaunay`)               | D3 wins.                                             |
| Beeswarm          | ✋ manual         | ✋ manual (`d3-force` based)     | Both manual; D3 idiomatic.                           |
| Cartogram         | ❌               | ✅ (with plugin)                | D3-only.                                             |
| Hexbin            | ❌               | ✅ (`d3-hexbin`)                 | D3-only.                                             |
| 3D (globe, surface)| ✅ via `echarts-gl` | ✋ via three.js              | ECharts wins for quick 3D.                           |
| Storytelling/scrolly | ❌            | ✅ (with scrollama etc.)        | D3 is the standard.                                  |

The pattern: **ECharts covers the dashboard staples**; D3 covers the
**editorial/data-journalism** types and anything bespoke. If a chart appears in
a Reuters Graphics, NYT Upshot, or FT Visual & Data piece, it was almost
certainly D3 (or a thin layer over D3).

---

## 5. Interaction model

### ECharts
- Tooltips, axis pointers, legend toggling, dataZoom, brush, click/dblclick,
  cross-filtering between charts (`connect`), action API
  (`chart.dispatchAction({ type: 'highlight', … })`).
- Behaviors are configured, not coded. Limit: anything the option schema
  doesn't expose is hard. Common escape hatch is the `graphic` component to
  draw on top, plus `chart.on('mouseover', …)` for raw events.
- Mobile: tap-to-show tooltips work, but on small charts the default tooltip
  can occlude the chart. We already special-case this
  (`packages/viz-engine/src/charts/GenericChart.tsx:155-159` — hide tooltip on
  mobile).

### D3
- Interaction is just DOM events on the elements you drew. Total freedom.
- `d3-zoom`, `d3-drag`, `d3-brush` give you composable behaviors that work
  across SVG/canvas.
- `d3-delaunay` is the secret weapon for scatterplots: build a Voronoi, route
  pointer events to the nearest point in O(log n). Smoother than per-point
  hit-testing.
- Downside: you build the tooltip, the legend, the focus ring, the keyboard
  affordances. Easy to ship a chart with worse a11y/UX than ECharts gives you
  for free.

---

## 6. Animation

| Aspect                 | ECharts                                            | D3                                          |
|------------------------|----------------------------------------------------|---------------------------------------------|
| Enter/exit             | Automatic per series + `animationDelay` functions  | Manual via `selection.transition()`         |
| Morph between series   | **Universal transitions** (same `id`) — excellent  | Manual (interpolate paths via `d3-interpolate`) |
| Easing                 | Built-in named easings                             | `d3-ease` with the full curve palette       |
| Frame rate             | Canvas, dirty-rect, generally smooth               | SVG transitions can jank past ~1k nodes     |
| Choreography           | Per-element delay via callback                     | Full control, but you write the timeline    |
| GSAP interop           | Awkward (you'd animate `option` state)             | Natural (GSAP can tween any DOM attr)       |

Vismay already loads GSAP for slot-level motion. D3 charts would compose with
GSAP cleanly (GSAP tweens DOM attributes on SVG marks D3 created). ECharts
internalizes animation, so GSAP doesn't help inside the chart.

---

## 7. Theming

### ECharts
- Theme is a JSON object passed at `init()`: `color` palette, `textStyle`,
  per-component defaults. ThemeBuilder UI exists.
- We've layered our own approach: token strings like `"$accent"` in JSON
  options, swapped at render time
  (`packages/viz-engine/src/charts/GenericChart.tsx:49-65`). This works well
  and is the right pattern for a content-driven engine — story frontmatter →
  CSS vars → palette → swapped into options.
- ECharts theme files are a separate concept; we mostly bypass them via
  per-option color overrides.

### D3
- No theme primitive. You write your own. The good news: the CSS-var pattern
  we already use plugs straight in — render with `fill="var(--color-accent)"`
  and CSS does the rest.
- Means **less indirection** for content-driven theming, because there's no
  ECharts option schema in the middle.

If we ever want a story author to write "make this line $accent and this band
$muted" with full IDE support, D3 + CSS vars is structurally simpler than the
JSON token-replacement trick we're doing now.

---

## 8. Server-side rendering

Both have real SSR stories, but they look different.

### ECharts
- Has an **official SSR mode** via `init(null, null, { renderer: 'svg', ssr: true, width, height })`.
- Outputs a string of SVG you can ship in the initial HTML.
- Caveat: interactions don't work on the SSR'd SVG; you'd hydrate by mounting
  ECharts client-side over the same node.
- Vismay's PDF/share-card pipelines could benefit here — render once
  server-side, screenshot, done — no need to spin a headless browser through a
  hydration cycle.

### D3
- Pair with `jsdom` (or `linkedom`) to run D3 selections in Node, serialize
  the SVG, ship it. Standard practice in editorial workflows.
- No interactions in SSR output either, but you don't need a separate
  rendering mode — same code runs in Node and the browser.
- Cleanest path for **static SVG export** (e.g. story share cards) because
  there's no canvas/PDF compositor in the loop.

For Vismay's share-card doctor and PDF export workflows, D3-SVG → static SVG
is unambiguously the simpler pipeline. ECharts can do SVG too, but the API is
shaped around the canvas path.

---

## 9. Accessibility

- **ECharts**: `aria` config block builds a textual summary, optional decals
  for color-blind users, keyboard nav only via `tab` to the canvas (which is a
  single node — you can't tab to individual marks). Screen reader support is
  basic.
- **D3 + SVG**: each mark is a real DOM node — you can `role`, `aria-label`,
  `tabindex` per element. Ceiling is much higher; floor is whatever you build.

For editorial content with explicit accessibility goals, D3-SVG gives you the
hooks. For dashboards that just need "passes audit", ECharts' built-in
support is faster to ship.

---

## 10. TypeScript

| Aspect             | ECharts                                  | D3                                              |
|--------------------|------------------------------------------|-------------------------------------------------|
| Types shipped      | `import type { EChartsOption }`          | Each submodule's types (`@types/d3-*` or built-in) |
| Schema discoverability | Very strong — autocomplete on every nested key | Per-module; you assemble the type story yourself |
| Generic data types | Loose — `series.data` is mostly `any[]`  | Strong — `Selection<G, Datum, P, PDatum>` is precisely typed |

ECharts' option type is one of the best schema-typed APIs in the chart space.
The downside is that `series.data` is intentionally loose — you can't get
type-safe access to `d.fooBar` inside a formatter without casting.

D3's types track the actual data through the join. Once you set up
`d3.select<HTMLDivElement, MyDatum>(…)`, the rest of the pipeline knows about
`MyDatum`. Better for refactor safety.

---

## 11. License & governance

- **D3**: ISC license, BSD-style. Mike Bostock, Observable. Tiny independent
  modules. Used everywhere in editorial graphics.
- **ECharts**: Apache 2.0. Originally Baidu, donated to Apache Software
  Foundation in 2018 as a top-level project. Active development, predictable
  release cadence (v6 in 2025).

Both fine for closed-source commercial use. ECharts' Apache 2.0 has a patent
grant; D3's ISC does not (but D3 has no patents to grant).

---

## 12. Learning curve & maintenance

- **ECharts**: read the option schema. 80% of charts you'll ever ship are
  written by Googling "ECharts X chart" and adapting. The schema is large but
  consistent. Onboarding cost: ~1 day to be productive.
- **D3**: read enough of the modules you're using. There's no "ECharts schema"
  to lean on — you have to actually understand scales, joins, generators. The
  modules are small and well-documented, but the conceptual ramp is steeper.
  Onboarding cost: ~1 week to be productive on a chart you've never seen.

**Maintenance**: ECharts code is short, declarative, and obvious 6 months
later. D3 code is more verbose and rewards code-comment discipline — but it
also doesn't have a giant config schema to memorize, and Stack Overflow
answers from 2014 still mostly work.

---

## 13. Where each one breaks down

### ECharts pain points (real)
1. **Anything off the happy path** — once you need a layout the option
   schema doesn't model, you fight the system. The `graphic` and `custom`
   series exist as escape hatches but they're awkward.
2. **Canvas alpha / PDF / print** — exactly the bug we hit in `GenericChart`.
   The canvas backend isn't a perfect substitute for SVG in print pipelines.
3. **Bundle size for one-off charts** — paying 140 KB to render a single
   bespoke explainer is wasteful.
4. **Hover/tooltip on mobile** — the default tap-to-show model is fiddly; we
   already hide it (`GenericChart.tsx:155`).
5. **Cross-chart interactions beyond `connect()`** — possible via the action
   API but verbose.
6. **Type-safe formatters** — you'll cast `params.value` a lot.

### D3 pain points (real)
1. **You build everything.** Tooltips, legends, axis labels that don't
   overlap, color-blind decals, RTL, mobile sizing. Each is solvable; each is
   work.
2. **SVG perf ceiling** — past ~5k–10k marks, switch to canvas, which means
   rewriting the render path.
3. **React friction** — D3's imperative model fights React. You pick one of:
   (a) let D3 own a ref'd subtree and React stay out, (b) compute with D3,
   render with React (no `selection`/`transition` magic), or (c) library on
   top (`visx`, `nivo`, `recharts`). Each has trade-offs.
4. **No "kitchen sink" defaults** — your first chart looks ugly. Compare to
   ECharts where the first render already has tooltip + legend + axes
   styled.
5. **Animation choreography is manual** — universal transitions in ECharts
   are genuinely a feature with no D3 equivalent shy of writing it.

---

## 14. Common middle-ground libraries

It's worth naming these because the binary D3-vs-ECharts framing leaves out
the most popular choices:

- **`visx`** (Airbnb): React components wrapping D3 modules. You write JSX,
  D3 does math. Good ergonomics when you want D3's flexibility inside React.
- **`recharts`**: React, SVG, opinionated chart components. Easy to start,
  hard to customize past a point.
- **`nivo`**: React + D3, server-rendered SVG support, beautiful defaults.
  Heavier than `visx`, more polished than `recharts`.
- **`vega-lite` / `vega`**: declarative grammar of graphics, JSON-based like
  ECharts but academically grounded. Stronger statistical/exploratory
  vocabulary; weaker presentation polish.
- **`plot`** (Observable Plot): the spiritual successor to D3 for "I just
  want a chart" cases — concise grammar-of-graphics on top of D3. Worth
  considering for the editorial side specifically.

For Vismay's editorial use case, **Observable Plot** is probably the most
underrated option — it's D3's flexibility with ECharts-level brevity for
the chart types it supports.

---

## 15. Decision framework for Vismay

Given the engine's current shape (ECharts for charts, deck.gl/Mapbox for geo,
JSON-driven generic chart, story-themed colors via CSS vars, PDF/share-card
exports, mobile constraint, Next.js app):

### Keep ECharts as the default
For every chart that fits the dashboard-staples list (line/bar/area/scatter/
pie/treemap/candlestick/sankey/heatmap) — ECharts wins. The JSON-driven
authoring model we already have at
`packages/viz-engine/src/charts/GenericChart.tsx` only makes sense over a
config-schema library. Rewriting that on D3 means writing our own schema.

### Add D3 (probably as Observable Plot or `visx`) for two specific cases

1. **Bespoke editorial graphics.** A chart that exists for one story only and
   doesn't fit a standard type — beeswarm, hexbin, chord, custom path
   illustration with annotated callouts. Today these become
   `packages/viz-engine/src/charts/HeliumPriceChart.tsx`-style hand-built
   ECharts files that bend the schema. They'd be cleaner as D3 modules.

2. **Static SVG export for share cards / PDFs.** The canvas-alpha workaround
   in `GenericChart.tsx:142-148` is a symptom: the chart pipeline wants to
   produce print-quality SVG and our default renderer wants canvas. A
   D3-SVG (or Plot-SVG) path for the export-only case would side-step the
   compositor entirely and let us ship vector-perfect PDFs.

### Do NOT
- Replace ECharts wholesale. The amortized cost of 140 KB across our
  multi-chart stories is much smaller than the cost of re-implementing
  tooltips, axis-pointers, dataZoom, legend, and themes from scratch.
- Mix D3 and ECharts in the same chart instance. Pick one renderer per
  chart and let them compose at the story level.

### Concrete next-step proposal

If we want to validate this, the cheapest experiment is:

1. Pick one existing hand-built chart (e.g. `PolarExposureChart.tsx`, 128
   lines) and reimplement it in Observable Plot or `visx`. Compare:
   bundle delta, SSR output, PDF render quality, code length, perceived
   polish.
2. Build one share-card variant that uses D3-SVG SSR end-to-end (no
   client hydration) and run it through the share-card doctor pipeline.
   See if it eliminates the alpha workaround and improves vector quality.

If both experiments come back positive, add `d3` + `@observablehq/plot` as
peer dependencies of `viz-engine`, document the "when to reach for which"
rule, and migrate bespoke charts opportunistically.

---

## TL;DR

- D3 is a kit; ECharts is a product. They aren't really substitutes.
- ECharts is the right default for dashboard staples and JSON-driven content.
- D3 (or Observable Plot, or visx) is the right tool for one-off editorial
  graphics and for SVG-first export pipelines.
- For Vismay specifically: keep ECharts, add a D3-family tool for bespoke
  charts and static export. Don't replace.
