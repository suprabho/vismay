# Deck format — vizmaya-fyi (proposal)

A second story format that sits beside the existing map-anchored format. Where the current format pairs every section with a Mapbox state, the deck format pairs every section with **a single page-level aura embed** and treats sections as slide-deck panels of composed vizslots over that backdrop.

This document is the spec engineering needs to wire it up. The companion **worked example** is `content/stories/spacex-s1-2026.*` — read that first if you want the concrete shape.

---

## 1 · Why a new format

The map format is excellent when geography is the story (Great Nicobar, IEA energy, Kashmir 1941). It is a poor fit for stories where the central artefact is **a P&L, a cap table, a benchmark, or a corporate filing** — there is no place on a map to point at. Forcing one becomes decorative.

The deck format answers: *what does a vizmaya story look like when geography is irrelevant?* The answer the design lead landed on: a corporate scrolly deck — section-snapped panels of typography + charts + images, floating over an animated aura backdrop that supplies mood without competing.

It is not a replacement. Stories pick one or the other via `format:` in frontmatter.

---

## 2 · Discriminator

Frontmatter field:

```yaml
format: "deck"     # default: "map" for back-compat
```

The story page reads frontmatter first, then routes to either the existing `MapStoryShell` or a new `DeckStoryShell`. Both consume the same `lib/content.ts` reader; the schema additions below are additive — no breaking changes to existing stories.

---

## 3 · Background — the aura embed

The deck format introduces one new vizslot module type: `aura`.

**Module config:**

```ts
type AuraLayer = {
  type: 'aura'
  slug: string              // aura.promad.design scene slug
  input?: 'off' | 'mic'     // pass-through to AuraBackground
  tint?: string             // colour cast layered onto the iframe
  tintBlendMode?: 'multiply' | 'overlay' | 'soft-light' | 'screen' | 'normal'
  fixed?: boolean           // true => fixed positioning, scrolls with viewport
}
```

**Where it lives:**

Aura is *not* placed in each section's `background:` array (that would re-mount the iframe per section — expensive). It is declared **once** at the story level:

```yaml
defaults:
  storyBackground:
    type: aura
    slug: blue-abstract-background-patriotic-stars-flowing-lines
    tint: "#070a14"
    tintBlendMode: multiply
    fixed: true
```

If `defaults.storyBackground` is omitted, the renderer falls back to `frontmatter.aura` (already wired for home-tile use). Either path produces a single `<AuraBackground slug=... />` mounted at the story-shell root, positioned `fixed inset-0 -z-10`.

**Overlay layer.** Aurora motion competes with chart legibility. Every deck gets a deterministic darken-overlay between aura and content:

```yaml
defaults:
  overlay:
    color: "#070a14"
    opacity: 0.42
    gradient:
      type: radial
      from: "rgba(7,10,20,0.20)"  # centre
      to:   "rgba(7,10,20,0.74)"  # edges
```

This is one full-bleed div with `position: fixed; inset: 0; pointer-events: none; z-index: -9`. The aura sits at z=-10; content at z=0.

---

## 4 · Foreground vizslot taxonomy

| Type        | Purpose                                       | Required keys                              |
|-------------|-----------------------------------------------|--------------------------------------------|
| `chart`     | ECharts viz (id refs `charts/<id>.json`)      | `id`, optional `caption`                   |
| `bigStat`   | The "$18.7B" archetype                        | `value`, `label`; optional `delta`, `unit`, `color`, `align` |
| `bodyText`  | Markdown prose, sliced from .md               | `from: text` (or `from: "section-id"`) ; optional `textStyle` |
| `image`     | Single image, with caption                    | `src`, `alt`; optional `caption`           |
| `imageGrid` | 2–6 image mosaic                              | `items: [{src,alt,caption}]`               |
| `quote`     | Pull quote                                    | `text`, optional `attribution`             |
| `keyValue`  | Tiny tabular insets (3-row max)               | `items: [{key, value, color?}]`, optional `title` |
| `table`     | Full tabular display                          | `columns`, `rows`                          |
| `mapbox`    | Inline map (when the story needs ONE map)     | same shape as existing `map:` block        |
| `embed`     | Iframe (videos, tweets, third-party widgets)  | `src`, optional `poster`, `aspect`, `sandbox` |
| `video`     | Native `<video>`                              | `src`, optional `poster`, `loop`, `muted`, `autoplay` |
| `rive`      | Rive animation                                | `src`, optional `viewModel`                |

