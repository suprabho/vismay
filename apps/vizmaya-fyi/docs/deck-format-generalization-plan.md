# Plan: Generalize StoryMapShell to support multiple story formats

> Companion to [deck-format-spec.md](deck-format-spec.md). The spec describes
> *what* the deck format looks like to authors; this plan describes *how* we
> evolve the engine to support it (and any future formats) without forking the
> shell.

## Status — as of June 2026

**Phases 0–6 are shipped.** Five deck stories are live (`spacex-ipo-2026`,
`spacex-s1-2026`, `money-in-politics-2026`, `paris-road-to-budapest`,
`vizmaya-studio`), so the format is past its "ship spacex" milestone. The work
landed across two commits — `feat(deck-format): generalize story shell…` and a
follow-up `refactor(story-reader): extract vizmaya reader…` — rather than the
six incremental PRs sketched at the bottom of this doc.

| Phase | State | Notes |
|---|---|---|
| 0 · Schema foundations | ✅ Done | `SectionKind`, `StoryDefaults` (`storyBackground`/`overlay`/`panel`/`scroll`/`chart`), `StoryBackgroundConfig`, optional `section.map`/`section.panel`, `frontmatter.format` all landed. |
| 1 · Optional `section.map` | ✅ Done | Guarded in `resolveSlots`, `PersistentComponent`, `storyMapOverrides`. |
| 2 · Page-level background | ✅ Done | `StoryBackgroundSlot` + `StoryBackgroundOverlay`; print-mode solid-color swap (2.5) included from the start. |
| 3 · Foreground modules | ✅ Done | All six (`bigStat`, `bodyText`, `quote`, `keyValue`, `table`, `imageGrid`) + the `map` foreground alias. |
| 4 · Foreground layouts | ✅ Done | All eight registered (`DECK_LAYOUT_NAMES`). |
| 5 · Kind taxonomy | ✅ Done | Section-text suppression gate shipped (see naming note below). |
| 6 · Cross-cutting pipelines | ✅ Done | Zero-map video short-circuit + print-mode aura swap both in place (details under Phase 6). |
| 7 · Deck editor | 🟡 Partial | Form-based **slot** editing shipped in the Rete Canvas editor (`SlotFormModal` + `VizConfigForm`); new-slide creation & drag-drop regions still deferred. See Phase 7. |
| 8 · DB-backed content | ➖ Separate track | Schema keys ride along with the `feat/db-backed-content` migration. |

**Two deviations from the plan as written:**

1. **Reader extraction.** The shell and editorial blocks were pulled into a
   shared package, **`@vismay/story-reader`**. Components this plan files under
   `components/story/…` now live in
   `packages/story-reader/src/components/story/…`; the vizmaya app keeps thin
   adapters (e.g. `apps/vizmaya-fyi/components/story/StoryShell.tsx`) that inject
   brand chrome (logo + next/link home link). Paths below predate the
   extraction — translate accordingly.

2. **As-built names differ from this plan's working names:**
   - `StoryMapShell` → **`StoryShell`** (done; a deprecated `StoryMapShell`
     alias is re-exported from `@vismay/story-reader` for one release cycle).
   - `AuraBackdrop` → **`AuraBackground`** (vizmaya's host-injected aura
     component, passed into `StoryBackgroundSlot` via its `AuraComponent` prop).
   - `suppressSectionText` → **`DECK_KINDS_NO_TEXT_CARD`** / `suppressForDeckKind`
     in `MapStorySection.tsx`.

## Architectural premise

Investigation surfaces good news: the shell's core scroll engine, viz registry,
panel styling, and PDF/video pipelines are already format-agnostic. The hard
couplings to maps are narrow — three files — and the deck spec's panel/region/
portrait concerns map cleanly onto the existing engine. The work is mostly
**additive** (new modules, new layouts, new kinds, page-level backdrop) rather
than a rewrite.

### What stays

- `StoryMapShell`'s IntersectionObserver + `activeUnit` flow
  (`components/story/StoryMapShell.tsx` lines 60, 144-165)
- The viz registry + `VizModule` contract (`packages/viz-engine/src/registry.ts`)
- `ForegroundVizSlot` + `ForegroundLayoutSlot` + `foregroundLayouts.ts`
- `VizLayerStyle` + `VizLayerPanel` (already supports frosted-glass)
- `useStoryReadiness` (already handles `expectedSignals=0`)
- The PDF/video/OG/TTS pipelines (already walk `[data-unit-index]`)
- All existing legacy stories — zero behavioral change

