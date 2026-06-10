# Map-story authoring

How to write a `<slug>.config.yaml` for a `format: map` story — and how the
"legacy" hand-built stories and the "new" pipeline-generated stories actually
relate. Short version: **they are the same schema.** There is nothing to
migrate; there are only different *subsets* of one config to reach for.

Reference exemplars in `content/stories/`:

| File | Style | Why look at it |
|---|---|---|
| `kashmir-1941-land-reform.config.yaml` | Cartographic + **choropleth** | Areal data shaded per district via `map.regions` |
| `_sample-adani-map.config.yaml` | Cartographic + **pins** | Point/site data; prose rail over a pin map |
| (git history of the same Adani file) | Deck-over-map | `foreground` panels floating over the map |

---

## 1. One schema, not two

Both hand-built and generated stories validate against a single type,
[`StorySectionConfig`](../../../packages/viz-engine/src/lib/storyConfig.types.ts).
The loader,
[`loadStoryConfig`](../../../packages/content-source/src/storyConfig.ts), has
exactly one branch that distinguishes "old" from "new":

```ts
// storyConfig.ts — paraphrased
const usesNewSchemaSlot = section.background !== undefined || section.foreground !== undefined
if (!usesNewSchemaSlot) {
  // legacy map story → require map.center + map.zoom
}
```