Each slot also accepts `style` (= existing `VizLayerStyle`) and `panel` (= per-slot panel override of `defaults.panel`).

---

## 5 · Section model

```ts
type DeckSection = {
  id: string
  kind: 'cover' | 'bigStat' | 'bodyText' | 'split' | 'data' | 'gallery'
      | 'quote' | 'divider' | 'closing'
  text: string                  // markdown heading anchor
  heading?: string              // override the markdown heading at render
  eyebrow?: string              // cover-only
  dek?: string                  // cover-only
  paragraphs?: number | [number, number]
  mobileParagraphs?: Array<[number, number]>
  layout?:
    | 'text-left-chart-right'
    | 'text-left-quote-right'
    | 'image-left-text-right'
    | 'stat-top-chart-below'
    | 'stat-left-chart-right'
    | 'chart-top-text-below'
    | 'centered'
    | 'free'                    // honour each slot's `style.position`
  panel?: PanelStyle            // per-section override of defaults.panel
  foreground: VizSlot[]
}
```

`kind` is a semantic hint — it picks defaults (typography scale, vertical alignment, snap behaviour) so authors don't repeat themselves. `layout` is a separate hint that picks a 2- or 3-region grid template; `free` opts out and uses slot-level positioning.

---

## 6 · Scroll model

```yaml
defaults:
  scroll:
    mode: snap          # snap (default for deck) | continuous
    paddingY: "12vh"
```

**snap mode (default).** Each section is a viewport-tall panel with `scroll-snap-align: start`. Mimics a slide deck. Recommended for investor / corporate stories where each section is a deliberate "slide".

**continuous mode.** Sections flow without snap; behaves like long-form scrollytelling. Useful when a section's content varies in height (e.g. methodology blocks).

Mobile behaviour: snap stays on, but each section may subdivide into multiple snap units via `mobileParagraphs` — same mechanism as the map format.

---

## 7 · Panel styling

Foreground slots float over a single aura. They need contrast. Every slot inherits a **frosted-glass panel** from `defaults.panel`:

```yaml
defaults:
  panel:
    background: "rgba(10,14,24,0.62)"
    border: "1px solid rgba(120,140,180,0.20)"
    borderRadius: "20px"
    padding: "32px"
    backdropBlur: "18px"
    shadow: "0 24px 60px -32px rgba(0,0,0,0.65)"
```

Per-section override goes on the section; per-slot override goes on `slot.style.panel`. Setting any panel field to `null` removes that panel — useful for a cover where the hero image should bleed without a frame.

Implementation: a `<VizPanel>` wrapper component reads inherited + override fields and emits CSS. The existing `VizLayerStyle.panel` field is already in the type system (verified during research) — this spec just elevates it to deck's defaults.

---

## 8 · Theme tokens

The deck reuses the existing `theme.colors` frontmatter block. Recommended palette anchors for the SpaceX-style deck:

```yaml
theme:
  colors:
    background: "#070a14"            # body, behind aura tint
    text:       "#eef1f8"
    accent:     "#4ea8ff"            # orbital blue (Space)
    accent2:    "#71ECFF"            # signal cyan (Starlink)
    amber:      "#f4b942"            # Starship R&D / risk
    red:        "#e26d5c"            # AI burn / losses
    positive:   "#5fd28a"
    surface:    "rgba(10,14,24,0.62)" # panel base
    muted:      "#8c97ad"
    line:       "rgba(120,140,180,0.20)"
```

Charts continue to reference tokens via `$accent` / `$muted` / `$line` etc. (already supported by the ECharts theme adapter).

---

## 9 · Implementation map (what engineering needs to build)