### What changes

- Make `section.map` truly optional (defensive reads in 3 spots)
- Add a **page-level** `storyBackground` slot (the aura, mounted once, not
  per-section)
- Add 6 new foreground modules + ~7 new layouts as registry entries
- Extend `SectionKind` union and add render branches in ~10 files
- Add deck-specific schema (`defaults.storyBackground`, `defaults.overlay`,
  `defaults.panel`, `defaults.scroll`)
- ~~Rename `StoryMapShell` → `StoryShell`~~ ✅ **Done** (the "map" was always a
  misnomer once backgrounds became pluggable). A deprecated `StoryMapShell`
  alias is re-exported from `@vismay/story-reader` for one release cycle.

---

## Phase 0 · Schema foundations *(no UI changes yet)*

Goal: a single typed surface authors target. Land this first so subsequent
phases compile against a stable shape.

### 0.1 Extend `storyConfig.types.ts`

`packages/viz-engine/src/lib/storyConfig.types.ts`

- `SectionKind` union → add `'cover' | 'bigStat' | 'bodyText' | 'split' |
  'data' | 'gallery' | 'quote' | 'divider' | 'closing'`. Keep `'hero' | 'stat'
  | 'text'` as the original triple (`cover` ≈ hero, `bigStat` ≈ stat,
  `bodyText` ≈ text — handled in Phase 5).
- `StoryDefaults` extend with:
  - `storyBackground?: StoryBackgroundConfig`
  - `overlay?: OverlayConfig`
  - `panel?: VizLayerPanel`
  - `scroll?: { mode: 'snap' | 'continuous'; paddingY?: string }`
  - `chart?: { theme?: string; grid?: object }`