That's the whole distinction. Everything else — `map`, `map.regions`,
`map.pins`, `text`, `mobileParagraphs`, `chart`, `kind`, `eyebrow`, `subsections`
— is shared and available regardless of which fields you populate. The only
genuinely deprecated field is `chart:` (annotated *"Legacy — prefer
`foreground`"* in the type), and even it still works and is the right tool for
cartographic stories (see §4).

So don't "rewrite all the YAMLs into the new format." There is no new format to
rewrite into. Pick the right **mode** per story, and the right **kind** per
section.

---

## 2. The three valid styles (and the one anti-pattern)

A map story can render in one of three legitimate styles. They differ only in
which fields a section uses:

- **A — Cartographic prose rail** *(Kashmir, repaired Adani)*. The map is the
  subject; the page scrolls a rail of prose (`text` + `mobileParagraphs`); the
  camera flies between framings; data lands as `map.pins`, `map.regions`
  (choropleth), or a `chart: data:<id>`. **No `foreground:`.**
- **B — Map-forward overlay** *(Adani, git history)*. A persistent ~40vw side
  panel (`layout: panel-left` / `panel-right`) holds a `bigStat`/`keyValue`/
  `chart`, leaving the rest of the viewport for a pin map. Built specifically
  for map stories — see the doc comment on `sidePanel()` in
  [`foregroundLayouts.ts`](../../../packages/viz-engine/src/foregroundLayouts.ts).
- **C — Deck (full-bleed panels)**. `foreground` layouts like
  `stat-left-chart-right` fill the viewport; the map, if any, is a backdrop.
  Correct for stat/chart-driven decks; **wrong for a map story** — a full-width
  panel buries the globe and suppresses the narrative. This is the anti-pattern
  the generator used to emit for map stories.

**A and B are mutually exclusive per section** — see §3.

---

## 3. The load-bearing rule: `foreground` suppresses the prose rail

This is the single fact that explains why generated map stories "look nothing
like" the hand-built ones. In
[`MapStorySection.tsx`](../../../packages/story-reader/src/components/story/MapStorySection.tsx):

```ts
const DECK_KINDS_NO_TEXT_CARD = new Set([
  'bigStat','bodyText','split','data','gallery','quote','divider','closing',
])
```

If a section's `kind` is in that set, **its prose rail is not rendered** — the
copy is expected to live inside `foreground` viz slots instead. So a section
with rich markdown body text but `kind: data` shows *none of it*. That is
exactly what happened to the Adani sample: every section used a deck kind, so
its entire `.md` narrative was dark.

| `kind` | Renders prose rail? | Use for |
|---|---|---|
| `text` (default) | ✅ yes | Narrative section |
| `hero` | ✅ title/eyebrow card | First section / story title |
| `cover` | ✅ (aliases to hero) | Same as hero |
| `stat` | ✅ + big number | A single headline number (the `text:` *is* the number) |
| `bigStat`,`bodyText`,`split`,`data`,`gallery`,`quote`,`divider`,`closing` | ❌ **suppressed** | Deck/overlay sections — copy lives in `foreground` slots |

**Rule of thumb for a cartographic (style A) section:** use `kind: text` (or
`hero`/`stat`), attach charts with `chart:`, and never set `foreground:`.

---

## 4. Charts: `chart: data:<id>` vs `foreground` chart

Both fetch the same JSON (`content/stories/<slug>/charts/<id>.json`, served via
`/api/chart-data/<slug>/<id>`). The difference is *where they render and what
they suppress* — see
[`ChartPanel.tsx`](../../../packages/viz-engine/src/charts/ChartPanel.tsx):

- `chart: data:<id>` → renders in the **shell's chart panel**, *alongside* the
  prose rail. The text card dodges the chart's real estate. **Use this in
  cartographic stories.**
- `foreground: { regions: { chart: [{ type: chart, id: <id> }] } }` → renders as
  an overlay panel and **suppresses the prose rail** (it occupies a deck kind's
  slot). Use this only in styles B/C.

`data:<id>` is the explicit legacy form; a bare `chart: <id>` also works (it
first checks the hardcoded component registry, then falls back to the same JSON
fetch). Prefer `data:<id>` in cartographic configs for clarity and to match
Kashmir.

---

## 5. The `regions` name collision (read this once)

Two unrelated things are both spelled `regions`:

- **`map.regions`** → a geographic **choropleth** layer
  ([`MapRegionLayer`](../../../packages/viz-engine/src/types/story.ts)): GeoJSON
  features shaded by value. This is cartography.
- **`foreground.regions`** → **layout slots** (named `text`/`chart`/`stat`/
  `left`/`right`) of a registered `foreground` layout. This is composition.

They live under different parents so they never collide at runtime, but they
*will* collide in your head and in any prompt. When in doubt: `map.regions` =
"shade the land"; `foreground.regions` = "where the panels go".

A common silent failure in generated/hand-edited configs: using slot names that
don't match the layout's registered keys. `stat-left-chart-right` registers
`stat` and `chart` (not `left`/`right`); unmatched slot names drop silently.
The registered keys live in
[`foregroundLayouts.ts`](../../../packages/viz-engine/src/foregroundLayouts.ts).

---

## 6. Choropleth (`map.regions`) — when and how

A choropleth shades **areas by a value**, so it's only appropriate when your
data is **areal** (a metric per district/state/country). Kashmir is the
canonical case: Muslim share of population per 1941 district.

```yaml
# kashmir-1941-land-reform.config.yaml — abridged
map:
  center: [76.0, 34.3]
  zoom: 5.7
  regions:
    level: custom                         # 'country' = built-in world; 'custom' = your GeoJSON
    geojsonUrl: "/data/jk-1941-districts.geojson"
    idProperty: "id"                      # feature property that matches `code` below
    ramp:   [20, 60, 96]                  # value domain stops
    colors: ["$surface", "$teal", "$accent"]   # theme-token color stops
    lineColor: "$background"
    lineWidth: 0.5
    legend: { show: true, title: "Muslim share, 1941", lowLabel: "20%", highLabel: "96%", position: "bottom-left" }
    items:
      - { code: "anantnag", value: 94 }
      - { code: "srinagar", value: 88 }
      # …one item per feature; `code` matches the GeoJSON `idProperty`
```

Custom GeoJSON goes in `public/data/` (clipped/simplified offline; Kashmir's
header documents its provenance). Items can also carry explicit
`{ code, color, opacity }` for a categorical fill instead of a value ramp.

**Don't force a choropleth onto point data.** A story about specific *sites*
(airports, plants, corridors) is point-shaped — use `map.pins`, not a contrived
state shading. The repaired Adani sample is deliberately pins-only for this
reason; its one genuinely areal slice (silo contracts by state) is flagged in a
comment as the place a choropleth *could* attach if per-state values were
sourced.

---

## 7. Rosetta: recreating the "old format" (it's already the schema)

| Intent | Cartographic field (styles A) |
|---|---|
| Section headline / markdown anchor | `text:` (matches a `#`/`##` heading, level-agnostic) |
| Narrative body | the markdown under that heading, rendered by the prose rail |
| Portrait paragraph splitting | `mobileParagraphs: [0, 1, 2, …]` (one entry = one portrait snap; isolate long paras — portrait clips, doesn't scroll) |
| Big single number | `kind: stat` with the number in `text:` |
| Story title card | `kind: hero` + `eyebrow:` on the first section |
| A chart | `chart: data:<id>` (JSON in `<slug>/charts/<id>.json`) |
| Places | `map.pins: [{ coordinates: [lng, lat], label, color, radius, pulse, labelAnchor }]` |
| Shaded areas | `map.regions` (choropleth — §6) |
| Camera per section | `map: { center: [lng,lat], zoom, pitch, bearing, opacity }` |

There is no field here that the "new" schema lacks — these all live on the one
`StorySectionConfig`.

---

## 8. Worked example: Adani deck → cartographic

`_sample-adani-map` is the before/after. The `.md` prose and the chart JSONs
were always fine; only the config changed.

**Before (deck, prose dark):**
```yaml
- id: the-airport-clean-sweep
  kind: data                       # ← deck kind: suppresses the prose rail
  foreground:
    layout: panel-right
    regions:
      chart: [{ type: chart, id: airport-bids-comparison }]
      text:  [{ type: keyValue, title: …, items: [...] }]   # abbreviated copy
  map: { center: [76.5, 24], zoom: 5.2, pins: [...] }
```

**After (cartographic, prose renders):**
```yaml
- id: the-airport-clean-sweep
  text: The Airport Clean Sweep    # ← matches the `## The Airport Clean Sweep` heading
  kind: text                       # ← prose rail renders the full markdown body
  chart: data:airport-bids-comparison   # ← chart sits beside the prose, no suppression
  mobileParagraphs: [0, 1, 2, 3, 4]
  map: { center: [76.5, 24], zoom: 5.2, pins: [...] }   # pins unchanged
```

The conversion is purely: drop `foreground:`, set a non-deck `kind`, move the
chart to `chart: data:<id>`, add `mobileParagraphs`. Pins, camera, and prose are
untouched.

---

## 9. For the generator (pipeline convergence)

The reason to standardize on style A for map stories isn't aesthetic — it's that
the prose the pipeline writes only renders under non-deck kinds. When generating
a `format: map` story, the pipeline should:

1. Emit `kind: text`/`hero`/`stat`, **not** deck kinds, for narrative sections.
2. Attach charts via `chart: data:<id>`, not `foreground` chart slots.
3. Emit `map.regions` (two-pass: requirement → data → `buildRegionLayer`, see
   [`regions.ts`](../../../packages/story-pipeline/src/regions.ts)) **only when
   the metric is areal**; otherwise emit pins.
4. Reserve `foreground`/`panel-*` for genuinely deck-shaped stories.

This is the convergence point: same schema, correct subset.