| Surface | Today | After |
|---|---|---|
| Story page route | `app/story/[slug]/page.tsx` reads frontmatter, renders `MapStoryShell` | Branch on `frontmatter.format`: `"deck"` → `DeckStoryShell`, else `MapStoryShell` |
| Story shell | `components/story/MapStoryShell.tsx` (+ `StoryMapShell`) | New sibling `components/story/DeckStoryShell.tsx`. Mounts `<AuraBackground>` once at root, plus `<DeckOverlay>`, then renders each section through `<DeckSection>` |
| Section renderer | `MapStorySection.tsx` | New `DeckSection.tsx` reading `kind` + `layout`, dispatching to a layout grid |
| Vizslot registry | Existing `BackgroundVizSlot`/`ForegroundVizSlot` route by `type` | Add modules: `bigStat`, `quote`, `keyValue`, `table`, `imageGrid`. `aura` mounts only at story-shell level, not as a per-section slot |
| Config types | `lib/storyConfig.ts` (Zod) | Add `format`, `defaults.storyBackground`, `defaults.overlay`, `defaults.panel`, `defaults.scroll`. All optional; default `format` = `"map"` |
| Content reader | `lib/content.ts` | No change — frontmatter + yaml load is generic |
| Migration | n/a | DB `stories` already has `aura` column. No schema migration needed for the format itself; the `format` discriminator can stay in the YAML blob until/unless filtering on it is needed |

Renderer code is roughly **one new shell + one new section component + four new vizslot modules + a Zod schema extension**. The expensive engine pieces (chart pipeline, panel CSS, theme tokens, content reader) are reused unchanged.

---

## 10 · Aura scene selection

The aura catalog lives at `https://aura.promad.design/`. The vismay repo references scenes only by slug; the catalog itself is not vendored.

For the SpaceX worked example the picked slug is **`blue-abstract-background-patriotic-stars-flowing-lines`** — the only slug currently referenced elsewhere in the repo (`american-cost-divide.md`). It happens to fit SpaceX well: deep blue (orbital), star field (space), flowing lines (data, signal, satellite trails).

**To swap:** change two lines.
- `content/stories/spacex-s1-2026.md` → `aura: <new-slug>`
- `content/stories/spacex-s1-2026.config.yaml` → `defaults.storyBackground.slug: <new-slug>`

Per the `scene-context-graph` skill, the "Atmospheric Cinematic" pattern (aurora + grain + blur 15–25 + vignette 0.35–0.45 → complexity 30–40, purple-to-cyan gradients) is the recommended archetype for premium / corporate decks. Look for aurora-type scenes in the catalog when picking a final slug.

Constraints on slug choice for the deck format:
1. Aurora or liquid background type — fluid/waves move too fast under text
2. Complexity ≤ 35 — anything higher pulls focus from charts
3. Dark default palette (#000000 background) — works with the deep-space tint
4. No high-frequency texture (grain is fine; dots/grid clash with chart gridlines)

---

## 11 · Mobile

`paragraphs` on each deck section can be split via `mobileParagraphs` exactly as the map format does. Each mobile snap unit gets one foreground slot; multi-slot desktop layouts collapse to a vertical stack on mobile, ordered by `style.position.y` (top → bottom) then `style.position.x` (left → right).

Aura embed on mobile: respect `prefers-reduced-motion` — when set, the AuraBackground component already accepts an `input='off'` mode; the deck shell additionally swaps to a static poster image when reduced motion is requested. (Poster: `og:image` of the story.)

---

## 12 · PDF / print

The existing `/story/[slug]/report` and `/story/[slug]/slides` routes need to support the deck format. Two changes:

- **report (letter portrait):** aura is replaced by the deep-space tint solid colour. Sections render in document order; panels lose `backdropBlur` for print legibility.
- **slides (1920×1080):** aura *can* render statically using a single screenshot taken at story-shell mount time. Each deck section maps 1:1 to a slide.

Readiness coordinator (`lib/pdfReadiness.ts`) needs one more flag: `window.__auraReady__`, set true after the iframe load fires.

---

## 13 · Worked example checklist

The SpaceX S-1 example demonstrates every slot type the spec defines except `imageGrid`, `table`, `embed`, `video`, and `rive`:

- ✅ `cover` section with image
- ✅ `bigStat` standalone ($18.7B, 10.3M, $15B+, $1.75T)
- ✅ `split` text+chart, text+quote, image+text
- ✅ `data` stat+chart in multiple layouts
- ✅ `bodyText`-only sections (Starlink machine, Methodology)
- ✅ `closing` section with `keyValue` companion
- ✅ Pull `quote`
- ✅ Single-aura story background
- ✅ Theme override in frontmatter

Use it as the renderer's first integration test once the components land.