- `StorySectionConfig.map` → mark optional in the type (already optional at
  runtime in `resolveSlots.ts:94`; the type just hasn't caught up).
- Add `StorySectionConfig.panel?: VizLayerPanel` (per-section override).
- Define `StoryBackgroundConfig` discriminated union:
  `{ type: 'aura', slug, input?, tint?, tintBlendMode?, fixed? }`
  `| { type: 'image', src, fit?, position? }`
  `| { type: 'color', value }`
  `| { type: 'none' }`

### 0.2 Frontmatter format discriminator

`packages/content-source/src/content.ts`

- Add `frontmatter.format?: 'map' | 'deck'`. Default to `'map'` when absent so
  every existing story is unaffected.
- Surface it in `getStoryContent()` return type.

### 0.3 Validator + zero-churn fallback

- `loadStoryConfig` should default `format` to `'map'` so the `format` field
  becomes the sole switching point downstream.
- Add a validator: if `format === 'deck'` and any section has `map:` set, warn
  (not error) — likely an author mistake.

**Output:** one PR, types-only, no runtime change. Existing stories typecheck.

---

## Phase 1 · Make `section.map` defensively optional in the shell *(no new behavior)*

Goal: every legacy story still renders identically, but the shell no longer
assumes `section.map` exists. Pre-req for the deck shell sharing the same
shell.

Three hard reads to fix:

### 1.1 `resolveSlots.ts:94`

Already guarded — `if (section.map && Array.isArray(section.map.center))`.
Verify and tighten the type guard. No-op runtime-wise.

### 1.2 `PersistentComponent.tsx:86-192`

The big one. The cascade `apSub?.center ?? apParent?.center ?? subOver?.center
?? cfg?.center ?? parentMap.center` assumes a map step is always derivable.
Behavior to add: if all candidates are nullish AND no `background:` map layer
exists for the unit, emit no map step for this unit (the persistent map
instance unmounts via `BackgroundVizSlot`).

### 1.3 `storyMapOverrides.ts`

Used only by autoplay video render. If `section.map` is absent, `mapToView()`
should return `null` and overrides should no-op for that section.

### 1.4 Tests

Add a story fixture with NO `section.map` on any section, NO `background:`,
just text. Render it through `resolveSlots`, `resolveUnits`, and a mounted
`StoryMapShell`. Assert: no Mapbox instance is constructed; readiness
coordinator still flips `__pdfReady__` after settle.

**Output:** legacy stories unchanged; the shell can host a map-less story.

---

## Phase 2 · Page-level `storyBackground` slot

Goal: the aura backdrop mounts **once** at the page level, persists across all
units, and doesn't enter the per-unit `BackgroundVizSlot` machinery. This is
the only genuinely new architectural seam the deck format needs.

### 2.1 New shell-level slot

Add a `<StoryBackgroundSlot>` component mounted in `app/story/[slug]/page.tsx`,
**outside** the snap container, position fixed full-viewport, behind
everything. It reads `config.defaults.storyBackground`.

```
<ThemeProvider>
  <StoryBackgroundSlot config={config.defaults.storyBackground} frontmatterAura={frontmatter.aura} />
  <StoryBackgroundOverlay config={config.defaults.overlay} />
  <VerticalCaptureFrame>
    <VerticalLoader>
      <StoryShell ... />   {/* renamed from StoryMapShell */}
    </VerticalLoader>
  </VerticalCaptureFrame>
</ThemeProvider>
```

Why outside `VerticalCaptureFrame`: in 9:16 compose mode the frame iframes the
inner story; the aura should belong to the outer page (already how
`VerticalCaptureFrame.tsx:57-94` paints its own aura). Inside compose, the
inner iframe gets the same aura at its own page level.

### 2.2 Resolution order

- If `config.defaults.storyBackground` is set → use it.
- Else if `frontmatter.aura` is set (legacy) → synthesize
  `{ type: 'aura', slug: frontmatter.aura }`.
- Else → `{ type: 'none' }`.

This makes the home-tile aura double as the deck backdrop automatically.

### 2.3 Aura component ✅

Reuse the aura iframe/canvas component already used by
`VerticalCaptureFrame.tsx:57-94`. **As built:** the shared shell stays
brand-agnostic — `StoryBackgroundSlot` takes the aura renderer via an
`AuraComponent` prop, and vizmaya injects its own **`AuraBackground`**
(`apps/vizmaya-fyi/components/AuraBackground.tsx`) rather than a `<AuraBackdrop>`
living inside `viz-engine`. Supports `input: off`, `tint` + `tintBlendMode` (CSS
multiply layer above the aura), `fixed: true` (the natural state).

### 2.4 Overlay layer

`<StoryBackgroundOverlay>` reads `defaults.overlay` and paints a `position:
fixed inset: 0` div with the configured color/opacity/gradient. This is the
deck spec's legibility floor for charts over moving aurora.

### 2.5 PDF print mode ✅

In `mode === 'print'` the aura should swap to a solid color (or be omitted
entirely) for legibility. **Done** — `StoryBackgroundSlot` has a `mode === 'print'`
branch returning a flat `var(--color-bg, #000)` fill, and `StoryBackgroundOverlay`
drops its translucent layer in print too. This is the only mode-specific
behavior the backdrop needs.

### 2.6 Readiness

Aura doesn't gate `__pdfReady__` — it's decorative. The readiness coordinator
already handles `expectedSignals=0` fine
(`storyReadiness.ts:81-82`).

---

## Phase 3 · New foreground vizslot modules

Six new modules. Each is a small file pair (`index.ts` registering the module
+ `Component.tsx` rendering it). All slot `'foreground'` only.

### 3.1 `bigStat`

Big number + label + delta. Stable identity by label slug.
`defaultStyle.panel: undefined` (deck applies panel via defaults). Renders
`value` at `clamp(3.5rem, 11vw, 7.5rem)` (same scale as the existing stat
treatment in `modules/text/Component.tsx:91-127`).

Subtle: the existing `text` module already renders big-number stats when `kind:
'stat'`. Tempting to reuse — but the deck's `bigStat` is a foreground vizslot
(composed alongside charts in regions), not a section-text treatment. Keep
them separate. The `text` module stays the section-text concern; `bigStat` is
the deck-composition concern.

### 3.2 `bodyText`

Reads prose from the anchored markdown unit. Spec: `from: text` pulls from the
current unit's paragraphs via `ForegroundContentContext` (the pattern already
used by `text` module at `modules/text/Component.tsx:30`). Alternative form:
`from: "section-id"` pulls from a named section.

Renders paragraphs with `formatInlineMarkdown()`. Honors `textStyle: { size?:
'small'|'normal'|'large', color?: 'muted'|'text'|... }`.

### 3.3 `quote`

Pull quote: `text`, `attribution?`. Large italic serif, optional em-dash +
attribution line. Stable identity by `text.slice(0, 40)`.

### 3.4 `keyValue`

Mini definition list: `title?` + `items: [{ key, value, color? }]`. Renders as
a two-column list. Color tokens resolve through theme.

### 3.5 `table`

Full table: `columns: [{ key, label, align?, format? }]` + `rows: object[]`.
Supports `format: 'number' | 'currency' | 'percent'` for cell formatting.
Mode-aware: in `mode === 'print'`, force black-on-white.

### 3.6 `imageGrid`

2–6 image mosaic. `items: [{ src, alt, caption? }]`. Layout chosen by count
(2×1, 2×2, 3×2, etc.). Honors `style.size`.

### Common contract

- All ship `defaultStyle: { pointerEvents: 'none', panel: undefined }` — deck
  applies panel from `defaults.panel`.
- All declare `readinessProfile`: `bigStat | bodyText | quote | keyValue` →
  `'instant'`; `table` → `'first-paint'`; `imageGrid` → `'first-paint'`.
- All registered via the core `register()` in
  `packages/viz-engine/src/modules/index.ts`, not behind a vertical — these
  are general-purpose.

### `mapbox` foreground alias

The deck spec mentions `type: mapbox` as a foreground slot. Today `map` is
`slots: ['background']` only. Add `slots: ['foreground', 'background']` for
the map module, gating the foreground variant to require explicit `style.size`
(else it'd accidentally fill the viewport in legacy contexts). One-line change
in `packages/viz-engine/src/modules/map/index.ts`.

---

## Phase 4 · New foreground layouts

Seven layouts to register in
`packages/viz-engine/src/foregroundLayouts.ts` following the existing
`split-37-63-two-row` precedent. Each needs desktop + portrait variants.

- `text-left-chart-right` → 40vw / 60vw split
- `text-left-quote-right` → 54vw / 38vw split (deck spec)
- `image-left-text-right` → 44vw / 50vw split
- `stat-top-chart-below` → 100vw stacked, stat 30vh / chart 60vh
- `stat-left-chart-right` → 38vw / 58vw split
- `chart-top-text-below` → 100vw stacked, chart 60vh / text 30vh
- `centered` → single region, 60vw centered
- `free` → no-op (slots position themselves via `style.position`); register as
  a degenerate layout with no region styles

### Spec quirk: section-root `layout` vs `foreground.layout`

Today, region-based layouts live under `foreground.layout`
(`resolveSlots.ts:74-79`). The deck spec puts `layout:` at the section root
and an unwrapped `foreground: []` array. Two fixes:

- Update the schema: accept `section.layout` as a sibling of
  `section.foreground` and normalize in `resolveSlots`. If both present,
  `foreground.layout` wins.
- The flat-array `foreground` then gets sliced into regions by `slot.region`
  field per layer, or by the layout's default mapping (each slot indexed →
  region by array position).

This is a small but real schema unification: it lets the deck format keep its
terse syntax while sharing the existing region machinery.

---

## Phase 5 · Expand `section.kind` taxonomy

Adding new kinds touches **10 files** — but most are mechanical type union
extensions. The renderer logic only matters in 3 of them.

### 5.1 Type union

`packages/viz-engine/src/lib/storyConfig.types.ts:119` — extend `SectionKind`.
Done in Phase 0.

### 5.2 Renderer branches

`components/story/MapStorySection.tsx:56-237`

Today: hero, stat, text. The key insight: **for deck format, the section text
card is suppressed for all kinds except `hero`/`cover`**. The deck composes
content entirely through foreground vizslots in regions. One gate, not a
per-kind branch.

**As built** in `MapStorySection.tsx` (now under `@vismay/story-reader`): the
suppressed kinds are enumerated in a `DECK_KINDS_NO_TEXT_CARD` set and the gate
reads `suppressForDeckKind` (rather than the inline `suppressSectionText`
expression sketched here) — same effect:

```ts
// kinds whose text lives entirely in foreground vizslots
const suppressForDeckKind = DECK_KINDS_NO_TEXT_CARD.has(rawKind)
```

That sidesteps the 10-way branch explosion. Deck stories use the vizslot
composition; map stories use the section text card.

### 5.3 MapEditShell preview

`components/map-edit/MapEditShell.tsx:540-603` — add `cover | bigStat |
bodyText` previews. Same shortcut: cover ≈ hero, bigStat ≈ stat, rest ≈ text.

### 5.4 ResolveUnits stat detection

`packages/content-source/src/resolveUnits.ts:82, 170, 190` — `isStat = kind
=== 'stat' || kind === 'bigStat'`.

### 5.5 TTS + audio narration

`packages/content-source/src/storyTts.ts:106-118` and
`scripts/generate-audio.ts:276, 379, 384` — map new kinds to existing
extraction logic:

- `cover` → hero rules
- `bigStat` → stat rules
- `bodyText | split | data | quote | gallery | closing` → text rules
- `divider | methodology` → skip (already covered by `TTS_SKIP_IDS`)

### 5.6 Share card variants

`components/share/ShareCard.tsx` + `ShareEditDrawer.tsx` — auto-variant
selection: `cover → hero card`, `bigStat → stat card`, everything else → text
card.

### 5.7 Sample YAML

`lib/shareSampleYaml.ts` — extend per-kind sample generators.

---

## Phase 6 · Cross-cutting pipelines

The investigation confirms most pipelines are already format-agnostic. Audit
each for residual map assumptions.

### 6.1 Autoplay video render ✅

`lib/storyVideoRender.ts` walks `[data-unit-index]` and waits on
`__capturedMaps__`. **Done** — the shell now publishes `window.__expectedMapCount__`,
computed from the same `resolveSlots` the background/foreground dispatchers
consume (so it can't disagree with what actually mounts — no false zero that
would skip a needed tile-load wait). `walkAndRecord` reads it and, when it's a
definite `0`, skips the map-load probe entirely instead of letting phase 1's 5s
timeout elapse on every map-less render. A null/undefined reading falls through
to the old probe, so older pages and races keep the prior behavior.

### 6.2 PDF report mode

`app/story/[slug]/report/page.tsx` wraps units in `<ReportShell>`. For deck
stories, the report mode is a portrait booklet — same as map stories. The
aura must swap to solid color in `mode='print'` (covered in Phase 2.5).

### 6.3 PDF slides mode

Slides = one unit per page at 1920×1080. Deck units fit this naturally — a
deck slide IS a 16:9 composition already. Verify report and slides shells
consume the same `ForegroundLayoutSlot` machinery.

### 6.4 OG/Twitter image

`app/story/[slug]/opengraph-image.tsx` is frontmatter-only. Zero changes.

### 6.5 TTS narration

Already handled in Phase 5.5.

### 6.6 Readiness coordinator

Already supports `expectedSignals=0`. No change.

### 6.7 Vertical capture frame

`components/story/VerticalCaptureFrame.tsx` is map-unaware. Check that 9:16
compose mode's outer aura iframe coexists with the new page-level
`<StoryBackgroundSlot>` cleanly. May want to suppress `StoryBackgroundSlot`
when `?compose=vertical` is set.

---

## Phase 7 · Editor and admin integration

Rather than a separate `DeckEditShell`, deck editing was added to the existing
**Rete "Canvas" editor** (`apps/admin/.../canvas/`), which was already
format-agnostic (it understands foreground regions + layouts and saves
`config_yaml` generically). The original `MapEditShell` is untouched.

### 7.1 Form-based slot editing ✅ *(shipped — slots-only scope)*

Clicking any deck vizslot (`bigStat` / `bodyText` / `quote` / `keyValue` /
`table` / `imageGrid`) — or any module that declares an `adminForm` — opens a
new **`SlotFormModal`** that hosts the shared `VizConfigForm`, the same
adminForm renderer the Assets-tab ComposeVizPanel uses. Saving reuses the
existing `replaceLayer` → `saveConfigYaml` path (identical to the image modal).

- **Routing rule:** module has `adminForm` and no bespoke editor → form modal.
  `map` (no adminForm) keeps YAML + MapPicker; `image` keeps `ImageEditModal`;
  `chart` (no adminForm) keeps the YAML editor. A **"Edit as YAML"** escape
  hatch in the modal hands back to the YAML panel for the same slot.
- **Routing seam:** `canvasInputs.layerLeaf` now attaches a clickable `slot`
  descriptor to *every* layer (was map/image only); `CanvasClient`'s dispatcher
  decides the editor. Add-menu surfaces the deck types with friendly labels +
  seed templates (`canvasSlotAdd.seedLayerForType`).
- **Dotted-key shim:** `SlotFormModal` flattens/​re-nests dotted adminForm keys
  (only `bodyText`'s `textStyle.*` today) so they round-trip into the nested
  config the runtime expects.

### 7.2 Still deferred

- **New-slide creation** and **drag-drop region reordering** in the canvas
  (the heavier composition surfaces) — not built; YAML still owns slide/section
  structure and layout choice.
- The read-only **DeckComposerPanel** ("Deck" tab) remains a preview; it was
  not graduated to inline editing (the canvas form editor covers that need).

---

## Phase 8 · DB-backed content compatibility

The active `feat/db-backed-content` migration treats stories as blobs. Deck
format slots in naturally:

- `markdown`, `config_yaml`, `share_yaml`, `report_yaml`, `tts_yaml` already
  cover the file set
- No `map_yaml` equivalent needed for decks (no map overrides)
- No new column required

Coordinate with the migration: Phase 0's schema changes should land **before**
the DB cutover so the `config_yaml` blob's parse path knows about the new
keys.

---

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Phase 1 breaks a legacy map story by gating the cascade wrong | Medium | Snapshot-test every story's `resolveSlots` output before/after; visual regression on 3-4 representative stories |
| `__capturedMaps__` proxy hangs when no maps ever register | ✅ Resolved | `storyVideoRender.ts` reads the shell's `__expectedMapCount__` and short-circuits the probe at `0`; the proxy wait was already timeout-guarded, so this only trims the wasted 5s |
| Aura backdrop bleeds into PDF and ruins legibility | Low | Phase 2.5 print-mode solid-color swap; verify in render |
| Portrait variants of new layouts feel wrong | High (it's design) | Build desktop layouts first, do portrait pass after spacex story is approved |
| Deck stories' chart layers don't animate on `activeStep` (no subsections) | Low | Correct behavior — deck slides don't have multi-step charts. If needed later, subsections work identically on deck. |
| `frontmatter.aura` doubling as page background changes home-tile semantics | Low | The frontmatter field is unchanged; only consumers of it (now: home tile + deck page) read it independently |
| Shared `<AuraBackdrop>` extraction breaks `VerticalCaptureFrame` | Medium | Extract carefully; keep VCF as the canonical caller, page-level mount delegates to same component |
| `StoryMapShell` → `StoryShell` rename triggers churn in imports | ✅ Resolved | Renamed; deprecated `StoryMapShell` re-export alias kept in `@vismay/story-reader` for one release cycle, so external importers don't break |

---

## Sequencing & ship strategy

> **Historical.** This is the plan as sequenced before the work shipped. In
> practice Phases 0–6 landed across two commits (see the Status section at the
> top), not the eleven discrete PRs below. Kept for provenance.

Each row is one PR, mergeable independently:

1. **Phase 0** — schema-only, types compile, no runtime change
2. **Phase 1** — defensive `section.map` reads, fixtures, no behavior change
3. **Phase 2** — page-level `<StoryBackgroundSlot>` + overlay, frontmatter.aura wired in
4. **Phase 3a** — `bigStat` + `bodyText` modules (unblocks spacex)
5. **Phase 4a** — `text-left-chart-right`, `chart-top-text-below`, `stat-left-chart-right` layouts
6. **Phase 5** — kind taxonomy expansion + "suppress section text card in deck mode" gate
7. **Smoke test:** spacex-s1-2026 renders end-to-end
8. **Phase 6** — video/PDF verification + zero-map test fixtures
9. **Phase 3b** — `quote`, `keyValue`, `table`, `imageGrid`
10. **Phase 4b** — remaining layouts (`text-left-quote-right`, `image-left-text-right`, `stat-top-chart-below`, `centered`, `free`)
11. **Phase 7** — defer until requested

**Estimate:** Phases 0-5 are roughly 2-3 weeks of focused work to get spacex
live. Phase 6 hardening is another 3-4 days. Phases 3b/4b parallelize with
hardening if a second deck story is queued.

**Critical-path PR sequence to ship spacex:** 0 → 1 → 2 → 3a → 4a → 5. Six
PRs, each reviewable in isolation, no atomic mega-merge.
