# Vismay / Vizmaya — Story Render Templates Reference

> **Scope.** This is the complete authoring + engineering reference for every way a Vizmaya story can be *rendered*. It covers the two top-level **story formats** (`map` and `deck`), the **foreground-layout** registry, all **13 viz modules**, and every **render mode** (interactive scroll, autoplay, share cards, report/PDF, slides, social images, and web/native embed).
>
> **Source of truth.** The render engine lives in `packages/viz-engine` and `packages/story-reader`; the consuming app is `apps/vizmaya-fyi`. Every option below was read from that source — citations to the defining file are inline. When the code and this doc disagree, the code wins; update this doc.
>
> **How a story is authored.** A story is a markdown file (`<slug>.md`, frontmatter + body) plus a sibling `<slug>.config.yaml` (the render config), with optional `<slug>.share.yaml` (share cards), `<slug>.report.yaml` (PDF), `<slug>.map.yaml` (autoplay camera), charts under `<slug>/charts/*.json`, and images under `<slug>/images/`.
>
> *Last generated: 2026-05-31. Regenerate after engine changes — see the bottom of this file.*

---

## At a glance

| Axis | Values |
| --- | --- |
| **Formats** (frontmatter `format:`) | `map` (default — map-anchored scrollytelling) · `deck` (snap-scrolled slides over a page backdrop) |
| **Render modes** | interactive reader · autoplay · share cards · report (PDF) · slides · OpenGraph/Twitter image · web embed · native embed |
| **Foreground layouts** (11) | `single-fill`, `split-37-63-two-row`, `hero-full-bleed`, and 8 deck layouts: `text-left-chart-right`, `text-left-quote-right`, `image-left-text-right`, `stat-top-chart-below`, `stat-left-chart-right`, `chart-top-text-below`, `centered`, `free` |
| **Viz modules** (13) | `chart`, `map`, `image`, `embed`, `video`, `rive`, `text`, `bigStat`, `bodyText`, `quote`, `keyValue`, `imageGrid`, `table` |
| **Section kinds** (12) | `text`, `hero`, `stat`, `cover`, `bigStat`, `bodyText`, `split`, `data`, `gallery`, `quote`, `divider`, `closing` |

---

## Table of contents

**Part I — Architecture**

- [Architecture & render modes overview](#architecture--render-modes-overview)

**Part II — Formats & shells**

- [Map format — shell & scrollytelling mechanics](#map-format--shell--scrollytelling-mechanics)
- [Map data & styling options (+ map module)](#map-data--styling-options--map-module)
- [Deck format — shell, snap scroll, backdrop & progress](#deck-format--shell-snap-scroll-backdrop--progress)
- [Foreground layouts & slot positioning](#foreground-layouts--slot-positioning)
- [Section & subsection config + section kinds](#section--subsection-config--section-kinds)
- [Story-wide defaults, frontmatter & theme system](#story-wide-defaults-frontmatter--theme-system)

**Part III — Viz modules**

- [Viz module system (foreground/background slots)](#viz-module-system-foregroundbackground-slots)
- [Module: chart](#module-chart)
- [Module: image](#module-image)
- [Module: embed](#module-embed)
- [Module: video](#module-video)
- [Module: rive](#module-rive)
- [Module: text](#module-text)
- [Module: bigStat](#module-bigstat)
- [Module: bodyText](#module-bodytext)
- [Module: quote](#module-quote)
- [Module: keyValue](#module-keyvalue)
- [Module: imageGrid](#module-imagegrid)
- [Module: table](#module-table)

**Part IV — Other render modes**

- [Share-card render mode](#share-card-render-mode)
- [Report (PDF) & slides render modes](#report-pdf--slides-render-modes)
- [Embed render mode (web & native)](#embed-render-mode-web--native)

**Appendix**

- [Appendix — Coverage notes & late-binding options](#appendix--coverage-notes--late-binding-options)

---


---

## Architecture & render modes overview

This is the master reference for the vizmaya data-storytelling render engine. It establishes the vocabulary every later section builds on: what a **render template** is, the two top-level story **formats** (`map` vs `deck`), every **render mode** a single story can be emitted in, and the on-disk **content model** (`<slug>.md` + `<slug>.config.yaml` + sidecars + `<slug>/charts/` + `<slug>/images/`). Read this first; the per-feature option tables live in the sections that follow.

Render code lives in two packages — `packages/viz-engine` (types, slot dispatchers, resolvers, the registry) and `packages/story-reader` (the React shells: `StoryRenderer`, `StoryMapShell`, etc.). The consuming Next.js app is `apps/vizmaya-fyi`, whose `app/story/[slug]/…` routes are the entry points for every render mode. Content lives in `apps/vizmaya-fyi/content/stories/` (in migration to Supabase Postgres — see `apps/vizmaya-fyi/CLAUDE.md`), and is read through `@vismay/content-source`.

### What a "render template" is

A single authored story is one logical document — markdown prose, a config describing how each section composes its visuals, and chart data. From that one document the engine produces **many rendered artifacts**: an interactive scroll reader, an autoplay video, social share cards, a print/PDF booklet, a slide deck, and a social OpenGraph image. Each artifact is a **render mode**, served by a dedicated Next.js route under `app/story/[slug]/…` that loads the same content and mounts a different **shell** component.

A **shell** is the top-level React orchestrator for a render mode — it owns scroll/snap behavior, the persistent background (e.g. one Mapbox WebGL context or one aura iframe), the foreground slot dispatch, and any chrome. The shells are: `StoryMapShell` (interactive reader, embed, single-section canvas frame), `AutoplayShell`, `ShareShell`, `ReportShell`, and `SlidesShell`. The `format:` frontmatter field selects *which family of layout rules* the shell applies; the route selects *which artifact* is produced.

Two ideas are orthogonal and easy to confuse:

- **Format** (`map` / `deck`) — an authoring choice in frontmatter that decides the *layout grammar* of every section (map-anchored vizslots vs. snap-aligned deck panels over an aura backdrop). It is fixed per story.
- **Render mode** (reader / autoplay / share / report / slides / og / embed) — the *output artifact*, chosen by the route the request hits. A single story renders in all modes regardless of its format.

### Story formats

`format:` is the top-level renderer discriminator, defined as `StoryFormat = 'map' | 'deck'` in `packages/viz-engine/src/types/story.ts`. It is **optional**; a missing value means `'map'` so every legacy story keeps rendering through the map-anchored shell unchanged (`Frontmatter.format?: StoryFormat`, same file).

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `format` | `'map' \| 'deck'` | `'map'` | Frontmatter field selecting the layout grammar. Missing = `'map'` (back-compat). Read by `app/story/[slug]/page.tsx`, which passes it into `StoryMapShell` as the `format` prop; the shell branches its slot routing on it. |

| Format | Backdrop | Section model | Foreground routing | When to use |
|--------|----------|---------------|--------------------|-------------|
| `map` (default) | Each section carries its own `map:` camera state; one persistent Mapbox WebGL context floats behind, re-framed per snap. | Map-anchored scrollytelling; foreground vizslots float over the live map. | Legacy "flat" chart panel (top-right 63vw × 50vh column) unless the section opts into `foreground: { layout, regions }`. | Geography is the story (Great Nicobar, IEA energy, Kashmir). |
| `deck` | One page-level aura embed (`defaults.storyBackground`, falling back to `frontmatter.aura`) mounted once at the page root, plus a deterministic darken `overlay`. | Snap-scrolled slide deck; each section is a composed panel of vizslots in layout regions over the shared backdrop. | **Always** routes through `ForegroundLayoutSlot` — even flat foregrounds are synthesized into a single-region `free` layout so slots inherit the deck safe-area inset (see `StoryMapShell.tsx`, the `currentResolvedForeground` memo). | Geography is irrelevant — a P&L, cap table, benchmark, or corporate filing (SpaceX S-1). |

The full deck-format spec — aura/overlay/panel config, the deck vizslot taxonomy (`bigStat`, `quote`, `keyValue`, `table`, `imageGrid`, …), section `kind`/`layout`, and the deck scroll model — is documented in `apps/vizmaya-fyi/docs/deck-format-spec.md` and expanded in later sections of this reference; it is not duplicated here.

Frontmatter example — a deck story (`content/stories/spacex-ipo-2026.md`):

```yaml
---
title: "A Rocket Company That Became the Internet"
subtitle: "SpaceX's S-1 reveals three companies inside one stock — and only one of them makes money."
byline: "Vizmaya · SpaceX Form S-1, filed May 20, 2026 · SEC EDGAR"
date: "2026-05-27"
status: "published"
listed: true
vertical: "starship"        # loads @vismay/starship-viz so `starship:viewer` slots resolve
format: "deck"              # the discriminator — selects the deck layout grammar
aura: minimalist-gold-background-elegant-white-design-for-websites
theme:
  colors: { background: "#f5f1ea", text: "#181a20", accent: "#3a3a9c", ... }
  fonts:  { serif: "Fraunces", sans: "Inter", mono: "JetBrains Mono" }
---
```

A map story simply omits `format:` (defaults to `'map'`); see `content/stories/great-nicobar-project.md`, whose frontmatter has only `title`/`subtitle`/`byline`/`date`/`theme`.

#### Frontmatter fields (the discriminator's neighbors)

These are the frontmatter keys the routes read directly; `Frontmatter` is defined in `packages/viz-engine/src/types/story.ts`.

| Option | Type | Default | Required | Description |
|--------|------|---------|----------|-------------|
| `title` | string | — | yes | Story title; used in page `<title>`, OG card, share/report/slides headers. |
| `subtitle` | string | — | yes | Dek; used as meta description, OG card subtitle. |
| `byline` | string | — | yes | Author/source line; OG card byline, page `authors`. |
| `date` | string | — | yes | Publication date; OG `publishedTime`, OG card date. |
| `theme` | `Theme` | — | yes | Color + font palette (`theme.colors`, `theme.fonts`). Drives `ThemeProvider` CSS vars, map palette (`themeToMapPalette`), font imports (`getFontImportUrl`), and the OG card colors. |
| `status` | `'draft' \| 'published' \| 'archived'` | `'published'` | no | Publication state (missing = published, back-compat). |
| `listed` | boolean | `true` | no | Whether the story appears on the home grid. |
| `aura` | string | — | no | Aura embed slug (`https://aura.promad.design/embed/<slug>`). Used as the home-tile background; for deck stories also the page-level backdrop fallback when `defaults.storyBackground` is absent. |
| `vertical` | string | — | no | Vertical bundle to load (`@vismay/<vertical>-viz`) so its viz types register. Unknown verticals are ignored with a console warning. `footshorts` additionally triggers Supabase entity hydration in the reader route. |
| `format` | `'map' \| 'deck'` | `'map'` | no | The renderer discriminator (above). |

### Format → shell wiring (the interactive reader route)

`app/story/[slug]/page.tsx` is the canonical entry point and shows the format→shell wiring end to end. It is statically generated (`export const revalidate = 60`; `generateStaticParams` enumerates `getViewableStorySlugs()` filtered by `hasStoryConfig`). For each slug it:

1. Loads content (`getStoryContent`), 404s if no `<slug>.config.yaml` (`hasStoryConfig`), then loads the config (`loadStoryConfig`). For `vertical: 'footshorts'` it hydrates team data from Supabase (`hydrateFootshortsConfig`), failing silently.
2. Reads the autoplay map-override yaml (`getContentSource().readMapYaml(slug)`) so it ships in the SSG bundle; `parseMapOverrides` turns it into `MapOverrideConfig`. `StoryMapShell` only *applies* overrides client-side when it sees `?autoplay=1`.
3. Resolves units (`resolveUnits` → `{ units, mobileUnits, hasMobileOverrides }`), merges the map palette (`config.defaults.mapPalette ?? themeToMapPalette(theme)`), resolves per-section logo palettes (`resolveSectionLogoPalettes`), and computes the font import URL.
4. Branches on format only for the **page-level backdrop**: `const isDeck = story.frontmatter.format === 'deck'`. A deck story with `defaults.storyBackground` (or `frontmatter.aura`) mounts `StoryBackgroundSlot` + `StoryBackgroundOverlay`; map stories own their backdrop through Mapbox per section, so the page-level aura is skipped.
5. Mounts a single shell — `StoryMapShell` — passing `format={story.frontmatter.format ?? 'map'}`. The shell itself does the per-format layout dispatch (see `isDeckFormat` in `packages/story-reader/src/components/story/StoryMapShell.tsx`).

So at the page level the format only toggles the backdrop; the *layout* difference (legacy flat chart panel vs. always-`ForegroundLayoutSlot`) is decided inside `StoryMapShell` off its `format` prop. The interactive reader uses one shell for both formats.

### Render modes

Every render mode is a Next.js route under `apps/vizmaya-fyi/app/story/[slug]/`. They all load the same content (`getStoryContent` + `loadStoryConfig` + `resolveUnits`) and wrap output in `ThemeProvider`; they differ in the shell they mount, the URL query flags they honor, and their auth/render posture.

| Mode | Route / entry | Shell / component | Purpose | Auth & render posture |
|------|---------------|-------------------|---------|------------------------|
| Interactive scroll reader | `/story/[slug]` — `app/story/[slug]/page.tsx` | `StoryMapShell` (via `VerticalLoader`, inside `VerticalCaptureFrame`) | The public reading experience: snap-scroll, live map / aura, animated foreground. | Public. SSG (`revalidate = 60`, `generateStaticParams`). |
| Autoplay (video session) | `/story/[slug]/autoplay` — `app/story/[slug]/autoplay/page.tsx`; query `?aspect=9:16\|16:9`, `?start=<sectionId>` | `AutoplayShell` | Admin-facing autoplaying session that the video pipeline records into MP4 (`/api/story-video/[slug]`). Mounts the map editor side panel (`buildMapTargets`) and mints `edit-story-map` / `edit-story-cues` action tokens for cross-TLD saves. | Admin-only via signed-URL middleware gate. `export const dynamic = 'force-dynamic'`. |
| Share cards | `/story/[slug]/share` — `app/story/[slug]/share/page.tsx`; query `?ratio=1:1\|4:5\|3:4\|4:3` (default `3:4`), `?section=<id>` | `ShareShell` | Editable social-card composer: each section becomes a cropped card. Loads `<slug>.share.yaml` overrides (`loadShareConfig` + `readShareYaml`), builds a sample YAML, mints `edit-story-content` token. | Admin-only (signed URL). |
| Report / PDF | `/story/[slug]/report` — `app/story/[slug]/report/page.tsx`; query `?print=1`, `?embed=1`, `?section=<id>` | `ReportShell` | Letter-portrait booklet, one parent section per page (`break-before: page`). Headless target for `page.pdf()` via `/api/story-pdf/[slug]?format=report`; waits on `window.__pdfReady__`. Applies `<slug>.report.yaml` overrides (`parseReportConfig('report')` + `applyReportOverrides`). | Auth via signed-URL middleware. `dynamic = 'force-dynamic'`. `?print=1` strips dev chrome. |
| Slides / PDF | `/story/[slug]/slides` — `app/story/[slug]/slides/page.tsx`; query `?print=1`, `?embed=1`, `?section=<id>` | `SlidesShell` | 16:9 1920×1080 slide deck, one unit per slide. Headless target for `page.pdf({ landscape, 1920×1080 })` via `/api/story-pdf/[slug]?format=slides`. Prefers `shareUnits` when the story has share overrides (tighter, presentation-shaped), else `units`; then applies `parseReportConfig('slides')` overrides. | Auth via signed-URL middleware. `dynamic = 'force-dynamic'`. |
| OpenGraph / Twitter image | `/story/[slug]/opengraph-image` — `app/story/[slug]/opengraph-image.tsx` | `StoryOgCard` (rendered through `next/og` `ImageResponse`) | 1200×630 PNG social preview, generated from frontmatter (`title`, `subtitle`, `byline`, `date`) and `theme.colors`. | Public. `runtime = 'nodejs'`; SSG via `generateStaticParams`. The same metadata also drives the `<meta>` OG/Twitter tags from `generateMetadata` in `page.tsx`. |
| Embed (chrome-less) | `/story/[slug]?embed=1` — same route as the reader; URL built by `@vismay/story-embed` `storyUrl()` | `StoryMapShell` (embed branch) | The shared story view embedded in consumer apps (footshorts, vizf1) via `<iframe>`/WebView. `?embed=1` makes `StoryMapShell` suppress vizmaya's persistent brand logo / home link so the host overlays its own chrome (`StoryEmbed` children). | Public. Not a separate route — a flag the reader route reads client-side. |
| Single-section canvas frame | `/story/[slug]/canvas-frame/[id]` — `app/story/[slug]/canvas-frame/[id]/page.tsx` | `StoryMapShell` (units shrunk to one section's parent) | Headless single-section render target for the admin canvas iframe. No logo, no chrome, no nav. Section identity = `parentConfig.id` else `section-<parentIndex>`; bad ids 404. | Headless (admin canvas). `dynamic = 'force-dynamic'`. |

Notes on the shared internals:

- **`StoryMapShell` powers three modes** (reader, embed, canvas-frame) and switches behavior off URL query flags it reads client-side in a `useEffect`: `?autoplay=1` (applies `mapOverrides`, hides scrollbar, hides progress), `?capture=1` (set by the Playwright video pipeline to opt out of `flyTo`/animations for deterministic frames), and `?embed=1` (suppress brand logo). Its computed `mode` is `'capture' | 'autoplay' | 'scroll'` (see `StoryMapShell.tsx`). Reports/slides run their own `'print'` posture via separate shells.
- **`StoryRenderer`** (`packages/story-reader/src/components/story/StoryRenderer.tsx`) is the lower-level markdown-block renderer (Hero, StatBlock, ProseSection, DataTable, ScrollySection, …) that the section components compose; it is not itself a top-level render mode but is the block-dispatch primitive underneath them.
- **Video and PDF are pipelines, not routes you read directly.** `/api/story-video/[slug]` records the autoplay route; `/api/story-pdf/[slug]?format=report|slides` screenshots the report/slides routes. Both have a sync (local-dev, in-process Playwright/ffmpeg) and a dispatch (production, GitHub Actions `workflow_dispatch`) mode sharing one polling response shape. See `apps/vizmaya-fyi/CLAUDE.md` for the full pipeline wiring; this reference documents the render *routes* those pipelines target.

### Content model

A story is authored as a small cluster of files keyed by `<slug>`, currently living in `apps/vizmaya-fyi/content/stories/` (git-backed during the fs→Supabase cutover; the DB stores the same blobs in `stories` columns). All of them are read through `@vismay/content-source` so the `CONTENT_SOURCE=fs|db` env var swaps the backing store transparently.

| File / path | Required | Reader | Purpose |
|-------------|----------|--------|---------|
| `<slug>.md` | yes | `getStoryContent` (`@vismay/content-source/content`) | Prose + YAML frontmatter (parsed by `gray-matter`). Frontmatter carries `title`/`subtitle`/`byline`/`date`/`theme` plus `format`, `vertical`, `aura`, `status`, `listed`. The body is the section prose that `bodyText`/prose slots slice from. |
| `<slug>.config.yaml` | yes | `loadStoryConfig` / `hasStoryConfig` (`@vismay/content-source/storyConfig`) | The render config: `defaults:` (map style, palette, `storyBackground`, `overlay`, `panel`, `scroll`, `chart`, `progress`, `logoPalette` — see `StoryDefaults` in `packages/viz-engine/src/lib/storyConfig.types.ts`) and `sections:` (per-section `kind`, `layout`, `map:` camera, `foreground:`/`background:` vizslots). A story with no config 404s at every route. Typically 550–750 lines. |
| `<slug>.share.yaml` | no | `loadShareConfig` + `readShareYaml` | Social-card / share-mode definitions (`cards:` or `sections:` overrides). Consumed by the share route; also feeds the slides route's `shareUnits`. May be an empty stub (`sections: {}`). |
| `<slug>.report.yaml` | no | `readReportYaml` → `parseReportConfig` | Per-story PDF override config (skip/include, heading/subheading/paragraphs, per-page chart override) for the report and slides modes. Edited via the `/reports/[slug]` builder. Stored as `stories.report_yaml` after migration 010. |
| `<slug>.tts.yaml` | no | `lib/storyTts.ts` | Per-unit narration script overrides for the audio pipeline, keyed by `(parentIndex, subIndex, sliceIndex)`. Stored as `stories.tts_yaml` after migration 012. (Audio is a pipeline, not a render route.) |
| `<slug>/charts/*.json` | no | `app/api/chart-data/[slug]/[id]/route.ts` | Chart data + ECharts-ish config, one file per `id`. A `chart` vizslot references `charts/<id>.json` by `id`; served at runtime by the chart-data API. |
| `<slug>/images/…` | no | resolved via `resolveAssetUrl` / asset references | Story images. Referenced from slots as `assets://<key>`, an absolute `http(s)` URL, or a same-origin `/content/…` path. In prod these resolve to the Supabase public bucket (`NEXT_PUBLIC_SUPABASE_URL`); the reader route warms that origin with a `<link rel="preconnect">`. |

Map-overrides yaml (read via `readMapYaml` in the reader and autoplay routes) is a further sidecar applied only under `?autoplay=1` — it lets the autoplay video re-frame the map without forking the shared config.

The content-revision hash for PDF caching is `sha256` over markdown + config.yaml + share.yaml + report.yaml + every chart JSON for the slug (see `apps/vizmaya-fyi/CLAUDE.md`), which is the authoritative enumeration of what constitutes "the story" for cache-invalidation purposes.

### How this reference is organized

This `## Architecture & render modes overview` is the master entry point. Later sections drill into each surface and should be read against the vocabulary established here:

- **Frontmatter & theme** — the full `Frontmatter` / `Theme` reference (`packages/viz-engine/src/types/story.ts`).
- **`defaults:` config** — every `StoryDefaults` key (`packages/viz-engine/src/lib/storyConfig.types.ts`).
- **Sections & vizslots** — `StorySectionConfig`, `SectionKind`, `layout`, the `map:` block, and the foreground/background slot taxonomy.
- **Map format** — `map:` camera steps, pins, regions/choropleth, heatmap, text labels (`MapStep`, `MapRegionLayer`, etc.).
- **Deck format** — aura/overlay/panel/scroll and deck vizslots; cross-reference `apps/vizmaya-fyi/docs/deck-format-spec.md`.
- **Charts** — chart JSON shape and the chart-data API.
- **Share / report / slides** — the per-mode override schemas (`<slug>.share.yaml`, `<slug>.report.yaml`).

When a later section names an option, this overview tells you which *format* it belongs to and which *render modes* will actually honor it.

---

## Map format — shell & scrollytelling mechanics

This section documents the **MAP render template**: the legacy map-anchored
scrollytelling format where one persistent Mapbox instance fills the viewport
and the reader scrolls through a stack of viewport-tall text cards while the
camera flies between geographic beats. It is the default story format
(`format='map'`); the deck format reuses the same shell but routes content
differently (see the deck section of this reference).

The map format is orchestrated by three files:

- `packages/story-reader/src/components/story/StoryMapShell.tsx` — the
  page-level orchestrator. Owns the scroll container, the IntersectionObserver,
  `activeUnit` state, and the fixed background/foreground panels.
- `packages/story-reader/src/components/story/MapStorySection.tsx` — renders one
  snap target's text card (the only thing each section paints into the scroll
  flow; map + chart are page-level fixed panels).
- `packages/viz-engine/src/modules/map/PersistentComponent.tsx` +
  `packages/viz-engine/src/charts/MapboxBackground.tsx` — the single persistent
  Mapbox instance and its per-unit camera-step derivation.

Unit flattening (sections + subsections → renderable snap targets) is done
ahead of the shell by `packages/content-source/src/resolveUnits.ts`.

### The render model in one paragraph

A story config (`<slug>.config.yaml`) is a list of `sections`. Each section
may have `subsections`. `resolveUnits` flattens this into a flat array of
`ResolvedUnit` objects — one per **viewport-tall snap target**. The shell maps
each unit to a `<section data-unit-index={i}>` inside a single scroll-snap
container. A single `IntersectionObserver` watches every unit element and sets
`activeUnit` to whichever is most visible. `activeUnit` then drives (a) the
persistent map's `activeStep` (which camera pose to fly to) and (b) the
persistent chart's `activeStep` (which animation step to show). The map and
chart are **fixed page-level panels that never unmount** — only the text cards
scroll past them.

---

### DOM / scroll structure

The shell renders, in z-order from back to front, all inside a
`<StoryShellProvider>` context that publishes `accessToken`, `defaults`,
`mapOverrides`, `isAutoplay`, `isPortrait`, `isCapture`, `units`, and `format`
(`StoryMapShell.tsx` lines 287-298):

| Layer | Element | Position | z-index | Purpose |
| --- | --- | --- | --- | --- |
| Background | `<BackgroundVizSlot>` | `fixed inset-0` | `z-0`, `pointer-events: none` | The persistent Mapbox canvas (and any other `background:` layers). Never scrolls. |
| Foreground chart | legacy chart panel `<div>` | `fixed` | `z-10`, `pointer-events: none` (chart card re-enables in landscape) | The persistent ECharts panel, when a map-format unit has a flat `foreground:`/`chart:`. |
| Foreground regions | `<ForegroundLayoutSlot>` wrapper | `fixed inset-0` | `z-10`, `pointer-events: none` | Region-aware foreground (opt-in `foreground: { layout, regions }`). |
| Scroll container | `containerRef` `<div>` | `relative h-svh overflow-y-scroll snap-y snap-mandatory` | (no explicit z) | The actual scrollable element. Holds one `<section>` per unit. |
| Progress rail | `<DeckProgress>` | `fixed` right edge | — | Deck-only step indicator (`defaults.progress: true`). |
| Logo / home link | `<LinkComponent>` | `fixed top-4 left-4` | `z-50` | Persistent brand logo, re-tinted per active section. |

The scrollable element is the **inner snap container, not the document body**
(`StoryMapShell.tsx` lines 99-103, 402-407). This is deliberate: the
IntersectionObserver uses `root: containerRef.current` so the fixed
background/foreground panels stay stable on iOS Safari and the observer fires
reliably as a snap settles.

```
StoryShellProvider
├─ BackgroundVizSlot      (fixed, z-0)  ← persistent Mapbox instance
├─ chart panel            (fixed, z-10) ← persistent ECharts  [map flat-foreground only]
├─ ForegroundLayoutSlot   (fixed, z-10) ← region foregrounds  [opt-in]
├─ div ref=containerRef   (h-svh, overflow-y-scroll, snap-y snap-mandatory)
│   ├─ <section data-unit-index="0"> … text card …
│   ├─ <section data-unit-index="1"> … text card …
│   └─ <section data-unit-index="N"> … text card …
├─ DeckProgress           (fixed)       [deck + defaults.progress only]
└─ LinkComponent + LogoComponent (fixed, z-50)  [non-embed, when logoPalettes given]
```

The scroll container has **no explicit z-index** on purpose
(`StoryMapShell.tsx` lines 397-401): a `z-0` would create a stacking context
that traps the `hero-full-bleed` section's inline `zIndex: 20` below the
foreground image (rendered at `z-10` in a sibling fixed wrapper).

#### URL flags that change the shell's behavior

Read once on mount from `window.location.search` (`StoryMapShell.tsx` lines
119-136):

| Flag | State | Effect |
| --- | --- | --- |
| `?autoplay=1` | `isAutoplay` | `mode='autoplay'`. Applies `mapOverrides`. In 9:16 (portrait) autoplay the text card is hidden and the chart claims viewport center; 16:9 keeps the landscape text card. Logo / progress hidden. |
| `?capture=1` | `isCapture` | `mode='capture'`. Opts out of `flyTo` (uses `jumpTo`) and other timing-sensitive animation so Playwright video frames are deterministic. Enables WebGL `preserveDrawingBuffer`. |
| `?embed=1` | `isEmbed` | Chrome-less embed mode (used by `@vismay/story-embed` in consumer iframes/WebViews). Suppresses the persistent brand logo so the host overlays its own chrome. |

`mode` is computed as: `isCapture ? 'capture' : isAutoplay ? 'autoplay' : 'scroll'`
(plus `'print'` for the PDF route). End readers on `/story/<slug>` set none of
these and get the full animated scroll experience.

---

### The persistent single Mapbox instance

There is exactly **one** Mapbox WebGL context for the whole story, and it stays
alive across every scroll snap. This is the central design point of the map
format — destroying/recreating the GL context on each beat would be slow and
would re-trigger style loads, palette application, and tile fetches.

#### Persistent-aggregated mounting

`BackgroundVizSlot` (`packages/viz-engine/src/BackgroundVizSlot.tsx`) is the
dispatcher. It computes the **union** of every unit's `background:` layer stack
and dedups by `(type, stableIdentity)` (`buildInstances`, lines 96-130). The
map module returns `stableIdentity → 'map:default'` for every unit, so all
units' maps collapse into a **single `InstanceEntry`** whose `perUnitLayers`
array carries one config slot per unit (`null` where a unit opts out of the
map).

Each module declares a `mountingMode`. The map module is
`'persistent-aggregated'` (lines 264-269, 294-305): the slot mounts **one**
`MapPersistentComponent` and feeds it *every* unit's config at once via the
`configs` array, letting the module derive each unit's camera. Contrast with
`'per-unit'` modules (image, video, rive, embed) which mount one component per
unique `stableIdentity` and toggle visibility. The persistent-aggregated layer
is kept visible whenever **any** unit references it (`anyReferenced`, lines
177-180); per-unit visibility (fading the map out for a `background: { type:
'none' }` unit) is the module's concern, handled via per-step `opacity`.

The background wrapper is `fixed inset-0 z-0 pointer-events: none` in the
default `containerMode='viewport'` (lines 281-290), so the map paints
full-viewport behind the scroll container and never intercepts wheel/touch.
(`containerMode='tile'` switches to `absolute inset-0` for the canvas editor;
not used by the live story.)

#### Per-unit camera step derivation

`MapPersistentComponent` (`packages/viz-engine/src/modules/map/PersistentComponent.tsx`)
turns the per-unit configs + `shell.units` into a `MapStep[]` array, one entry
per unit, then hands it to `MapboxBackground` with `activeStep={activeUnit}`.

For each unit it resolves camera fields through a layered fallback chain,
**lowest → highest priority** (lines 51-64, 101-140):

1. parent section `map:`
2. subsection `map:` (`subOver`)
3. autoplay parent override (only when `isAutoplay`)
4. autoplay subsection override (only when `isAutoplay`)
5. mobile layer (`.mobile` block from whichever level provided it; only when `isPortrait`)
6. autoplay mobile overrides at parent + sub level (only when `isAutoplay && isPortrait` — the 9:16 video render)

So a concrete field like `center` resolves as
`apSub?.center ?? apParent?.center ?? subOver?.center ?? cfg?.center ?? parentMap.center`.
`flySpeed` and `opacity` additionally fall through to `shell.defaults.flySpeed`
/ `shell.defaults.mapOpacity` (lines 122-135).

A unit with **no map data anywhere** reuses the previous valid step's camera
(`lastValid`, lines 109-114) so the map doesn't fly to (0,0) when scrolling
through a no-map section; the slot keeps it hidden via opacity anyway. The very
first unit with no map config gets a neutral `{ center: [0,0], zoom: 1, opacity:
0 }` placeholder.

##### Camera & data fields per map step

These are the fields each section's (or subsection's) `map:` block accepts,
resolved into a `MapStep`. Defaults are applied either by the fallback chain
above (`StoryDefaults`) or by `MapboxBackground` itself.

| Option | YAML key | Type | Default | Required | Description |
| --- | --- | --- | --- | --- | --- |
| Center | `map.center` | `[lng, lat]` | — | Yes (for map stories) | Geographic focal point the camera flies to. The loader enforces `center`+`zoom` when neither `background:` nor `foreground:` is declared (`storyConfig.types.ts` lines 445-466). |
| Zoom | `map.zoom` | `number` | — | Yes (for map stories) | Mapbox zoom level. |
| Pitch | `map.pitch` | `number` (deg) | `0` | No | Camera tilt. Applied via `flyTo`/`jumpTo` (`MapboxBackground.tsx` lines 1021-1027). |
| Bearing | `map.bearing` | `number` (deg) | `0` | No | Camera rotation. |
| Opacity | `map.opacity` | `number` (0..1) | `defaults.mapOpacity` | No | Map canvas opacity for this unit. Drives a CSS fade (`--map-fade`), not a Mapbox property. `0` effectively hides the map for the unit. |
| Fly speed | `map.flySpeed` | `number` | `defaults.flySpeed` (or 1.2 in MapboxBackground) | No | `flyTo` speed. Higher = faster. Ignored in capture / reduced-motion (those `jumpTo`). |
| Pins | `map.pins` | `MapPinConfig[]` | — | No | Marker pins (see below). Replaces, does not merge, at the subsection level. |
| Regions | `map.regions` | `MapRegionLayer` | — | No | Choropleth layer (country or custom GeoJSON). Replaces parent's regions. |
| Heatmap | `map.heatmap` | `HeatmapLayer` | — | No | Heatmap layer. Replaces parent's heatmap. |
| Text labels | `map.textLabels` | `MapTextLabel[]` | — | No | Free-floating map labels with no pin marker. |
| Mobile overrides | `map.mobile` | `MapOverrides` | — | No | Portrait-only camera/data overrides, layered over the resolved step when `isPortrait`. |

Pin fields (`MapPinConfig`, `storyConfig.types.ts` lines 247-261;
`MapboxBackground.tsx` lines 1080-1161):

| Option | YAML key | Type | Default | Description |
| --- | --- | --- | --- | --- |
| Coordinates | `coordinates` | `[lng, lat]` | — (required) | Pin location. **Must be `coordinates: [lng,lat]`**, not separate `lng:`/`lat:` keys, and nested under `map:`. |
| Color | `color` | hex / `$token` / `var(...)` | `defaults.pinColor` | Fill (ring color when `image` is set). `$token` resolves against theme CSS vars. |
| Label | `label` | `string` | — | Popup text rendered as a Mapbox `Popup`. |
| Radius | `radius` | `number` (px) | `defaults.pinRadius` (12) | Pin marker radius. |
| Pulse | `pulse` | `boolean` | `true` | Pulsing ring animation. Set `false` to disable. |
| Label anchor | `labelAnchor` | `'top'\|'bottom'\|'left'\|'right'` | auto | Which side of the pin the label sits on (inverted to Mapbox anchor internally). |
| Image | `image` | `assets://` / URL / `/path` | — | Circular image inside the pin; `color` becomes the surrounding ring. |

Pins/labels are **diffed** across step changes by a key string
(`MapboxBackground.tsx` lines 108-114, 1069-1183): markers shared between
consecutive steps survive, vanished ones are removed, new ones added — so
progressively revealing pins across subsections doesn't flash the whole set.

##### Story-wide map defaults (`defaults:`)

`StoryDefaults` (`storyConfig.types.ts` lines 178-245). These feed
`MapPersistentComponent` → `MapboxBackground` (`PersistentComponent.tsx` lines
202-220):

| Option | YAML key | Type | Default | Description |
| --- | --- | --- | --- | --- |
| Map style | `defaults.mapStyle` | `string` | `mapbox://styles/mapbox/dark-v11` (in MapboxBackground) | Mapbox style URL. `…/standard` / `…/standard-satellite` are driven via `basemapConfig` instead of `mapPalette`. |
| Map opacity | `defaults.mapOpacity` | `number` | — (required field) | Default per-unit opacity when a step omits `opacity`. |
| Pin color | `defaults.pinColor` | `string` | — (required field) | Default pin fill. |
| Pin radius | `defaults.pinRadius` | `number` | — (required field) | Default pin radius (MapboxBackground falls back to 12). |
| Fly speed | `defaults.flySpeed` | `number` | — (required field) | Default `flyTo` speed. |
| Highlight country | `defaults.highlightCountry` | ISO 3166-1 alpha-2 | — | Fill+outline a single country on load (e.g. `KR`). |
| Highlight color | `defaults.highlightColor` | `string` | `pinColor` | Color of the country highlight. |
| Map palette | `defaults.mapPalette` | `MapPalette` | — | Semantic recolor of a classic Mapbox style (land/water/border/labels/roads). No-op on Standard styles. |
| Fontstack | `defaults.mapFontstack` | `string[]` | — | Mapbox fontstack applied to every text layer; fonts must exist on the style's glyphs URL. |
| Basemap config | `defaults.basemapConfig` | `Record<string, string\|number\|boolean>` | — | Config props for Standard / Standard-Satellite styles (`lightPreset`, `show3dObjects`, `showRoadLabels`, …). |

#### Camera flight & focal area

`MapboxBackground` runs an effect on `activeStep` change (lines 1011-1038):
unless `staticCapture` or `prefers-reduced-motion`, it calls `map.flyTo({
center, zoom, pitch, bearing, padding, speed: step.flySpeed ?? 1.2, curve: 1.42,
essential: true })`. In capture / reduced-motion it `jumpTo`s to the final pose
immediately.

The camera is **deliberately off-center** so it doesn't sit behind the text
card. The shell passes a `landscapeFocusArea` / `portraitFocusArea`
(`STORY_LANDSCAPE_FOCUS_AREA` / `STORY_PORTRAIT_FOCUS_AREA` from
`packages/viz-engine/src/lib/storyFocusArea.ts`):

- Landscape: `{ top: 0.4, left: 0, width: 0.37, height: 0.8 }` — focal point in
  the bottom-left 37%-wide region (the map's clear left column).
- Portrait: `{ top: 0.25, left: 0, width: 1.0, height: 0.45 }` — focal point in
  the upper band so pins aren't hidden behind the bottom text card.

These fractional rectangles are converted to Mapbox `padding` (px)
(`computeFocusPadding`, `MapboxBackground.tsx` lines 791-809) so the YAML
`center` still maps to a real geographic point; only its on-screen position
shifts. A `ResizeObserver` re-projects on portrait/landscape flips and container
resizes (lines 1198-1237).

```yaml
defaults:
  mapStyle: mapbox://styles/mapbox/dark-v11
  mapOpacity: 0.55
  pinColor: "#d97a3c"
  pinRadius: 12
  flySpeed: 1.2

sections:
  - id: malacca-lens
    text: "The Malacca lens"
    map:
      center: [85.0, 12.0]
      zoom: 3.1
      pitch: 15
      bearing: 0
      opacity: 0.55
      pins:
        - coordinates: [93.830, 6.750]
          label: "Indira Point"
          color: "#d97a3c"
          radius: 14
          pulse: true
        - coordinates: [103.820, 1.352]
          label: "Singapore"
          color: "#3a7a8c"
          labelAnchor: bottom
```

*(from `apps/vizmaya-fyi/content/stories/great-nicobar-project.config.yaml`)*

---

### Scroll → active unit → activeStep

#### The IntersectionObserver

A single `IntersectionObserver` is created once per `units.length`/`isPortrait`
change (`StoryMapShell.tsx` lines 233-254). It observes every
`[data-unit-index]` element with:

- `root: containerRef.current` (the scroll container, not the viewport)
- `threshold: [0.55]`

On each callback it picks the **most-visible** intersecting entry (sorted by
`intersectionRatio`) and sets `activeUnit` to that element's
`data-unit-index`. Because `snap-mandatory` settles each scroll on a single
unit, this reliably resolves to one active unit per beat.

#### What `activeUnit` drives

Once `activeUnit` is set, the shell computes the current unit and its
sub-coordinates (`StoryMapShell.tsx` lines 164-166):

- `current = units[activeUnit]`
- `activeSub = current.subIndex` — the unit's position within its parent.

`activeUnit` and `activeSub` then feed:

1. **The map** — `BackgroundVizSlot` gets `activeUnit`, which
   `MapPersistentComponent` forwards as `MapboxBackground`'s `activeStep`. The
   map flies to `mapSteps[activeUnit]`.
2. **The chart** — the persistent foreground panel gets `activeStep={activeSub}`
   (`StoryMapShell.tsx` lines 366-372). So as the reader scrolls through the
   subsections of one parent, the chart's `activeStep` advances `0,1,2,…` and
   its ECharts animations tween from one step to the next.

This is why **`subIndex` is the chart scrub coordinate** and **`parentIndex` is
the camera/chart-instance coordinate** (`storyConfig.types.ts` lines 706-741):
all units that share a `parentIndex` share one map camera *position group* and
one chart instance; their `subIndex` scrubs the chart.

#### Why the chart instance persists across subsections

The chart panel is keyed by
`unitKey={`${current.parentIndex}-${current.subIndex}`}` and the
`ForegroundVizSlot` keeps the same chart instance alive across subsections of
the same parent (`StoryMapShell.tsx` lines 310-372). Crossing a `parentIndex`
boundary re-mounts cleanly with the new chart; advancing `subIndex` within a
parent keeps the instance so ECharts animations **resume** from the previous
`activeStep` rather than re-initializing.

---

### Sections, subsections, and shared camera/chart

A `StorySectionConfig` (`storyConfig.types.ts` lines 380-467) carries its own
camera state (`map:`), optional `chart:`/`foreground:`, and either a `text:`
anchor or a list of `subsections:`.

- A section **without** `subsections` produces **one** unit (`subIndex: 0`).
- A section **with** N subsections produces **N** units, all sharing the
  parent's `map:` and `chart:` but each with its own text anchor and own
  `subIndex` (`resolveUnits.ts` lines 74-168; `storyConfig.types.ts` lines
  390-396).

Subsections (`StorySubsectionConfig`, lines 328-378) let you keep one camera
framing and one chart while telling several text beats and progressively
revealing chart steps / pins:

| Option | YAML key | Type | Default | Description |
| --- | --- | --- | --- | --- |
| Anchor | `text` | `string` | — (required) | Markdown anchor reference (e.g. `"Act II > The misleading spike"`). |
| Paragraph slice | `paragraphs` | `number` \| `[start, end]` | all | `Array.slice` semantics (`end` exclusive). Reveal prose progressively per subsection. |
| Mobile slices | `mobileParagraphs` | `Array<number\|[start,end]>` | — | Portrait-only split into multiple snaps (see Mobile). |
| Share slices | `shareParagraphs` | `Array<number\|[start,end]>` | — | Share-mode card split. |
| Heading | `heading` | `string` | anchor's own heading | Override the heading above the prose. |
| Subheading | `subheading` | `string` | — | Stat-only sub-label. |
| Map override | `map` | `SubsectionMapOverride` | inherits parent | Partial camera/data override; fields provided replace the parent's. `pins` replaces the whole array. |

Section-level fields most relevant to the map shell:

| Option | YAML key | Type | Default | Description |
| --- | --- | --- | --- | --- |
| Section id | `id` | `string` | — | Stable id (used by share/report/tts identity). |
| Kind | `kind` | `SectionKind` | `'text'` | `text` \| `hero` \| `stat` (map format); deck adds `cover`/`bigStat`/`bodyText`/etc. Drives the text card variant. |
| Anchor | `text` | `string` | — | Required unless `subsections` is present. |
| Subsections | `subsections` | `StorySubsectionConfig[]` | — | Child snap targets sharing this section's camera + chart. |
| Chart | `chart` | `string` | — | Legacy chart id (e.g. `data:trees-felled`). Prefer `foreground:`. |
| Foreground | `foreground` | `VizLayer[]` \| `{layout,regions}` | — | Per-unit foreground stack. Flat array → legacy chart panel; regions form → `ForegroundLayoutSlot`. |
| Background | `background` | `VizLayer[]` \| `{type:'none'}` | synthesized from `map:` | Persistent backdrop stack. `{type:'none'}` suppresses the map for the section. |
| Eyebrow | `eyebrow` | `string` | — | Small line above the hero title (`kind: hero`). |
| Stat color | `color` | `StatColor` | `accent2` | Theme token for the giant number (`kind: stat`). |
| Map | `map` | camera+data object | — | This section's camera state (required for map stories unless a `background`/`foreground` is set). |

When a section omits `background:` but has `map:`, a back-compat shim in
`resolveSlots()` synthesizes a single map background layer — so legacy
map-anchored configs work unchanged.

---

### Subsections as viewport-tall snap targets

Each unit becomes a `<section data-unit-index={i} class="snap-start snap-always
h-svh w-full relative">` (`MapStorySection.tsx` lines 353-357 for the generic
text case). `h-svh` makes every section exactly one (small) viewport tall, and
`snap-start snap-always` inside the container's `snap-y snap-mandatory` makes
each one a hard snap stop.

Critically, **`MapStorySection` renders only the text panel** (lines 52-71).
The map (background) and chart (foreground) are page-level fixed panels owned by
`StoryMapShell`, so they persist across subsections of the same parent. The
snap target is essentially an empty viewport-tall box with a text card
positioned inside it; scrolling it past the fixed map/chart is what produces the
scrollytelling effect.

In autoplay (`isAutoplay`) and region/deck modes, the section may render an
**empty** snap target (lines 203-218, 253-258) — its only job then is to keep
the IntersectionObserver firing so camera/chart cues still advance, even though
the visible content comes from the fixed overlays.

---

### Text-card layout (MapStorySection)

The text card is an absolutely-positioned `<div>` inside the snap target, with a
frosted-glass background (`rgb(var(--color-panel-rgb) / 0.5)`, `0.5px solid
var(--color-line)`). Its position differs between portrait and landscape, and —
in landscape — depends on whether the unit has a chart/foreground occupying the
top half (`hasChart`, `MapStorySection.tsx` line 116).

The card class string is assembled at lines 286-294 with two interchangeable
landscape blocks (lines 263-284). Both static strings appear literally in source
so Tailwind v4 JIT picks them up.

#### Portrait layout (base classes)

`absolute … left-1/2 -translate-x-1/2 bottom-4 w-[90vw] max-w-[640px]
max-h-[50svh]` — the card is centered horizontally, pinned near the bottom of
the viewport, max ~640px wide and at most half the small-viewport height. When
the unit has a chart, the chart panel is a separate top-pinned strip (~42vh /
`aspect-3/4`, full width) and the text card sits below it; chartless units just
center the card.

#### Landscape layout (geometry)

The map keeps the **left ~37%** of the viewport clear (matching
`STORY_LANDSCAPE_FOCUS_AREA`). The right **63vw** column is the content column.
What fills it depends on `hasChart`:

- **With a chart** (`landscapeSlotClasses`, lines 263-274): the persistent chart
  panel owns the **top-right 63vw × 50vh** (`StoryMapShell.tsx` lines 331-345:
  `right-0`, `w-[63vw]`, `h-[50vh]`). The text card stacks **directly beneath it**
  in the bottom half — `right-0`, `top-[50vh]`, `w-[63vw]`, `h-[50vh]`, `p-10`.
  The bottom-left 37% stays clear for the map focal area.
- **Without a chart** (lines 275-284): the text card claims the **right 63vw ×
  full height** (`right-0`, `top-0`, `w-[63vw]`, `h-screen`, `p-10`) — reusing
  the chart slot so hero titles, stat numbers, and act intros get the same prime
  real estate the graph would have.

In landscape the card also gets `overflow-y-auto`, `max-w-none`, and `max-h-none`
so long copy scrolls within the card.

The text card body is rendered by sub-panels (lines 380-477):

- `TextPanel` — heading (mono, uppercase, accent) + serif paragraphs; supports
  inline markdown and bullet lists; shows `[missing markdown anchor: …]` when
  the anchor resolved empty.
- `StatPanel` (`kind: stat`) — a giant serif number (`clamp(3.5rem,11vw,7.5rem)`)
  colored by the `color` token, with `subheading` + caption beneath.
- `HeroPanel` family (`kind: hero`) — title + dek + byline + eyebrow.

#### The `hero-full-bleed` special case

When `kind: hero` + `layout: hero-full-bleed` + a `heading` and the unit is the
hero title (lines 153-201), the section renders **full-bleed**: an in-flow
foreground image (in deck/in-flow), a bottom gradient scrim, and the headline
overlaid at `left/right: 6vw, bottom: 8vh`, with `zIndex: 20` on the section
(the reason the scroll container must not create a stacking context).

---

### Mobile behavior — `mobileParagraphs` splitting

`useIsMobile()` and "portrait" share the same `(max-aspect-ratio: 1/1)`
breakpoint (`StoryMapShell.tsx` lines 137-140). When portrait **and**
`mobileUnits` is provided, the shell renders the **mobile unit array** instead
of the desktop one (line 145). On a portrait↔landscape flip, `activeUnit` resets
to 0 and the scroll container scrolls to top (lines 151-158) so it doesn't land
on a stale snap that no longer exists in the new array.

`resolveUnits` builds the mobile array (`packages/content-source/src/resolveUnits.ts`):

- A subsection/section **without** `mobileParagraphs` produces one mobile unit
  identical to its desktop counterpart (`sliceIndex: 0`).
- A subsection/section **with** `mobileParagraphs` expands into **one mobile
  unit per entry** (lines 104-120, 224-243). Each entry slices the resolved
  paragraphs with `[start, end]` (`Array.slice`) semantics. Only the **first**
  slice (`sliceIdx === 0`) carries the `heading`/`subheading`; later slices
  carry only their paragraph slice. Each mobile unit records its `sliceIndex`.

```yaml
- id: malacca-lens
  text: "The Malacca lens"
  mobileParagraphs:   # desktop = 1 snap; mobile = 3 snaps
    - [0, 1]
    - [1, 2]
    - [2, 3]
  map:
    center: [85.0, 12.0]
    zoom: 3.1
```

*(from `great-nicobar-project.config.yaml` — one desktop unit, three portrait snaps)*

Because portrait snaps **clip rather than scroll**, splitting one long desktop
unit into several short slices avoids text overflow on small screens. All the
split mobile units share the **same `(parentIndex, subIndex)`** — so they share
the parent's camera and chart, and consecutive slices fly the same camera and
scrub the same chart `activeStep`.

#### Chart reveal on multi-slice groups

When a `mobileParagraphs` split produces consecutive units with the same
`(parentIndex, subIndex)`, the shell hides the chart on the **first** slice
(`isFirstOfMultiSlice`, `StoryMapShell.tsx` lines 197-210, 219-220). The reader
sees only the map + first paragraph; the chart then animates in on the second
slice alongside the second paragraph. This is `showChart` gating and applies
**only off-deck** — deck sections carry their copy inside the foreground, so the
foreground renders on every slice (lines 222-230).

#### Hero split on mobile

A `kind: hero` (or `cover`) section always splits into **two** mobile units
regardless of `mobileParagraphs` (`resolveUnits.ts` lines 197-223): a
`heroPart: 'title'` unit (eyebrow + title, empty paragraphs) and a `heroPart:
'dek'` unit (the dek `*…*` and byline `**…**`). The dek section is
**portrait-only** (`[@media(min-aspect-ratio:1/1)]:hidden`,
`MapStorySection.tsx` line 340) so landscape shows the full `HeroPanel` once.
`heroPart` is `undefined` on desktop units, where both halves render under one
`data-unit-index`.

#### Mobile unit identity

A mobile unit's identity is `(parentIndex, subIndex, sliceIndex)`
(`storyConfig.types.ts` lines 732-741) — used by the TTS pipeline and
`mapOverrides` so per-unit overrides survive content tweaks within the same
section. `desktopToMobile` (returned by `resolveUnits`) maps each desktop unit
index to the array of mobile unit indices that compose it (lines 56-63), so
autoplay can queue several TTS segments back-to-back for one desktop beat.

---

### Format dispatch: map vs deck inside the same shell

`StoryMapShell` serves both `format='map'` (default) and `format='deck'`. The
relevant branches:

- **Legacy chart panel** (`showChart`, lines 219-220) renders only for
  flat-foreground units in **map**-format stories that are not the first slice
  of a multi-slice group. Its positioning (right 63vw × 50vh) assumes the map's
  left-half clear area.
- **Region foreground** (`showRegions`, lines 227-230) renders when a unit opts
  into `foreground: { layout, regions }`, **or** for any deck unit with a
  foreground. Deck stories always route through `ForegroundLayoutSlot` because
  the legacy panel would jam deck slots into the wrong viewport third.
- **Deck in-flow** (`deckInFlow`, line 269): in the live `scroll` mode, deck
  sections render their foreground **inside** each snap target (in the scroll
  flow) so content scrolls with the page like map-format text cards.
  Autoplay/capture/print keep the deterministic fixed-overlay path.
- **Progress rail** (`showProgress`, lines 274-275): deck-only, gated on
  `defaults.progress: true`, hidden in autoplay/capture. Clicking a tick calls
  `scrollIntoView({ behavior: 'smooth' })` on the target unit (lines 277-284).

Map-format stories never set `format` (or set `format: map`), so they always
take the legacy chart-panel / text-card paths described above.

---

## Map data & styling options (+ map module)

The `map` module is the persistent WebGL basemap that anchors `format: map` ("map-anchored scrollytelling") stories. Every section carries its own camera state via a `map:` block; subsections and per-viewport (`mobile`) blocks override it as the reader scrolls. The same module can also mount as a *foreground* vizslot in deck stories, where it renders one self-contained map per slot.

The config shapes live in `packages/viz-engine/src/types/story.ts` (the runtime data layers: `MapStep`, `MapPin`, `MapRegion*`, `Heatmap*`, `MapTextLabel`) and `packages/viz-engine/src/lib/storyConfig.types.ts` (the author-facing config: `StoryDefaults`, `MapOverrides`, `MapPinConfig`, `MapPalette`, `basemapConfig`). The renderer is `packages/viz-engine/src/charts/MapboxBackground.tsx`; per-story palette/fontstack live in `packages/viz-engine/src/lib/applyMapPalette.ts`; worldview handling in `packages/viz-engine/src/lib/mapboxWorldview.ts`.

> **Coordinate convention:** every `coordinates` and `center` is a `[lng, lat]` tuple (longitude first). Wrong order silently places the camera/pin in the ocean.

> **Theme tokens:** color fields that pass through the renderer's `resolveThemeToken` / `resolveTokenColor` helpers accept either a hex string (`"#d8804a"`), a `$token` shorthand (`"$accent"`, `"$surface"`, `"$bg"`, `"$text"`, `"$teal"`, `"$muted"`, `"$line"`, `"$positive"`, `"$red"`, `"$accent2"`, `"$amber"`) resolved against the active theme's CSS vars, or a `var(--color-x, #hex)` string (the hex fallback is extracted for Mapbox paint). Where a field is fed straight into a Mapbox *paint expression* without that helper (notably `highlightColor` and `mapPalette.*` colors), it must be a **concrete** color — Mapbox rejects CSS vars and `$tokens` there. This is called out per-field below.

### Where the map config lives

In `<slug>.config.yaml`:
- `defaults:` — story-wide map style + pin/fly defaults + palette/basemap (the `StoryDefaults` object).
- Each entry in `sections:` carries a `map:` block (the per-section camera + data layers).
- A section may declare `subsections:`, each with its own partial `map:` override.
- A `map.mobile:` sub-block (and subsection `map.mobile:`) overrides framing on portrait viewports.
- A separate `<slug>.map.yaml` (the `overrides:` schema in `packages/viz-engine/src/lib/storyMapOverrides.ts`) overrides camera/pins **only for autoplay (`?autoplay=1`) renders** — see [Autoplay overrides](#autoplay-camera-overrides-slugmapyaml).

```yaml
defaults:
  mapStyle: mapbox://styles/mapbox/dark-v11
  mapOpacity: 0.55
  pinColor: "#c77a48"
  pinRadius: 12
  flySpeed: 1.2

sections:
  - id: hero
    kind: hero
    text: "The Shrinking European House"
    map:
      center: [15.0, 52.0]
      zoom: 3.1
      pitch: 0
      bearing: 0
      opacity: 0.45
```

---

### Camera (per-section `map:` and overrides)

The camera is the only **required** part of a map section: the loader enforces `center` + `zoom` on every map-format section (`packages/viz-engine/src/modules/map/index.ts` `parseConfig` throws `map layer requires 'center'` / `'zoom'`). Other camera fields are optional with the defaults below.

When the reader scrolls into a unit, `MapboxBackground` `flyTo`s the new pose (speed `step.flySpeed ?? 1.2`, curve `1.42`). Under `prefers-reduced-motion` or share/PDF capture (`staticCapture`), it `jumpTo`s instead.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `center` | `[number, number]` (`[lng, lat]`) | — (**required** on map sections) | Geographic focal point. Validated by the loader; missing/non-2-tuple throws. |
| `zoom` | `number` | — (**required** on map sections) | Mapbox zoom level (≈0 world … ≈22 building). |
| `pitch` | `number` | `0` | Camera tilt in degrees (0 = straight down). 3D buildings on Standard styles need pitch + zoom ≳15 to be visible. |
| `bearing` | `number` | `0` | Camera rotation in degrees (0 = north up). |
| `flySpeed` | `number` | `defaults.flySpeed` → Mapbox `1.2` | `flyTo` animation speed for the transition *into* this step. Lower = slower glide. Falls back to `defaults.flySpeed`, then `1.2`. |
| `opacity` | `number` (0..1) | `defaults.mapOpacity` → `1` | Opacity of the whole map canvas for this step (CSS-cross-faded over 800ms via `--map-fade`). Used to mute the basemap behind text-heavy beats. |
| `pins` | `MapPin[]` | — | Markers for this step. See [Pins](#pins). |
| `regions` | `MapRegionLayer` | — | Choropleth for this step. See [Choropleth regions](#choropleth-regions). |
| `heatmap` | `HeatmapLayer` | — | Heatmap for this step. See [Heatmap](#heatmap). |
| `textLabels` | `MapTextLabel[]` | — | Free-floating text labels (no marker). See [Free text labels](#free-text-labels). |
| `mobile` | `MapOverrides` | — | Portrait-viewport overrides (see below). On the parent `map:` block only its camera/data fields apply; `mobile` itself can't nest another `mobile`. |

Sources: `MapStep` (`packages/viz-engine/src/types/story.ts`); the author-facing section `map` shape (`packages/viz-engine/src/lib/storyConfig.types.ts` `StorySectionConfig.map`); defaults applied in `packages/viz-engine/src/modules/map/Component.tsx` (`flySpeed ?? defaults.flySpeed`, `opacity ?? defaults.mapOpacity`); fly/jump logic in `MapboxBackground.tsx`.

#### `map.mobile:` (portrait override)

`SubsectionMapOverride.mobile` / section `map.mobile` is a `MapOverrides` object: any of `center`, `zoom`, `pitch`, `bearing`, `opacity`, `flySpeed`, `pins`, `regions`, `heatmap`, `textLabels`. On a portrait (9:16 / mobile) viewport these replace the corresponding desktop fields. Scalars merge field-by-field; `pins`/`regions`/`heatmap`/`textLabels` **replace** (do not merge) the parent's. Use it to pull the camera in tighter so pins aren't hidden behind the bottom text card.

```yaml
  - id: bangladesh
    map:
      center: [90.0, 24.0]
      zoom: 4.5
      pins:
        - coordinates: [90.4125, 23.8103]
          label: "Dhaka — Ansar-VDP, BGB, Army"
          color: "#c9302c"
      mobile:
        center: [90.4125, 23.8103]
        zoom: 5.5
```

#### Subsection overrides

A section may declare `subsections:`. Each subsection is its own scroll-snap unit but shares the parent's map instance. A subsection's `map:` (a `SubsectionMapOverride`) is a partial override of the parent's `map:`: any field set here replaces the parent's; `pins`/`regions`/`heatmap`/`textLabels` replace wholesale (so you can progressively reveal markers per step). Each subsection `map:` may itself carry a `mobile:` block. Resolution order for the mobile view is: subsection `map.mobile` → parent `map.mobile` → none (`packages/viz-engine/src/lib/storyMapOverrides.ts` `buildMapTargets`).

`MapOverrides` (`packages/viz-engine/src/lib/storyConfig.types.ts`):

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `center` | `[number, number]` | inherit parent | Override focal point. |
| `zoom` | `number` | inherit parent | Override zoom. |
| `pitch` | `number` | inherit parent | Override tilt. |
| `bearing` | `number` | inherit parent | Override rotation. |
| `opacity` | `number` | inherit parent | Override canvas opacity. |
| `flySpeed` | `number` | inherit parent | Override fly speed into this subsection. |
| `pins` | `MapPinConfig[]` | inherit parent | **Replaces** the parent's pins entirely. |
| `regions` | `MapRegionLayer` | inherit parent | **Replaces** the parent's choropleth. |
| `heatmap` | `HeatmapLayer` | inherit parent | **Replaces** the parent's heatmap. |
| `textLabels` | `MapTextLabel[]` | inherit parent | **Replaces** the parent's text labels. |
| `mobile` | `MapOverrides` | — | Portrait-only override layered on top of this subsection's resolved view. |

---

### Pins

Markers are DOM `mapboxgl.Marker` elements (a colored circle, optionally with a circular image and/or a pulse animation), with an optional popup label. Pins are diffed across steps by a key built from `coordinates + label + image`, so unchanged pins survive transitions. The author-facing shape is `MapPinConfig` (`storyConfig.types.ts`); the runtime adds `opacity` via `MapPin` (`types/story.ts`). The rendering lives in `MapboxBackground.tsx` (pin diff/build block).

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `coordinates` | `[number, number]` (`[lng, lat]`) | — (**required**) | Marker position. |
| `color` | string (theme token or hex) | `defaults.pinColor` → `var(--color-accent, #D85A30)` | Fill color of the dot. With `image`, becomes the ring/border around the image. Resolved via `resolveTokenColor` (accepts `$token`/hex/`var()`). |
| `label` | string | — | Popup text shown beside the marker. Omit for a bare dot. Rendered in a mono-font pill; wraps in capture mode, single-line otherwise. |
| `radius` | number (px) | `defaults.pinRadius` → `12` | Circle radius; the DOM element is `radius*2` square. |
| `opacity` | number (0..1) | `0.85` | Marker opacity. (Runtime-only field on `MapPin`; not exposed on `MapPinConfig`, so author YAML doesn't surface it directly in the typed section path, but it is read from the step.) |
| `pulse` | boolean | `true` (only `false` disables) | Animated expanding-ring pulse. The code treats any value other than explicit `false` as on (`pin.pulse !== false`). |
| `labelAnchor` | `'top' \| 'bottom' \| 'left' \| 'right'` | auto | Which side of the pin the label sits on. Internally inverted to a Mapbox popup anchor. Omit to let Mapbox auto-place. |
| `image` | string | — | Image rendered inside the pin (circular crop). Accepts `assets://<key>`, an absolute `http(s)` URL, or a same-origin `/path` (resolved by `resolveAssetUrl`). When set, `color` becomes the ring. |

```yaml
    map:
      center: [108.0, 16.0]
      zoom: 4.2
      pins:
        - coordinates: [105.8342, 21.0278]
          label: "Hanoi — 5.3M reserves"
          color: "#c9302c"
          labelAnchor: top
        - coordinates: [120.9842, 14.5995]
          label: "Manila — 1.5M reserves"
          color: "#d4a84a"
          labelAnchor: top
```

```yaml
      pins:
        - coordinates: [93.85, 7.0]
          label: "Galathea Bay"
          pulse: true
```

> The pulse keyframe color in the global stylesheet is a fixed accent-orange `rgba(216,90,48,…)`; the marker's own `box-shadow` seed uses the resolved `color`, so a non-orange pin pulses with a slight orange tail. This is a known cosmetic detail in `MapboxBackground.tsx`.

---

### Choropleth regions

A `regions:` block colors administrative areas. Two modes:
- **`level: country`** — uses Mapbox's built-in `country-boundaries-v1` tileset; `code` is an ISO 3166-1 alpha-2 country code (`"NO"`, `"DE"`). No `geojsonUrl` needed.
- **`level: custom`** — fetches author-supplied GeoJSON from `geojsonUrl` and matches features by `idProperty`; `code` is whatever value that property holds (coerced to string, so numeric ids like `33` match `"33"`).

Fill color per region is either an explicit `color` or a `value` interpolated through `colors`+`ramp` (`buildRegionColorMap` in `MapboxBackground.tsx`). The region fill/line layers are inserted beneath the first label layer so labels stay readable. Defining `regions` on a single-country layer also picks the matching worldview polygon (e.g. a lone `IN` renders PoK + Aksai Chin inside India). Source: `MapRegionLayer` / `MapRegion` (`types/story.ts`), `applyRegionLayer` (`MapboxBackground.tsx`).

#### `MapRegionLayer`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `level` | `'country' \| 'custom'` | — (**required**) | Boundary source. `custom` requires `geojsonUrl` + `idProperty`. |
| `geojsonUrl` | string | — (required for `custom`) | URL or `/public`-served path to a GeoJSON FeatureCollection. Missing → the layer is skipped with a console warning. |
| `idProperty` | string | — (required for `custom`) | Feature property whose value matches each `items[].code`. Coerced to string for matching. |
| `items` | `MapRegion[]` | — (**required**) | The regions to color. Empty → nothing drawn. |
| `colors` | `string[]` (≥2) | — | Color stops for the value→color ramp. Theme tokens or hex; resolved before paint. Items with a `value` (and no explicit `color`) interpolate between adjacent stops. Fewer than 2 stops disables ramping (items fall back to the accent). |
| `ramp` | `number[]` | auto `[min..max]` of `items[].value` evenly spaced across stops | Domain values matching `colors` length. If omitted (or length mismatched), auto-computed from the items' value range. |
| `lineColor` | string (theme token or hex) | last entry of `colors` → accent (resolved `defaultPinColor`) | Border line color. Resolved via theme token. |
| `lineWidth` | number (px) | `0.6` | Border width. (Line opacity is fixed at `0.85`.) |
| `labels` | `MapRegionLabels` | — | Auto place-name labels on each region. See below. |
| `legend` | `MapLegendConfig` | — | Color-ramp legend overlay drawn on **share cards** (not the scroll story). See below. |

#### `MapRegion` (each entry in `items`)

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `code` | string | — (**required**) | ISO alpha-2 (`level: country`) or the feature id (`level: custom`). |
| `color` | string (theme token or hex) | — | Explicit fill. Overrides the ramp. |
| `opacity` | number (0..1) | `0.55` | Fill opacity for this region. |
| `value` | number | — | Numeric value driving the ramp when `color` is omitted. Out-of-domain values clamp to the end stops. |
| `label` | string | — | Reserved for future hover logic; safe to omit. |

```yaml
      regions:
        level: country
        ramp: [18, 30, 42, 56]
        colors: ["$red", "$surface", "$accent2", "$accent"]
        items:
          - code: "NO"
            value: 56.3
          - code: "DK"
            value: 48.4
          - code: "CH"
            value: 47.0
```

```yaml
      regions:
        level: custom
        geojsonUrl: "https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson"
        idProperty: "ID_1"
        items:
          - code: "33"          # Uttar Pradesh
            color: "$positive"
            opacity: 1.00
          - code: "5"           # Bihar
            color: "$positive"
            opacity: 0.77
```

#### `MapRegionLabels` (`regions.labels`)

When `show: true`, a collision-detected Mapbox symbol layer is added at each region's centroid, rendering its name (for `level: country`, a built-in ISO→English name lookup turns `"US"` into `United States`; otherwise the raw `code` is used) plus an optional value. Source: `addRegionLabelSymbolLayer` / `buildRegionLabelTextField` (`MapboxBackground.tsx`).

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `show` | boolean | `false` | Master toggle. No label layer unless true. |
| `withValue` | boolean | `false` | Append each region's `value` after its name (e.g. `Bihar 8`). Only applies to items that have a numeric `value`. |
| `valueDecimals` | number | `0` | Decimals when rendering the value. |
| `valuePrefix` | string | `''` | Text before the value (e.g. `"$"`). |
| `valueSuffix` | string | `''` | Text after the value (e.g. `"%"`). |
| `valueOnNewLine` | boolean | `false` | Render the value on its own line below the name (uses a literal `\n` in the Mapbox text-field). |
| `color` | string (theme token or hex) | `$text` | Label text color. |
| `size` | number (px) | `11` | Text size. |
| `codes` | `string[]` | — (all `items` get labels) | Allowlist of region codes to label. When present (non-empty), only these are labeled **and** they force `text/icon-allow-overlap` + `ignore-placement` on (so curated labels always render even over base-style place names). Without an allowlist, collision detection thins a dense set. |
| `background` | `MapLabelBackground` | — (text-only with halo) | Draw a rounded-pill backdrop behind each label. When present, the text halo is dropped (the pill replaces it). See below. |

#### `MapLabelBackground` (`regions.labels.background`)

A stretchable rounded-rect icon drawn behind each label (generated once per unique appearance and registered with the map). Source: `ensurePillIcon` (`MapboxBackground.tsx`); type in `types/story.ts`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `color` | string (theme token or hex) | `$bg` | Pill fill color. |
| `opacity` | number (0..1) | `1` | Pill fill opacity. |
| `padding` | `[number, number]` (`[vertical, horizontal]` px) | `[3, 6]` | Padding inside the pill (applied via `icon-text-fit-padding`). |
| `cornerRadius` | number (px) | `4` | Pill corner radius. |
| `borderColor` | string (theme token or hex) | — (no stroke) | Optional pill border color. |
| `borderOpacity` | number (0..1) | `1` | Border opacity (only with `borderColor`). |
| `borderWidth` | number (px) | `0` | Border width; `0` = no stroke even if `borderColor` set. |

```yaml
      regions:
        level: custom
        geojsonUrl: "…/united-states.geojson"
        idProperty: "name"
        ramp: [0, 100]
        colors: ["$surface", "$positive"]
        labels:
          show: true
          withValue: true
          valueOnNewLine: true
          valueSuffix: "%"
          valueDecimals: 1
          size: 14
          color: "$text"
          background:
            color: "$bg"
            opacity: 0.6
            padding: [4, 8]
            cornerRadius: 6
            borderColor: "$line"
            borderOpacity: 0.5
            borderWidth: 0.5
          codes:
            - "Maine"
        items:
          - { code: "Maine", value: 74.9 }
```

#### `MapLegendConfig` (`regions.legend`)

A DOM overlay legend rendered above the map **on share cards** (`apps/vizmaya-fyi/components/share/MapLegend.tsx`); it does not appear in the scrolling story or in the live catalog preview. It auto-picks a continuous color ramp (when a `regions` layer with ≥2 `colors` is present) or a discrete swatch row (when only multi-color pins are present). Type defined in `types/story.ts`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `show` | boolean | `true` (in the merged config) | Toggle the legend. The component defaults `show: true` and `position: 'bottom-left'` when a regions/pins legend is renderable; set `show: false` to suppress. |
| `title` | string | — | Caption above the ramp (uppercased, tracked). |
| `lowLabel` | string | — | Label at the low end of the ramp. |
| `highLabel` | string | — | Label at the high end. |
| `ticks` | number | `colors.length` | Number of numeric tick labels under a continuous ramp. |
| `valueDecimals` | number | `0` | Decimals when formatting numeric ticks. |
| `valuePrefix` | string | `''` | Prefix on tick values (e.g. `"$"`). |
| `valueSuffix` | string | `''` | Suffix on tick values (e.g. `"%"`). |
| `position` | `'top-left' \| 'top-right' \| 'bottom-left' \| 'bottom-right' \| 'top' \| 'bottom'` | `'top-left'` (type default) / `'bottom-left'` (component default) | Vertical edge of the card. Note: in the current `MapLegend` implementation every position renders a **full-width strip**; the four corner names are retained as aliases and only choose the vertical edge. |

```yaml
      regions:
        level: custom
        geojsonUrl: "…/united-states.geojson"
        idProperty: "name"
        colors: ["$surface", "$accent"]
        legend:
          show: true
          title: "Living-wage threshold"
          lowLabel: "Lower"
          highLabel: "Higher"
          valuePrefix: "$"
          ticks: 4
          position: "bottom"
        items:
          - { code: "Hawaii", value: 141127 }
          - { code: "Massachusetts", value: 118431 }
```

---

### Heatmap

A Mapbox `heatmap` layer driven by weighted points. Inserted beneath the first label layer. Source: `HeatmapLayer` / `HeatmapPoint` (`types/story.ts`), `applyHeatmapLayer` (`MapboxBackground.tsx`).

#### `HeatmapLayer`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `points` | `HeatmapPoint[]` | — (**required**) | The data points. Empty array → nothing drawn. |
| `radius` | number (px at zoom 9) | `30` | Heatmap blur radius. The layer interpolates from `radius` at zoom 0 to `radius*2` at zoom 15. |
| `maxIntensity` | number | auto (max of `points[].weight`) | Explicit max weight used to normalize `heatmap-weight`. |
| `ramp` | `string[]` | `['rgba(33,102,172,0)', '#2166ac', '#4393c3', '#f4a582', '#b2182b']` | Color stops applied across density 0..1; the first should be transparent/low, the last the hot color. Stops are evenly spaced. (Hex/`rgba()` only — these feed Mapbox paint directly, no token resolution.) |
| `opacity` | number (0..1) | `0.75` | Layer opacity. |

#### `HeatmapPoint` (each entry in `points`)

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `coordinates` | `[number, number]` (`[lng, lat]`) | — (**required**) | Point location. |
| `weight` | number | `1` | Relative intensity, normalized against `maxIntensity`. |

```yaml
    map:
      center: [-95.0, 39.0]
      zoom: 4
      heatmap:
        radius: 40
        opacity: 0.8
        points:
          - { coordinates: [-74.0, 40.7], weight: 5 }
          - { coordinates: [-87.6, 41.8], weight: 3 }
```

---

### Free text labels

`textLabels:` places styled text bubbles at fixed coordinates with no marker circle beneath — for city names, POIs, or contextual callouts not represented by a region. Each is a Mapbox `Marker` whose element is a styled `div` (mono font, weight 600, theme-bg text-shadow halo, `pointer-events: none`). Diffed across steps by `coordinates + text`. Source: `MapTextLabel` (`types/story.ts`), `buildTextLabelElement` / `textLabelAnchor` (`MapboxBackground.tsx`).

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `coordinates` | `[number, number]` (`[lng, lat]`) | — (**required**) | Label position. |
| `text` | string | — (**required**) | The text to render. |
| `color` | string (theme token or hex) | `var(--color-text)` | Text color. |
| `anchor` | `'top' \| 'bottom' \| 'left' \| 'right'` | `center` | Which side of the coordinate the text sits on (internally inverted to a Mapbox marker anchor). |
| `size` | number (px) | `14` (in `buildTextLabelElement`; the type comment says `11`) | Text size. The runtime element uses `label.size ?? 14`. |

```yaml
    map:
      center: [77.0, 28.0]
      zoom: 5
      textLabels:
        - coordinates: [77.21, 28.61]
          text: "New Delhi"
          anchor: top
          size: 13
        - coordinates: [72.88, 19.07]
          text: "Mumbai"
          color: "$muted"
```

---

### Base style & palette

These are story-wide and live under `defaults:`. Source: `StoryDefaults` (`storyConfig.types.ts`), threaded through `Component.tsx` into `MapboxBackground.tsx`, applied by `applyMapPalette` / `applyMapFontstack` (`applyMapPalette.ts`) and `applyAdminWorldview` / `buildCountryFilter` (`mapboxWorldview.ts`).

#### `defaults` map fields

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `mapStyle` | string | — (component falls back to `mapbox://styles/mapbox/dark-v11` when unset) | Mapbox style URL. Classic styles (dark-v11, light-v11, streets-v12) are layer-addressable → honor `mapPalette` + `mapFontstack`. Mapbox v3 Standard / Standard Satellite (URL contains `standard`) are config-driven → honor `basemapConfig` and ignore `mapPalette`/`mapFontstack`. |
| `mapOpacity` | number (0..1) | — (component falls back to `1`) | Default canvas opacity; per-step `opacity` overrides it. |
| `pinColor` | string (theme token / hex / `var()`) | — (component falls back to `var(--color-accent, #D85A30)`) | Default pin fill; also the fallback `lineColor`/highlight color and the region ramp fallback. |
| `pinRadius` | number (px) | — (component falls back to `12`) | Default pin radius. |
| `flySpeed` | number | — (component falls back to `1.2`) | Default `flyTo` speed; per-step `flySpeed` overrides it. |
| `highlightCountry` | string (ISO alpha-2) | — | Fill+outline a single country on load (e.g. `"KR"`, `"IN"`, `"US"`). Uses `country-boundaries-v1`; picks the country's own worldview polygon and rewrites admin-layer worldviews (so for `IN`, PoK + Aksai Chin render inside India). |
| `highlightColor` | string (**concrete** hex; `var(--…, #hex)` accepted) | `pinColor` | Color of the highlight fill (opacity 0.22) + outline (width 1.4, opacity 0.85). Fed to Mapbox paint via `resolvePaintColor`, so `$tokens` do **not** resolve here — use hex. |
| `mapPalette` | `MapPalette` | — | Per-story semantic recolor of a **classic** base style. No effect on Standard styles. See below. |
| `mapFontstack` | `string[]` | — | Mapbox fontstack applied to every text layer (classic styles only). Must reference fonts available on the style's `glyphs:` URL (i.e. uploaded to your Mapbox Studio account, e.g. `["Vizmaya Serif Regular"]`). Unavailable fonts silently fall back. |
| `basemapConfig` | `Record<string, string\|number\|boolean>` | — | Config props for Standard / Standard Satellite styles. See below. |

#### `MapPalette` (`defaults.mapPalette`)

Walks the loaded **classic** style's layers and rewrites paint/visibility (`applyMapPalette`). Color fields must be **concrete** (hex/rgb/hsl) — Mapbox paint rejects CSS vars and these are not token-resolved. The color fields recolor matching layers when set and leave the base style alone when unset. The label/road *category* fields are **hidden by default** (the design keeps the basemap quiet under the story) and a value opts a category back in. Each category field is a `LayerOverride`: `false`/omitted = hide; `true` = show with the base style's own color; a string = show retinted with that color.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `land` | string (concrete color) | base style | Recolors `background` + `land`/`landcover`/`land-*` fills. |
| `water` | string (concrete color) | base style | Recolors `water`, `water*`, `waterway*` fills. |
| `border` | string (concrete color) | base style | Recolors `admin-*-boundary` lines (skips `-disputed`). |
| `labelText` | string (concrete color) | base style | `text-color` for every visible symbol layer with a `text-field` (and the fallback for opted-in label categories). |
| `labelHalo` | string (concrete color) | base style | `text-halo-color` for every visible text symbol layer. |
| `building` | string (concrete color) | base style | Recolors 2D `fill` + 3D `fill-extrusion` building layers. |
| `placeLabels` | `LayerOverride` (`boolean \| string`) | **hidden** | Country / state / settlement / continent / place labels. |
| `roadLabels` | `LayerOverride` | **hidden** | Road / street name labels (incl. road numbers/shields/intersections). |
| `transitLabels` | `LayerOverride` | **hidden** | Transit (bus/subway/rail) labels (`transit-*`). |
| `poiLabels` | `LayerOverride` | **hidden** | POI + airport labels (`poi-label`, `airport-label`). |
| `motorways` | `LayerOverride` | **hidden** | Motorway/highway lines (`*-motorway*` incl. bridge/tunnel casings). |
| `trunkRoads` | `LayerOverride` | **hidden** | Trunk roads (`*-trunk*`). |
| `minorRoads` | `LayerOverride` | **hidden** | Primary/secondary/tertiary/minor/street/service road lines. |
| `pedestrianPaths` | `LayerOverride` | **hidden** | Pedestrian paths, footways, steps. |

```yaml
defaults:
  mapStyle: mapbox://styles/mapbox/dark-v11
  mapPalette:
    land: "#0b1013"
    water: "#0d1418"
    border: "#3a2a20"
    labelText: "#d8cfc2"
    labelHalo: "#0b1013"
    motorways: false
    placeLabels: true        # opt place labels back on with base color
    roadLabels: false
```

#### `basemapConfig` (Standard / Standard Satellite styles)

Applied via `map.setConfigProperty('basemap', key, value)` on load and seeded into `config.basemap` at construction so the first paint is already correct. **Only meaningful on Standard styles** (`mapbox://styles/mapbox/standard`, `…/standard-satellite`); classic styles ignore it (use `mapPalette` instead). Standard styles are not layer-addressable, so `mapPalette` is a no-op on them — use `basemapConfig` to control roads, labels, 3D, and lighting. Unsupported keys for the active style are silently ignored (the `setConfigProperty` call is wrapped in try/catch). Type is an open `Record<string, string|number|boolean>`; documented common keys (from `StoryDefaults.basemapConfig` JSDoc and a real config):

| Key | Type | Description |
| --- | --- | --- |
| `theme` | `'default' \| 'faded' \| 'monochrome'` | Tints the whole basemap. |
| `lightPreset` | `'dawn' \| 'day' \| 'dusk' \| 'night'` | Lighting / time-of-day for 3D objects. |
| `show3dObjects` | boolean | Master 3D toggle (Standard only; ignored on Satellite). |
| `show3dBuildings` | boolean | 3D buildings toggle (Standard only). Need pitch + zoom ≳15 to be visible. |
| `showRoadLabels` | boolean | Road names + shields. |
| `showPlaceLabels` | boolean | City/place names. |
| `showPointOfInterestLabels` | boolean | POI labels. |
| `showTransitLabels` | boolean | Transit labels. |
| `showRoadsAndTransit` | boolean | Standard Satellite — roads + transit lines. |
| `showPedestrianRoads` | boolean | Standard Satellite — pedestrian roads. |

```yaml
defaults:
  mapStyle: mapbox://styles/mapbox/standard
  mapOpacity: 0.6
  pinColor: "#e26d5c"
  basemapConfig:
    theme: monochrome
    lightPreset: dusk
    show3dObjects: true
    showRoadLabels: false
    showPointOfInterestLabels: false
    showTransitLabels: false
    showPlaceLabels: true
```

#### `highlightCountry` example

```yaml
defaults:
  mapStyle: mapbox://styles/mapbox/dark-v11
  highlightCountry: "IN"     # PoK + Aksai Chin render inside India's outline
  highlightColor: "#d68c3a"  # concrete hex — $tokens do not resolve here
```

> **Supported worldviews:** only `AR, CN, IN, JP, MA, RU, TR, US` ship separate worldview polygons in `country-boundaries-v1` (`mapboxWorldview.ts`). For any other `highlightCountry`/single-country `regions` code, the renderer falls back to a plain ISO match and skips the admin-worldview rewrite.

---

### Autoplay camera overrides (`<slug>.map.yaml`)

A separate sidecar file applied **only** when the story is rendered with `?autoplay=1` (the muted, video-shaped playback); scroll-mode readers see the untouched `<slug>.config.yaml`. Schema + merge in `packages/viz-engine/src/lib/storyMapOverrides.ts`. Identity is `(parentIndex, subIndex?)`; scalar fields (`center`/`zoom`/`pitch`/`bearing`/`opacity`/`flySpeed`) merge field-by-field, while `pins`/`regions`/`heatmap` **replace**. A `mobile:` sub-block applies on portrait (9:16) autoplay. Out-of-bounds targets are silently skipped so the override file can lag behind structural edits.

```yaml
overrides:
  - target: { parentIndex: 1 }            # parent section's map: block
    map:
      center: [-95, 40]
      zoom: 4
      pins: [...]
  - target: { parentIndex: 1, subIndex: 0 }  # a subsection's map: block
    map:
      zoom: 5
      mobile:                              # 9:16 portrait autoplay only
        zoom: 3
```

---

### Map module metadata & mounting

From `packages/viz-engine/src/modules/map/index.ts`:
- `type: 'map'`, `label: 'Map'`, valid in both `background` and `foreground` slots.
- `mountingMode: 'persistent-aggregated'` — in the **background** slot, ONE shared Mapbox WebGL context serves the whole story (every unit's config aggregated; `stableIdentity` is the constant `'map:default'`, so background and foreground maps each dedupe to one context). In the **foreground** slot, each map owns its own context (so a story mixing background-map + foreground-map slots pays for two contexts).
- `readinessProfile: 'tiles-then-settle'`, `regionPreferences: ['lead']`.
- Foreground per-unit rendering (`Component.tsx`) applies the `defaults` fallbacks for `pinColor`/`pinRadius`/`flySpeed`/`mapOpacity` and forwards `highlightCountry`/`highlightColor`/`mapPalette`/`mapFontstack`/`basemapConfig` to `MapboxBackground`.
- `parseConfig` only hard-validates `center` + `zoom`; all other fields are shape-validated downstream by `MapboxBackground` (and by the loader's per-section validators in `lib/storyConfig.ts`).

The catalog sample (`packages/viz-engine/src/modules/map/sample.ts`) is the minimal valid map config — it requires `NEXT_PUBLIC_MAPBOX_TOKEN` to render, otherwise the catalog falls back to a chip:

```yaml
type: map
center: [-74.0, 40.71]
zoom: 3
pitch: 0
bearing: 0
```

---

## Deck format — shell, snap scroll, backdrop & progress

The **deck** format renders a story as a vertically snap-scrolled slide deck:
each section (or, for sections with `subsections`, each subsection) becomes one
viewport-tall slide composed of foreground vizslots floating over a single
page-level backdrop. It is the alternative to the map-anchored format, selected
per story via frontmatter:

```yaml
# <slug>.md frontmatter
format: "deck"      # default is "map" when omitted
```

`format` is typed `StoryFormat = 'map' | 'deck'` in
`packages/viz-engine/src/types/story.ts` (declared on `Frontmatter.format`,
optional, default `'map'`). The story page route
(`apps/vizmaya-fyi/app/story/[slug]/page.tsx`) reads `story.frontmatter.format`,
mounts the page-level backdrop only for deck stories, and forwards
`format={story.frontmatter.format ?? 'map'}` into the single shared shell
component `StoryMapShell`. There is no separate `DeckStoryShell` — both formats
run through `StoryMapShell`, which branches internally on
`const isDeckFormat = format === 'deck'`
(`packages/story-reader/src/components/story/StoryMapShell.tsx`).

> Note on the spec: `apps/vizmaya-fyi/docs/deck-format-spec.md` is the original
> *proposal* and predates the implementation. Where it describes a separate
> `DeckStoryShell` / `DeckSection` / z-index values like `-9`/`-10`, treat the
> source files cited below as authoritative — the deck was built on top of the
> existing map shell rather than as a parallel component tree.

### Routing every section through the foreground-layout slot

The single most important deck behavior: **every deck section is routed through
`<ForegroundLayoutSlot>` (the region-aware path), even when the section declares
no `layout:`**. In the map format, a section with a flat `foreground:` (an
unwrapped layer array, not `{ layout, regions }`) renders through the legacy
fixed chart panel — positioned for a map's right-hand column (`63vw × 50vh`,
top-right). Jamming a deck slot into that box would push it into the wrong third
of the viewport, since there is no map left-half to balance against.

So in `StoryMapShell` (`packages/story-reader/src/components/story/StoryMapShell.tsx`):

- A flat foreground on a deck section is synthesized into a single-region `free`
  layout before rendering:

  ```ts
  // currentResolvedForeground useMemo
  if (isDeckFormat && resolved.kind === 'flat') {
    return { kind: 'regions', layout: 'free', regions: { default: resolved.layers } }
  }
  ```

- The legacy chart panel is gated off for deck entirely:
  `showChart = !isDeckFormat && !usesRegions && currentForeground.length > 0 && !isFirstOfMultiSlice`.
- The region path is force-enabled for deck:
  `showRegions = current != null && (usesRegions || (isDeckFormat && currentForeground.length > 0)) && (isDeckFormat || !isFirstOfMultiSlice)`.

The same flat→`free`-region synthesis is repeated in `MapStorySection` for the
live-scroll in-flow path (see below), so a deck section without `layout:` still
gets the deck safe-area inset and self-positioning slots.

`section.layout:` (when set) is sugar for `foreground: { layout, regions }`; the
2-/3-region grid templates and `free` (honor each slot's `style.position`) are
documented in the foreground-layout section. The point here is only that the
*deck shell guarantees the layout slot path regardless of whether `layout:` is
present*.

### Snap-scroll container and the per-unit slide

The scrollable element is **not** the page body — it is an inner container owned
by `StoryMapShell`:

```tsx
<div
  ref={containerRef}
  className="relative h-svh overflow-y-scroll overscroll-contain snap-y snap-mandatory"
>
  {units.map((unit, i) => (
    <MapStorySection unitIndex={i} unit={unit} … />
  ))}
</div>
```

(`packages/story-reader/src/components/story/StoryMapShell.tsx`). Key facts:

- The container is `h-svh` (small-viewport-height) with `overflow-y-scroll`,
  `overscroll-contain`, and CSS scroll-snap (`snap-y snap-mandatory`). In
  autoplay mode the class `hide-scrollbar` is appended.
- Each unit is rendered by `MapStorySection` as a `<section>` carrying
  `data-unit-index={i}` and the classes `snap-start snap-always h-svh w-full
  relative` — i.e. **one viewport-tall snap target per unit**
  (`packages/story-reader/src/components/story/MapStorySection.tsx`).
- A **unit** is one viewport-tall snap target (`ResolvedUnit` in
  `packages/viz-engine/src/lib/storyConfig.types.ts`). A section without
  `subsections` produces one unit; a section with N subsections produces N
  units, all sharing the parent's `parentIndex`. On portrait,
  `mobileParagraphs` can split a unit into several consecutive units sharing the
  same `(parentIndex, subIndex)`.
- A single `IntersectionObserver` (root = `containerRef.current`, `threshold:
  [0.55]`) watches every `[data-unit-index]` element and sets `activeUnit` to
  the most-visible one. Using the inner container as the observer root (rather
  than the body) keeps the fixed background/foreground stable on iOS Safari and
  fires reliably as each snap settles.
- The container deliberately carries **no `z-index`**: a `z-0` here would create
  a stacking context that traps the hero full-bleed section's inline
  `zIndex: 20` beneath the foreground image layer (z-10).

The `?capture=1` (Playwright video) and `?autoplay=1` flags switch the render
`mode` to `'capture'` / `'autoplay'`; otherwise `mode = 'scroll'`. The
`?embed=1` flag suppresses the persistent brand logo for chrome-less consumer
embeds.

#### Deck in-flow rendering (`deckInFlow`)

In the live `scroll` experience only, deck sections render their foreground
**inside each snap target** rather than in a single fixed overlay that
hard-swaps the active unit:

```ts
const deckInFlow = isDeckFormat && mode === 'scroll'
```

This is passed to `MapStorySection` as `renderForegroundInline={deckInFlow}`, so
the foreground scrolls with the page (smooth section-to-section transitions, and
wheel/touch over any slot reaches the scroller). When `deckInFlow` is true the
shell's fixed region overlay is suppressed (`showRegions && current &&
!deckInFlow`). For `autoplay`/`capture`/`print` the deck keeps the deterministic
**fixed-overlay** path the video/PDF pipelines depend on.

### DeckScrollConfig — `defaults.scroll`

```yaml
defaults:
  scroll:
    mode: snap          # snap | continuous
    paddingY: "12vh"
```

`DeckScrollConfig` (`packages/viz-engine/src/lib/storyConfig.types.ts`):

| Option | Type | Default | Description |
|---|---|---|---|
| `scroll.mode` | `'snap' \| 'continuous'` | — (required if `scroll:` present) | `snap` = slide-deck feel, each section one viewport-tall snap target; `continuous` = cinematic scroll without snap. **Currently advisory** — see note below. |
| `scroll.paddingY` | `string` (CSS length) | undefined | Intended top/bottom viewport padding per slide. **Currently advisory** — not read by the render code. |

**Important — `scroll` is presently advisory only.** The type comment states
"Currently advisory; honored by the deck shell," and grep confirms neither
`scroll.mode` nor `paddingY` is read anywhere in `packages/story-reader`,
`packages/viz-engine`, or `apps/vizmaya-fyi`. The snap container is hardcoded to
`snap-y snap-mandatory` and each section to `snap-start snap-always h-svh`, so in
the current implementation **every deck behaves as `mode: snap`** regardless of
this config. Authors should still set it (the live decks set `mode: snap`,
`paddingY: "12vh"`) so the intent is recorded for when it is wired up.

### The page-level persistent backdrop (StoryBackgroundSlot)

The backdrop is mounted **once** at the page level, *outside* the snap
container, so it persists across every slide (an aura iframe mounted per-section
would re-mount expensively on each scroll). It is rendered in the page route,
gated to deck stories that actually have a backdrop:

```ts
// app/story/[slug]/page.tsx
const isDeck = story.frontmatter.format === 'deck'
const backgroundConfig = config.defaults.storyBackground
const hasBackdrop = isDeck && (backgroundConfig != null || !!story.frontmatter.aura)
…
{hasBackdrop && (
  <>
    <StoryBackgroundSlot config={backgroundConfig} frontmatterAura={story.frontmatter.aura} />
    <StoryBackgroundOverlay config={config.defaults.overlay} />
  </>
)}
```

Map stories never mount this — they own their backdrop through Mapbox per
section.

#### Resolution order

`StoryBackgroundSlot`
(`packages/story-reader/src/components/story/StoryBackgroundSlot.tsx`) resolves
its config in this exact order:

1. `config` — i.e. `defaults.storyBackground` (explicit config).
2. `frontmatterAura` — i.e. `frontmatter.aura` (the slug that also drives the
   home-grid tile background). When present, it becomes
   `{ type: 'aura', slug: frontmatterAura }`.
3. `{ type: 'none' }` — renders nothing (`return null`).

```ts
const resolved = config ?? (frontmatterAura ? { type: 'aura', slug: frontmatterAura } : { type: 'none' })
```

So a deck story can get an aura backdrop "for free" just by declaring
`aura:` in frontmatter (already needed for the home tile) without any
`defaults.storyBackground` block; declaring `storyBackground` overrides it.

#### Layering and print

- The backdrop div sits at `z-index: -2`, `position: fixed; inset: 0;
  pointer-events: none`. (For the `aura` variant, `position` is `fixed` when
  `fixed !== false`, else `absolute`.)
- The companion `StoryBackgroundOverlay` (the darken/tint layer) sits at
  `z-index: -1`.
- The story shell's own per-section `background:` slot renders at `z-0`,
  foreground at `z-10+`. So the cascade is: backdrop (`-2`) → overlay (`-1`) →
  per-section background (`0`) → foreground (`10+`).
- In `mode === 'print'` the backdrop collapses to a flat
  `background: var(--color-bg, #000)` solid (animated aurorae render terribly in
  PDFs) and `StoryBackgroundOverlay` returns `null`.
- The aura iframe is rendered only when the host injects an `AuraComponent`.
  vizmaya's binding (`apps/vizmaya-fyi/components/story/StoryBackgroundSlot.tsx`)
  injects `AuraBackground`; headless/brand-agnostic consumers that omit it get
  the tint/structure but no iframe.

### StoryBackgroundConfig variants (exhaustive)

`StoryBackgroundConfig` is a discriminated union on `type`
(`packages/viz-engine/src/lib/storyConfig.types.ts`). The four variants and
their fields:

#### `type: aura`

Mounts the same aura embed used by the home tile, with an optional CSS tint
layer painted above it.

| Option | Type | Default | Required | Description |
|---|---|---|---|---|
| `type` | `'aura'` | — | yes | Discriminator. |
| `slug` | `string` | — | yes | Aura scene slug (`aura.promad.design` / `https://aura.promad.design/embed/<slug>`). |
| `input` | `'on' \| 'off'` | `'off'` (in deck) | no | Whether the aura embed reacts to audio (mic). In `StoryBackgroundSlot` it is forwarded to `AuraComponent` as `input={resolved.input === 'on' ? 'mic' : 'off'}`. |
| `tint` | `string` (CSS color) | undefined | no | Color cast layered above the aura iframe via a blend mode. When unset, no tint layer renders. |
| `tintBlendMode` | `'multiply' \| 'screen' \| 'overlay' \| 'soft-light' \| 'difference' \| 'normal'` | `'multiply'` | no | `mix-blend-mode` for the tint layer (only meaningful when `tint` is set). Defaults to `multiply` when `tint` is present. |
| `fixed` | `boolean` | `true` | no | When true (default), the backdrop is `position: fixed` and stays pinned while the page scrolls; `false` makes it `position: absolute`. |

```yaml
defaults:
  storyBackground:
    type: aura
    slug: blue-abstract-background-patriotic-stars-flowing-lines
    tint: "#070a14"
    tintBlendMode: multiply
    fixed: true
```

(from `apps/vizmaya-fyi/content/stories/money-in-politics-2026.config.yaml`).
A minimal aura with no tint (relies on `defaults.overlay` for darkening):

```yaml
defaults:
  storyBackground:
    type: aura
    slug: "blue-abstract-background-elegant-soft-waves-for-design"
    fixed: true
```

(from `apps/vizmaya-fyi/content/stories/spacex-ipo-2026.config.yaml`).

#### `type: image`

A fixed full-bleed image backdrop.

| Option | Type | Default | Required | Description |
|---|---|---|---|---|
| `type` | `'image'` | — | yes | Discriminator. |
| `src` | `string` | — | yes | Image URL (rendered as `background-image: url(<src>)`). |
| `fit` | `'cover' \| 'contain' \| 'fill'` | `'cover'` | no | Maps to CSS `background-size`. |
| `position` | `string` (CSS `background-position`) | `'center'` | no | e.g. `"top"`, `"50% 20%"`. |

```yaml
defaults:
  storyBackground:
    type: image
    src: https://…/backdrop.jpg
    fit: cover
    position: center
```

#### `type: color`

A flat solid (or any CSS `background` value) backdrop.

| Option | Type | Default | Required | Description |
|---|---|---|---|---|
| `type` | `'color'` | — | yes | Discriminator. |
| `value` | `string` (CSS color/`background`) | — | yes | Applied as the div's `background`. |

```yaml
defaults:
  storyBackground:
    type: color
    value: "#070a14"
```

#### `type: none`

| Option | Type | Default | Required | Description |
|---|---|---|---|---|
| `type` | `'none'` | — | yes | No backdrop — `StoryBackgroundSlot` returns `null`. This is also the implicit fallback when neither `defaults.storyBackground` nor `frontmatter.aura` resolves. |

### OverlayConfig — `defaults.overlay`

The darken/tint layer painted **between** the backdrop and the foreground
content (`z-index: -1`), critical for chart legibility over busy aura motion.
Rendered by `StoryBackgroundOverlay` in
`packages/story-reader/src/components/story/StoryBackgroundSlot.tsx`. When
`config` is absent the overlay renders nothing (legacy layering untouched); in
`mode === 'print'` it also renders nothing (the print backdrop is already a flat
solid).

`OverlayConfig` (`packages/viz-engine/src/lib/storyConfig.types.ts`):

| Option | Type | Default | Required | Description |
|---|---|---|---|---|
| `color` | `string` (CSS color) | undefined | no | Solid color floor. Combined with `opacity` if both set. |
| `opacity` | `number` (0..1) | `1` (`baseOpacity`); applied only when `color` set | no | Alpha applied to `color`. Clamped to [0,1]. If `opacity` is omitted, `color` is used as-is (full strength). |
| `gradient` | object (below) | undefined | no | Optional gradient layered **above** the solid color. |
| `gradient.type` | `'radial' \| 'linear'` | — | required if `gradient` set | `radial` → `radial-gradient(circle at center, from, to)`; `linear` → `linear-gradient(angle, from, to)`. |
| `gradient.from` | `string` (CSS color) | — | required if `gradient` set | Gradient start (radial = center, linear = first stop). |
| `gradient.to` | `string` (CSS color) | — | required if `gradient` set | Gradient end (radial = edges, linear = last stop). |
| `gradient.angle` | `string` (CSS angle/direction) | `'to bottom'` | no | Linear direction/angle. **Ignored for `radial`.** |

Compositing rules (from `StoryBackgroundOverlay`):

- `color` + `opacity`: when both are set the color is turned into `rgba(...)`
  (hex) or `color-mix(in srgb, <color> <pct>%, transparent)` (non-hex) via
  `mixWithOpacity`. If `opacity` is omitted, `color` is used verbatim.
- When **both** a solid color and a gradient are present, they layer via CSS
  multi-background with the **gradient first** (above) the color:
  `${gradientBackground}, ${baseBackground}`.
- If neither produces a background string, the overlay returns `null`.

```yaml
defaults:
  overlay:
    color: "#070a14"
    opacity: 0.46
    gradient:
      type: radial
      from: "rgba(7,10,20,0.18)"   # centre
      to:   "rgba(7,10,20,0.78)"   # edges
```

(from `money-in-politics-2026.config.yaml`). A no-op overlay (editorial deck
that wants the aura untouched):

```yaml
defaults:
  overlay:
    color: "transparent"
    opacity: 0
```

(from `spacex-ipo-2026.config.yaml`).

### Default panel chrome — `defaults.panel`

Foreground vizslots float over the single backdrop, so they need contrast. Every
foreground slot inherits a frosted-glass panel from `defaults.panel`
(`VizLayerPanel`, `packages/viz-engine/src/types.ts`), unless its own
`style.panel` (per-slot) or `section.panel` (per-section) overrides it. This is
not rendered by the deck *shell* itself (it is consumed downstream by the panel
wrapper inside the foreground modules) but it is a `StoryDefaults` field
relevant to the deck:

| Option | Type | Default | Description |
|---|---|---|---|
| `panel.background` | `string` | undefined | CSS `background` shorthand (color/gradient/`rgb()`/`oklch()` with `var()`). |
| `panel.border` | `string` | undefined | CSS `border` shorthand. |
| `panel.borderRadius` | `string` | undefined | CSS `border-radius`. |
| `panel.padding` | `string` | undefined | CSS `padding` shorthand. |
| `panel.backdropBlur` | `string` | undefined | Radius for `backdrop-filter: blur(<value>)`. |
| `panel.shadow` | `string` | undefined | CSS `box-shadow` shorthand. |

`defaults.panel` is merged under per-section `section.panel` (`StorySectionConfig.panel`,
shallow-merged over `defaults.panel`), which is itself merged over each module's
own default. Setting fields to neutral values (`"transparent"`, `"none"`, `"0"`)
turns the chrome off — used by the bone-white editorial deck:

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

(frosted-glass deck — `money-in-politics-2026.config.yaml`).

### Progress indicator — `defaults.progress` → DeckProgress

The deck can mount a fixed right-edge step rail with click-to-jump navigation.
It is a story-scoped opt-in: off by default so other decks keep clean edges.

```yaml
defaults:
  progress: true
```

`progress` is a `boolean` on `StoryDefaults`
(`packages/viz-engine/src/lib/storyConfig.types.ts`), default off. The shell
gates the indicator with:

```ts
const showProgress = isDeckFormat && defaults.progress === true && !isAutoplay && !isCapture
```

So it renders **only** when: the story is a deck, `progress === true`, and the
render is not autoplay/capture (the rail must not appear in rendered video
frames). It is **not** suppressed in `print` mode by this guard.

`DeckProgress` (`packages/story-reader/src/components/story/DeckProgress.tsx`):

| Prop | Type | Description |
|---|---|---|
| `current` | `number` | The active unit index (`activeUnit` from the shell). |
| `total` | `number` | `units.length` — one hairline per snap unit. |
| `onJump` | `(index: number) => void` | Click handler; the shell passes `handleProgressJump`. |

Behavior:

- Renders a `<nav aria-label="Section progress">` fixed at `right-6 top-1/2
  -translate-y-1/2 z-40`, a vertical stack of one `<button>` per unit
  (`Array.from({ length: total })`).
- The active hairline is wider/brighter: `width: 28` and
  `rgba(255,255,255,0.95)` when active, else `width: 16` and
  `rgba(255,255,255,0.45)`; `transition-all duration-200`.
- The whole rail uses `mix-blend-mode: difference` so it stays legible over both
  bone-white editorial sections and near-black full-bleed heroes without
  detecting the active section's color.
- **Hidden on portrait viewports** via `[@media(max-aspect-ratio:1/1)]:hidden`
  (a long dot stack clutters narrow screens).
- Each button carries `aria-label="Jump to section <i+1> of <total>"` and
  `aria-current="true"` on the active one.

Click-to-jump in the shell scrolls the snap container to the target unit:

```ts
const handleProgressJump = useCallback((targetIndex: number) => {
  const root = containerRef.current
  if (!root) return
  const target = root.querySelector(`[data-unit-index="${targetIndex}"]`)
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}, [])
```

### Full `defaults:` block for a deck (worked example)

Putting the deck-relevant `StoryDefaults` fields together (from the live
`money-in-politics-2026.config.yaml`; `mapOpacity: 0` because the deck has no
map):

```yaml
defaults:
  mapOpacity: 0
  storyBackground:
    type: aura
    slug: blue-abstract-background-patriotic-stars-flowing-lines
    tint: "#070a14"
    tintBlendMode: multiply
    fixed: true
  overlay:
    color: "#070a14"
    opacity: 0.46
    gradient:
      type: radial
      from: "rgba(7,10,20,0.18)"
      to: "rgba(7,10,20,0.78)"
  panel:
    background: "rgba(10,14,24,0.62)"
    border: "1px solid rgba(120,140,180,0.20)"
    borderRadius: "20px"
    padding: "32px"
    backdropBlur: "18px"
    shadow: "0 24px 60px -32px rgba(0,0,0,0.65)"
  scroll:
    mode: snap
    paddingY: "12vh"
  progress: true
```

Companion frontmatter in the `<slug>.md` file:

```yaml
format: "deck"
aura: blue-abstract-background-patriotic-stars-flowing-lines   # also the home tile bg; used as backdrop fallback
```

---

## Foreground layouts & slot positioning

The foreground of a story section is composed by a **layout** — a named, registered
composition that defines one or more *regions* (positioned wrapper boxes) — into which
the author slots one or more **viz layers**. Each layer can additionally **self-position**
inside its region via a `style` block (`VizLayerStyle`). This section documents the full
layout registry, how `section.layout` and `foreground.layout` resolve, the deck safe-area
insets, and every field of the per-slot positioning model.

The system is implemented across:

- `packages/viz-engine/src/foregroundLayouts.ts` — the layout registry and built-in layout definitions.
- `packages/viz-engine/src/ForegroundLayoutSlot.tsx` — the dispatcher that picks a layout (and its portrait variant) and mounts one slot per region.
- `packages/viz-engine/src/ForegroundVizSlot.tsx` — renders a region's layer stack, computing each layer's wrapper CSS from `VizLayerStyle`.
- `packages/viz-engine/src/lib/resolveSlots.ts` — translates the authored `foreground:` / `layout:` / `chart:` fields into the resolved `{ kind: 'flat' | 'regions' }` shape.
- `packages/viz-engine/src/lib/foregroundContent.tsx` — the per-unit content context exposed to text modules.
- `packages/viz-engine/src/types.ts` — `ForegroundLayoutDef`, `ForegroundLayoutRegion`, `VizLayerStyle`, `VizLayerPanel`.

### How a foreground resolves

A section's foreground is resolved by `resolveForeground()` in
`packages/viz-engine/src/lib/resolveSlots.ts` into one of two shapes:

```ts
type ResolvedForeground =
  | { kind: 'flat'; layers: VizLayer[] }
  | { kind: 'regions'; layout: string; regions: Record<string, VizLayer[]> }
```

Resolution rules, in evaluation order (`resolveSlots.ts:71-98`):

1. **Explicit regions object.** If `foreground` is an object with both a `layout` key and a
   `regions` key (`ForegroundRegionsInput`, detected by `isRegionsInput`), it resolves to
   `{ kind: 'regions', layout, regions }`. Each region value may be a single `VizLayer`
   (sugar) or a `VizLayer[]`; both normalize to an array via `asLayerArray`.
2. **Deck sugar: flat array + section-root `layout`.** If `foreground` is an array (or single
   layer) **and** `section.layout` is a non-empty string, it resolves to
   `{ kind: 'regions', layout: section.layout, regions: { default: layers } }`. The layout name
   is preserved so the deck slides keep their identity even though all layers land in the
   single `default` region.
3. **Plain flat array.** If `foreground` is an array (or single layer) with **no**
   `section.layout`, it resolves to `{ kind: 'flat', layers }`.
4. **Legacy `chart:`.** If there is no `foreground` but `section.chart` is a non-empty string,
   it resolves to `{ kind: 'flat', layers: [{ type: 'chart', id: section.chart }] }`.
5. **Empty.** Otherwise `{ kind: 'flat', layers: [] }`.

#### `section.layout` vs `foreground.layout`

These are two distinct authoring affordances, both resolved against the `foregroundLayouts`
registry:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `section.layout` | `string` | unset | Section-root layout name. Sugar that wraps a *flat* `foreground:` array into a single-`default`-region foreground using the named layout (`storyConfig.types.ts:430`, `resolveSlots.ts:89-91`). Used for deck slides where the layers self-position. |
| `foreground.layout` | `string` | — (required inside `ForegroundRegionsInput`) | The layout name when the author uses the explicit `{ layout, regions }` foreground shape (`storyConfig.types.ts:19-22`). |

Per `storyConfig.types.ts:424-428`: when **both** `section.layout` and `foreground.layout` are
set, **`foreground.layout` wins** — because an explicit `{ layout, regions }` object is detected
first by `isRegionsInput` and short-circuits the deck-sugar branch (`resolveSlots.ts:73-79`).

#### Dispatch: from resolved foreground to mounted regions

`ForegroundLayoutSlot` (`ForegroundLayoutSlot.tsx:56-117`) turns the resolved foreground into
DOM:

- `kind: 'flat'` → looks up the `FLAT_FOREGROUND_LAYOUT` (`'single-fill'`) and maps the flat
  layer array onto its single `default` region.
- `kind: 'regions'` → looks up `foreground.layout` in the registry. **Unknown layout names log
  a `console.warn` and fall back to `DEFAULT_FOREGROUND_LAYOUT`** (`'split-37-63-two-row'`)
  (`ForegroundLayoutSlot.tsx:64-72`). If even the default is missing the component renders `null`.
- When `isPortrait` is true and the layout has a `portrait` variant, that variant's region boxes
  are used (`activeDef = (isPortrait && layoutDef.portrait) || layoutDef`,
  `ForegroundLayoutSlot.tsx:77`).
- `portraitStack` is driven by the **base** layout's `stackOnPortrait` flag (not the portrait
  variant's), AND requires `isPortrait` (`ForegroundLayoutSlot.tsx:81`).

Every region wrapper **always renders, even when empty**, so downstream consumers (e.g. the
persistent map mount) can measure region rects via `ResizeObserver`. Region wrappers are forced
`pointer-events: none` so they never swallow scroll/wheel events behind the snap container;
individual layers re-enable pointer events as needed (`ForegroundLayoutSlot.tsx:89-101`).

### Layout-definition shape

A layout is a `ForegroundLayoutDef` (`types.ts:36-49`):

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `name` | `string` | required | Registry key. Looked up via `getForegroundLayout(name)`. |
| `regions` | `Record<string, ForegroundLayoutRegion>` | required | Named regions; iteration order is insertion order. One slot wrapper is mounted per region. |
| `portrait` | `ForegroundLayoutDef` | unset | Variant used when `isPortrait` is true. Only its `regions` (box geometry) are applied — `stackOnPortrait` is read from the base def, not this one (`ForegroundLayoutSlot.tsx:78-81`). |
| `stackOnPortrait` | `boolean` | `false` | When true (and viewport is portrait) the `default` region's slots flow full-width and vertically in declaration order instead of honoring their authored `%`/`vw` widths (`types.ts:40-48`). |

Each region is a `ForegroundLayoutRegion` (`types.ts:18-25`):

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `style` | `CSSProperties` | required | Inline CSS for the region's wrapper box (position + size). Applied verbatim, with `pointerEvents: 'none'` forced on top. |
| `accepts` | `readonly string[]` | unset (= any foreground module) | Optional viz-type allowlist for the region. Authoring/admin hint; **not enforced at runtime** by the slot dispatcher. |
| `hints` | `{ aspect?: 'auto' \| 'square' \| 'wide' \| 'tall'; minHeight?: string }` | unset | Authoring hints for the admin form / preview. **Not enforced at runtime.** |

### Registered layouts

The registry (`foregroundLayouts.ts:144-149`) ships these built-ins. Verticals can add more via
`registerForegroundLayout(def)` without touching core (mirrors the viz-module registry).

| Layout name | Regions | Portrait variant | `stackOnPortrait` |
| --- | --- | --- | --- |
| `single-fill` | `default` | none | `false` |
| `split-37-63-two-row` | `lead`, `chart`, `body` | `split-37-63-two-row.portrait` | `false` |
| `hero-full-bleed` | `default` | `hero-full-bleed.portrait` | `false` |
| `text-left-chart-right` | `default` | `.portrait` | `true` |
| `text-left-quote-right` | `default` | `.portrait` | `true` |
| `image-left-text-right` | `default` | `.portrait` | `true` |
| `stat-top-chart-below` | `default` | `.portrait` | `true` |
| `stat-left-chart-right` | `default` | `.portrait` | `true` |
| `chart-top-text-below` | `default` | `.portrait` | `true` |
| `centered` | `default` | `.portrait` | `true` |
| `free` | `default` | `.portrait` | `true` |

The two module-level layout constants (`foregroundLayouts.ts:163-164`):

| Constant | Value | Role |
| --- | --- | --- |
| `DEFAULT_FOREGROUND_LAYOUT` | `'split-37-63-two-row'` | Fallback when a `regions`-kind foreground names an unknown layout. |
| `FLAT_FOREGROUND_LAYOUT` | `'single-fill'` | The layout a `flat`-kind foreground is wrapped into. |

#### `single-fill`

One region named `default` filling the foreground (`foregroundLayouts.ts:20-25`). This is the
layout that wraps every legacy flat `foreground:` array at dispatch time, and the layout the
deck "free" layouts collapse to logically (their slots self-position).

Region box:

| Region | CSS box | Portrait |
| --- | --- | --- |
| `default` | `position: absolute; inset: 0` (the shared `FILL` constant) | no portrait variant — landscape box reused |

#### `split-37-63-two-row`

The canonical Vizmaya map-story layout (`foregroundLayouts.ts:27-57`): a tall left column for
the lead text card, a top-right box for the chart, and a bottom-right box for the body copy.
This is also the `DEFAULT_FOREGROUND_LAYOUT`.

Landscape region geometry (all `position: absolute`):

| Region | CSS box | `hints` |
| --- | --- | --- |
| `lead` | `top: 0; left: 0; width: 37vw; height: 100vh` | `{ aspect: 'tall', minHeight: '50vh' }` |
| `chart` | `top: 0; left: 37vw; width: 63vw; height: 50vh` | `{ aspect: 'wide' }` |
| `body` | `top: 50vh; left: 37vw; width: 63vw; height: 50vh` | `{ aspect: 'wide' }` |

Portrait variant `split-37-63-two-row.portrait` (`foregroundLayouts.ts:43-56`) stacks the three
regions vertically full-width (no `hints`):

| Region | CSS box (portrait) |
| --- | --- |
| `lead` | `top: 0; left: 0; width: 100vw; height: 30vh` |
| `chart` | `top: 30vh; left: 0; width: 100vw; height: 35vh` |
| `body` | `top: 65vh; left: 0; width: 100vw; height: 35vh` |

`stackOnPortrait` is **unset** here — the portrait restack is achieved by the explicit `portrait`
region variant, not by the vertical-flow stacking mode.

#### `hero-full-bleed`

Editorial cover layout (`foregroundLayouts.ts:131-142`). A single `default` region with
`position: absolute; inset: 0` (the `FILL` box) and **no DECK_SAFE_AREA inset**, so an image
layer sized `{ width: 100%, height: 100vh }` goes truly edge-to-edge. The accompanying headline
group + scrim are painted as a `z-20` overlay inside `MapStorySection` (image → scrim → headline
from bottom to top in the z-stack), so they are *not* declared as foreground regions here.

| Region | CSS box | Portrait |
| --- | --- | --- |
| `default` | `position: absolute; inset: 0` | `hero-full-bleed.portrait` — same `FILL` box |

`stackOnPortrait` is `false` — the region just fills on both orientations.

#### The 8 deck "free" layouts

`text-left-chart-right`, `text-left-quote-right`, `image-left-text-right`, `stat-top-chart-below`,
`stat-left-chart-right`, `chart-top-text-below`, `centered`, and `free`
(`foregroundLayouts.ts:98-124`).

These are generated uniformly. Each has:

- A single `default` region whose box is the **`DECK_SAFE_AREA`** inset (see below). The region
  name encodes the canonical split (text/chart/stat/quote left or right; stacked top/below), but
  the box is *not* actually split — the deck's vizslots self-position via `style.position` +
  `style.size` (see `ForegroundVizSlot.layerWrapperStyle`). The named layout exists so authors
  signal intent and the admin form / preview can render the right scaffolding. (True
  region-splitting deck layouts can be added later — the dispatcher already supports it.)
- A `<name>.portrait` variant whose `default` region uses **`DECK_SAFE_AREA_PORTRAIT`**.
- `stackOnPortrait: true` — on portrait the slots ignore their authored `%`/`vw` widths (which
  would squish to ~160px side-by-side on a phone) and instead flow full-width and vertically.

| Region | CSS box (landscape) | CSS box (portrait) |
| --- | --- | --- |
| `default` | `DECK_SAFE_AREA` | `DECK_SAFE_AREA_PORTRAIT` |

##### DECK_SAFE_AREA and the portrait safe area

`DECK_SAFE_AREA` (`foregroundLayouts.ts:82-88`) insets the region box from the viewport edges so
self-positioned slots don't graze chrome:

| Edge | Value | Why |
| --- | --- | --- |
| `top` | `96px` | Clears the fixed top-left Vizmaya logo (64px tall + 16px padding + breathing room). |
| `bottom` | `64px` | Keeps closing copy off the lower edge. |
| `left` | `6vw` | Horizontal gutter so `{ x: left }` slots don't touch the edge. |
| `right` | `6vw` | Horizontal gutter so `{ x: right }` slots don't touch the edge. |

`DECK_SAFE_AREA_PORTRAIT` (`foregroundLayouts.ts:90-96`) tightens the scarcer mobile real estate
while keeping the logo clearance:

| Edge | Value |
| --- | --- |
| `top` | `96px` (unchanged — same logo clearance) |
| `bottom` | `48px` |
| `left` | `4vw` |
| `right` | `4vw` |

### Per-slot self-positioning (`VizLayerStyle`)

Within a region, each layer's wrapper box is computed by `layerWrapperStyle()` in
`packages/viz-engine/src/ForegroundVizSlot.tsx:101-160` from the layer's `style` field. A
module may also ship a `defaultStyle` (`VizModule.defaultStyle`, `types.ts:182`) that is merged
*under* the authored style by `resolveLayerStyle()` (`ForegroundVizSlot.tsx:45-62`):

- Top-level fields are shallow-merged: `{ ...defaults, ...layerStyle, ...portrait }`.
- `panel` is merged **sub-field**: `{ ...defaults.panel, ...layerStyle.panel, ...portrait.panel }`,
  so overriding only `panel.background` keeps the default border/blur.
- On portrait, the layer's `style.portrait` partial wins over both base layers.
- The resolved style's `portrait` field is deleted so it never rides downstream.

`VizLayerStyle` fields (`types.ts:80-96`):

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `position` | `{ x?, y? }` | unset | Anchor point. `x`: `'left'`→`left:0`, `'right'`→`right:0`, `'center'`→`left:50%` + `translateX(-50%)`, or any CSS string → `left: <value>`. `y`: `'top'`→`top:0`, `'bottom'`→`bottom:0`, `'center'`→`top:50%` + `translateY(-50%)`, or any CSS string → `top: <value>`. If `x` is omitted, `left:0`; if `y` is omitted, `top:0` (`ForegroundVizSlot.tsx:141-157`). |
| `size` | `{ width?, height?: string }` | unset | Sets `width` / `height` from CSS strings (`'44%'`, `'62vh'`, `'100vh'`). Only set fields are applied (`ForegroundVizSlot.tsx:139-140`). |
| `opacity` | `number` | unset (1) | CSS `opacity` (`ForegroundVizSlot.tsx:137`). |
| `blendMode` | `'normal' \| 'multiply' \| 'screen' \| 'overlay' \| 'soft-light' \| 'difference'` | unset | CSS `mix-blend-mode` (`ForegroundVizSlot.tsx:138`). |
| `pointerEvents` | `'auto' \| 'none'` | `'auto'` for the first layer (`index === 0`), `'none'` for subsequent layers in absolute mode; `'none'` in portrait-stack mode (`ForegroundVizSlot.tsx:120,135`). | Whether the layer captures pointer events (chart hover, embed/map drag). |
| `zIndex` | `number` | the layer's array index | CSS `z-index` (`ForegroundVizSlot.tsx:119,134`). |
| `panel` | `VizLayerPanel` | unset (bare wrapper) | Chrome around the wrapper box — see below. |
| `portrait` | `VizLayerStyle` | unset | Per-slot override merged over the base style only when the viewport is portrait. A nested `portrait` inside this is ignored. E.g. `portrait: { size: { height: '38vh' } }` or `portrait: { opacity: 0 }` to drop a slot on mobile. |

#### Positioning modes

`layerWrapperStyle()` chooses one of three modes:

- **Positioned (absolute).** When `position != null` **or** `size != null`, the wrapper is
  `position: absolute` and `inset` is left undefined so the anchor/size rules apply
  (`ForegroundVizSlot.tsx:130-160`).
- **Fill (absolute).** When neither `position` nor `size` is set, the wrapper is
  `position: absolute; inset: 0` — it fills the region. Single-layer legacy stories flatten to
  this, visually identical to a direct chart-panel mount (`ForegroundVizSlot.tsx:131-133,285-287`).
- **Portrait stack.** When the layout is `stackOnPortrait` and the viewport is portrait, the slot
  container becomes a scrollable flex column and each layer becomes a `position: relative;
  width: 100%; flex: 0 0 auto` block in document order (`ForegroundVizSlot.tsx:114-128,267-279`).
  Authored `position`/`%`-widths are ignored. Height comes from
  `style.portrait.size.height`, else a per-type default of `40vh` for *visual* slot types
  (`chart`, `image`, `imageGrid`, `mapbox`, `map`, `embed`, `rive`, `starship:viewer` —
  `STACK_VISUAL_TYPES`, `ForegroundVizSlot.tsx:68-81`), else `auto` for text-like modules.

#### Panel chrome (`VizLayerPanel`)

A `panel` adds a frame around the wrapper box. Every field is optional and forwarded straight to
CSS (full vocabulary — gradients, `var()`, `oklch()`, `calc()`); unset fields leave the wrapper
bare (`types.ts:65-78`, applied by `applyPanel`, `ForegroundVizSlot.tsx:86-99`).

| Option | Type | Default | Maps to CSS |
| --- | --- | --- | --- |
| `background` | `string` | unset | `background` |
| `border` | `string` | unset | `border` |
| `borderRadius` | `string` | unset | `border-radius` |
| `padding` | `string` | unset | `padding` |
| `shadow` | `string` | unset | `box-shadow` |
| `backdropBlur` | `string` | unset | `backdrop-filter: blur(<value>)` **and** `-webkit-backdrop-filter` (Safari needs the prefix). |

Panel defaults cascade: a module's `defaultStyle.panel` (e.g. the text module's card frame) is
overridden sub-field by a story-wide `defaults.panel`, then by `section.panel`
(`storyConfig.types.ts:432-437`), then by the layer's own `style.panel` and finally
`style.portrait.panel`.

### Worked examples

#### Regions-based foreground (`split-37-63-two-row`)

Authoring the canonical map-story layout with the explicit `{ layout, regions }` shape. Each
region value may be a single layer or an array; the keys must match the layout's region names
(`lead`, `chart`, `body`):

```yaml
- id: the-ranking
  text: "The ranking, as published"
  background:
    - type: map
      center: [10.0, 20.0]
      zoom: 1.6
  foreground:
    layout: split-37-63-two-row
    regions:
      lead:
        - type: bodyText
          from: text
      chart:
        type: chart            # single layer — sugar for a one-element array
        id: currency-ranking
        caption: "YTD appreciation vs USD"
      body:
        - type: bodyText
          from: text
```

#### Self-positioned slots (deck format)

A deck slide using `section.layout` sugar with a flat `foreground:` array. Both slots
self-position inside the `DECK_SAFE_AREA` box, and `stackOnPortrait` (set on the layout) flows
them vertically on phones. From
`apps/vizmaya-fyi/content/stories/spacex-ipo-2026.config.yaml`:

```yaml
- id: three-segments
  text: "Three segments, three stories"
  paragraphs: [0, 4]
  layout: text-left-chart-right
  foreground:
    - type: bodyText
      from: text
      style:
        position: { x: left, y: center }
        size: { width: "44%" }
    - type: chart
      id: segment-revenue
      caption: "2025 segment P&L"
      style:
        position: { x: right, y: center }
        size: { width: "50%", height: "62vh" }
```

#### Full-bleed hero with a panel override

The `hero-full-bleed` cover skips the safe area so the image reaches every edge; the per-slot
`panel` is zeroed out so no card frame is drawn (from the same SpaceX config):

```yaml
- id: cover
  kind: cover
  layout: hero-full-bleed
  panel:
    background: "transparent"
    border: "none"
    backdropBlur: "0"
  foreground:
    - type: image
      src: /content/stories/spacex-ipo-2026/images/01-hero-orbital.webp
      priority: true
      style:
        position: { x: center, y: center }
        size: { width: "100%", height: "100vh" }
        opacity: 1
        panel:
          background: "transparent"
          border: "none"
          borderRadius: "0"
```

#### Per-slot portrait override

Tuning a stacked chart's height on mobile and dropping a decorative layer entirely
(`style.portrait` partial, merged only when the viewport is portrait):

```yaml
foreground:
  - type: chart
    id: segment-revenue
    style:
      position: { x: right, y: center }
      size: { width: "50%", height: "62vh" }
      portrait:
        size: { height: "38vh" }   # taller-than-default stacked chart on phones
  - type: image
    src: /content/.../decorative.webp
    style:
      portrait:
        opacity: 0                 # hide this layer on mobile
```

### Per-unit content context

Foreground slots are mounted inside a `ForegroundContentProvider`
(`packages/viz-engine/src/lib/foregroundContent.tsx`) that exposes the active unit's resolved
content (`heading`, `paragraphs`, hero parts, …) via `useForegroundContent()`. Text-style modules
(e.g. `bodyText` with `from: text`) read from this context so they can render the section's prose
without re-parsing markdown on the client. Non-text modules (chart, image, map) ignore it and
consume `VizRenderProps.config` directly; `useForegroundContent()` returns `null` when called
outside the provider, so modules must fall back to config-supplied content.

---

## Section & subsection config + section kinds

Every story config (`<slug>.config.yaml`) is `{ defaults, sections }` (see `StoryConfig` in `packages/viz-engine/src/lib/storyConfig.types.ts`). This page documents the `sections[]` entries — the building block both the map format and the deck format are composed from — plus the subsection mechanic, paragraph slicing, the `SectionKind` vocabulary, the `StatColor` tokens, and how sections/subsections flatten into renderable `ResolvedUnit`s.

The types are pure (no runtime imports) so client components can import them; the file header in `packages/viz-engine/src/lib/storyConfig.types.ts` notes this explicitly.

### `StorySectionConfig` — section options

Defined in `packages/viz-engine/src/lib/storyConfig.types.ts` (`interface StorySectionConfig`). One array entry per story section. A section either renders one snap unit (no `subsections`) or expands into N units (one per subsection).

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `id` | `string` | — (optional) | Unique section id. Conventionally matches the markdown heading slug. Used for share-mode overrides (keyed by id, see `ShareConfig.sections`), the autoplay map editor labels (`buildMapTargets` in `packages/viz-engine/src/lib/storyMapOverrides.ts`), and methodology-skip lists. Not used as a render anchor — that's `text`. |
| `kind` | `SectionKind` | `'text'` | What kind of foreground panel / slide to render. See the [SectionKind](#sectionkind-values) table. Defaulted to `'text'` in both `MapStorySection.tsx` (`parentConfig.kind ?? 'text'`) and `resolveUnits` (`section.kind ?? 'text'`). |
| `text` | `string` | — | Markdown anchor reference for the section's text panel (e.g. `"Act II > The misleading spike"`, resolved via `resolveAnchor`/`getParagraphs`). **Required UNLESS `subsections` is provided** — when `subsections` is set, each subsection carries its own `text` and the parent's `text` is ignored. If the anchor can't be resolved, `resolveUnits` logs `[story:<slug>] anchor not found` and the unit renders empty paragraphs (TextPanel shows `[missing markdown anchor: …]`). |
| `subsections` | `StorySubsectionConfig[]` | — (optional) | Child subsections. When present, each becomes its own viewport-tall snap target; all subsections share the parent's map camera + chart instance, and their index drives the chart's `activeStep`. See [Subsections](#storysubsectionconfig--subsection-options). |
| `paragraphs` | `number \| [number, number]` | — (all) | 0-based slice into the resolved paragraphs of `text`. See [Paragraph slicing](#paragraph-slicing-semantics). |
| `mobileParagraphs` | `Array<number \| [number, number]>` | — | Portrait-only paragraph slices. Each entry expands the desktop unit into one extra mobile snap target, avoiding overflow on small screens. See [Paragraph slicing](#paragraph-slicing-semantics). |
| `shareParagraphs` | `Array<number \| [number, number]>` | — | Share-mode paragraph slices. Each entry becomes one share card. Same `[start,end]` semantics as `paragraphs`. |
| `heading` | `string` | the anchor's own markdown heading | Override heading shown above the text/stat panel. In `resolveUnits`: `section.heading ?? md?.heading`. For `kind: stat` it is the giant number; for `kind: text` it is the small mono accent eyebrow above the prose. |
| `subheading` | `string` | for stat: first `*italic*` paragraph (auto-extracted) | Short label shown below the stat number (`kind: stat` / `bigStat` only). When omitted on a stat section, `extractStatSubheading` pulls the first `*italic*` paragraph out of the body and uses it as the subheading (removing it from the body so it doesn't render twice). A literal `subheading:` overrides that extraction. |
| `chart` | `string` | — | Legacy foreground chart id, resolved by the ChartPanel registry (e.g. `data:total-personnel`, `ebitda-scale`). Marked legacy in the type — prefer `foreground`. Still drives `hasChart` in `MapStorySection.tsx` so the text card dodges the chart's real estate. |
| `eyebrow` | `string` | — | Eyebrow line shown above the hero title (`kind: hero` / `cover` only). Rendered by `HeroPanel`/`HeroPanelTitle` in `packages/story-reader/src/components/story/Hero.tsx`. |
| `color` | `StatColor` | `'accent2'` | Theme palette token for the giant stat number's color (`kind: stat` only). Resolved by `statColorVar` in `packages/story-reader/src/components/story/ThemeProvider.tsx` → `var(--color-<token>)`. See [StatColor](#statcolor-tokens). |
| `background` | `VizLayer \| VizLayer[] \| { type: 'none' }` (`BackgroundSlotInput`) | synthesized from `map` if absent | Persistent backdrop layer stack. When absent and `map` is set, the back-compat shim in `resolveSlots()` synthesizes a single map layer. `{ type: 'none' }` suppresses the persistent map for this section (deck format). |
| `foreground` | `VizLayer \| VizLayer[] \| ForegroundRegionsInput` (`ForegroundSlotInput`) | synthesized from `chart` if absent | Per-unit foreground layer stack. When absent and `chart` is set, the shim synthesizes a single chart layer. A bare array is a "flat" foreground; `{ layout, regions }` is a region-mode foreground. |
| `layout` | `string` | — | Section-root layout name, resolved against the `foregroundLayouts` registry. Sugar for `foreground: { layout, regions }` when `foreground:` is an unwrapped array (deck format). If both `section.layout` and `foreground.layout` are set, `foreground.layout` wins. Setting any `layout` auto-wraps the foreground into regions form (which would otherwise route the section to the empty-snap-target path — note the special `hero-full-bleed` carve-out in `MapStorySection.tsx`). |
| `panel` | `VizLayerPanel` | inherits `defaults.panel` → module default | Per-section panel chrome (frosted-glass frame) override. Merged shallowly over `defaults.panel`, which is itself merged over each vizslot's module default. Used to swap the frame on a single hero/closing slide. |
| `logoPalette` | `LogoPalette` | inherits `defaults.logoPalette` → theme | Per-section override of the persistent Vizmaya logo's Rive colors. Merged over `defaults.logoPalette` over the theme. As the reader scrolls into the section the logo re-tints. Values are theme tokens (`"$accent"`, `"$teal"`) or hex. Slots: `text` / `teal` / `accent` / `accent2` / `surface` / `muted` / `line`. |
| `map` | object (see below) | — (deck never sets it; effectively required for map stories) | Legacy map field. For map stories the loader's per-section validator enforces `map.center` + `map.zoom` when neither `background:` nor `foreground:` is declared. Deck sections omit it (they use a page-level `defaults.storyBackground` aura). |

#### `section.map` sub-fields

The legacy per-section camera + layer block (`StorySectionConfig.map`):

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `center` | `[number, number]` | — (required for map stories) | `[lng, lat]` map center. |
| `zoom` | `number` | — (required for map stories) | Mapbox zoom level. |
| `pitch` | `number` | `0` | Camera tilt (degrees). |
| `bearing` | `number` | `0` | Camera rotation (degrees). |
| `opacity` | `number` | inherits `defaults.mapOpacity` | Map layer opacity for this section. |
| `flySpeed` | `number` | inherits `defaults.flySpeed` | Fly-to animation speed. |
| `pins` | `MapPinConfig[]` | — | Pin markers. Each pin needs `coordinates: [lng,lat]` (nested under `map:`); see `MapPinConfig` (`coordinates`, `color`, `label`, `radius`, `pulse`, `labelAnchor`, `image`). |
| `regions` | `MapRegionLayer` | — | Choropleth layer. |
| `heatmap` | `HeatmapLayer` | — | Heatmap layer. |
| `textLabels` | `MapTextLabel[]` | — | Free-floating text labels (no pin marker beneath). |
| `mobile` | `MapOverrides` | — | Overrides applied on portrait viewports (`center`/`zoom`/`pitch`/`bearing`/`opacity`/`flySpeed`/`pins`/`regions`/`heatmap`/`textLabels`). `pins`/`regions`/`heatmap`/`textLabels` REPLACE, scalars merge. |

Example — `kind: hero` section with map camera only (`largest-armies-2026.config.yaml`):

```yaml
- id: hero
  kind: hero
  text: "The Army That Isn't There"
  eyebrow: "Analysis · April 2026"
  map:
    center: [60.0, 25.0]
    zoom: 2.2
    pitch: 0
    bearing: 0
    opacity: 0.45
```

Example — `kind: stat` section, paragraph-sliced, portrait split, with a pin (`largest-armies-2026.config.yaml`):

```yaml
- id: bangladesh-total
  kind: stat
  text: "7.0M"
  paragraphs: [0, 2]
  mobileParagraphs:
    - [0, 1]
    - [1, 2]
  map:
    center: [90.4125, 23.8103]
    zoom: 6.5
    pitch: 25
    opacity: 0.60
    pins:
      - coordinates: [90.4125, 23.8103]
        label: "Dhaka — Ansar-VDP, BGB, Army"
        color: "#c9302c"
    mobile:
      center: [90.4125, 23.8103]
      zoom: 5.5
```

### `StorySubsectionConfig` — subsection options

Defined in `packages/viz-engine/src/lib/storyConfig.types.ts` (`interface StorySubsectionConfig`). Each entry of a parent's `subsections[]`. All subsections of a parent share the parent's map state and chart instance; their 0-based index becomes the chart's `activeStep` so chart animations resume from where the previous subsection left off rather than re-mounting.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `id` | `string` | — (optional) | Optional subsection id. |
| `text` | `string` | — (**required**) | Markdown anchor reference for this subsection's text. Required (each subsection carries its own anchor; the parent's `text` is ignored when `subsections` exists). |
| `paragraphs` | `number \| [number, number]` | — (all) | 0-based slice into the resolved paragraphs of `text`. Used to reveal bullets one at a time as the chart's `activeStep` advances. See [Paragraph slicing](#paragraph-slicing-semantics). |
| `mobileParagraphs` | `Array<number \| [number, number]>` | — | Portrait-only slices; one extra mobile snap target per entry. |
| `shareParagraphs` | `Array<number \| [number, number]>` | — | Share-mode slices; one share card per entry. |
| `heading` | `string` | the anchor's own heading | Override heading shown above the paragraphs (replaces the anchor's own markdown heading). |
| `subheading` | `string` | for stat: extracted `*italic*` | Short label below the stat number (`kind: stat`/`bigStat` only). Same auto-extraction fallback as the section-level field. |
| `map` | `SubsectionMapOverride` | inherits the parent's `map` | Partial map override. Fields provided here replace the corresponding parent field. `pins` replaces the entire array (does not merge) so you can progressively reveal markers per step. Extends `MapOverrides` and adds a `mobile` sub-block of the same shape for portrait. |

Note: real configs (e.g. `airtel-fy26.config.yaml`) also attach a `foreground: [{ type: chart, id: … }]` per subsection to point each step at its chart; the parent shares one chart instance and the `subIndex`/`activeStep` advances it.

#### Subsection mechanic (one parent → N units)

From the doc comment on `StorySectionConfig.subsections` and the flattening in `packages/content-source/src/resolveUnits.ts`:

- A section with no `subsections` produces exactly one unit (`subIndex: 0`).
- A section with N subsections produces N units, all with the same `parentIndex` (so they index into the same `config.sections` entry and the same map step) and `subIndex` `0..N-1`.
- Because units share `parentIndex`, the page-level fixed map + chart panels persist across the subsection's snap targets (the chart doesn't re-mount; its `activeStep` is the unit's `subIndex`, advancing as you scroll). This is the "reveal a chart step per scroll snap" pattern.

Example — one parent, two subsections, one chart that steps (`airtel-fy26.config.yaml`):

```yaml
- id: margins-built-to-last
  map:
    center: [82.5, 22.5]
    zoom: 3.6
    opacity: 0.12
  subsections:
    - text: "Margins Built to Last"
      paragraphs: 0
      foreground:
        - type: chart
          id: "ebitda-scale"
    - text: "Margins Built to Last"
      paragraphs: 1
      foreground:
        - type: chart
          id: "ebitda-scale"
```

### Paragraph slicing semantics

`sliceParagraphs` in `packages/content-source/src/resolveUnits.ts` defines the spec for `paragraphs` (and each entry of `mobileParagraphs` / `shareParagraphs`):

```ts
// undefined → all paragraphs
// number    → all.slice(n, n + 1)   (single paragraph at index n)
// [a, b]    → all.slice(a, b)        (a..b-1, END IS EXCLUSIVE)
```

Concretely:

| Spec | Result |
| --- | --- |
| omit | all paragraphs (legacy behaviour) |
| `paragraphs: 0` | only the first paragraph |
| `paragraphs: [0, 2]` | paragraphs at indices 0 and 1 (NOT 2 — end is exclusive, matching `Array.slice`) |
| `paragraphs: [2, 4]` | paragraphs at indices 2 and 3 |

`mobileParagraphs` and `shareParagraphs` are **arrays of specs** — each entry splits one desktop unit into multiple units (one snap target / one share card per entry) so dense copy doesn't overflow a portrait viewport. Example desktop one snap, mobile two snaps:

```yaml
paragraphs: [0, 4]        # desktop — one snap
mobileParagraphs:         # portrait — two snaps
  - [0, 2]
  - [2, 4]
```

When a desktop unit expands into mobile units, `resolveUnits` puts the `heading` + `subheading` only on the first mobile slice (`sliceIdx === 0`); subsequent slices carry `undefined` for both so the heading isn't repeated. For stat sections, the `*italic*` subheading paragraph is stripped from each mobile slice via `extractStatSubheading` so it isn't rendered twice (once as the styled label, once as raw-asterisk body). `desktopToMobile` (returned by `resolveUnits`) maps each desktop unit index → the array of mobile unit indices that compose it (used by autoplay to queue consecutive TTS segments).

### `SectionKind` values

`type SectionKind` (`packages/viz-engine/src/lib/storyConfig.types.ts`). The original triple (`text` | `hero` | `stat`) drives the map-format text card; the rest are deck-format additions. Two render-time behaviours matter:

1. **Aliasing** (`aliasKind` in `packages/story-reader/src/components/story/MapStorySection.tsx`): `cover` is aliased to `hero` (both render through `HeroPanel`). In `resolveUnits`, `bigStat` is treated like `stat` and `cover` like `hero` for paragraph/subheading extraction.
2. **Text-card suppression** (`DECK_KINDS_NO_TEXT_CARD` set in `MapStorySection.tsx`): the deck shell suppresses the section text card for `bigStat`, `bodyText`, `split`, `data`, `gallery`, `quote`, `divider`, `closing` — the snap target still mounts (so the IntersectionObserver drives `activeUnit`), but the visual is carried by the section's foreground vizslots in their layout regions. Only `text`, `hero`, `stat`, and `cover` (≈hero) render a section text card.

| Kind | Renders | Format | Text card suppressed? |
| --- | --- | --- | --- |
| `text` | Default. The section text card: a small mono accent heading + serif prose (`TextPanel`). Bulleted markdown blocks render as `<ul>`. | Map (legacy) | No — renders the text card |
| `hero` | Eyebrow + serif H1 + dek + byline via `HeroPanel`/`HeroPanelTitle`/`HeroPanelDek` (`Hero.tsx`). The dek is the first `*italic*` paragraph, byline the first `**bold**` paragraph (extracted by `extractHeroBits`). On portrait it splits into two snaps: title-only, then dek+byline. | Map (legacy) + deck | No — renders the hero card |
| `stat` | The section's `heading` as a giant serif number (`StatPanel`), `subheading` mono label beneath, body paragraphs as caption. Color from `color` (`StatColor`, default `accent2`). In autoplay the number renders centered like the chart panel (the stat IS the visual). | Map (legacy) + deck | No — renders the stat card (centered in autoplay) |
| `cover` | Aliased to `hero`. A large title slide. With `layout: hero-full-bleed`, paints a bottom scrim + headline overlay (z-20) above a full-bleed foreground image; dek/byline come from direct `dek:`/`byline:` YAML fields (preferred) or the legacy italic/bold markdown markers. | Deck | No (it's hero) — renders the hero overlay |
| `bigStat` | A giant-number slide composed via a `bigStat` **foreground vizslot** (not the section text card). `resolveUnits` treats it like `stat` for `*italic*` subheading extraction. | Deck | Yes |
| `bodyText` | A prose slide composed via a `bodyText` foreground vizslot (often `from: text` to pull the anchor's paragraphs). | Deck | Yes |
| `split` | A two-region composition (e.g. `bodyText` left + chart/quote right). Visual entirely in foreground vizslots in named layout regions. | Deck | Yes |
| `data` | A chart-forward slide — typically `bodyText`/`bigStat` left + `chart` right (`layout: text-left-chart-right` / `stat-left-chart-right`). | Deck | Yes |
| `gallery` | An image-grid slide composed via foreground vizslots (e.g. `imageGrid`). | Deck | Yes |
| `quote` | A pull-quote slide composed via a `quote` foreground vizslot (`text` + `attribution`), often paired with a `bodyText` slot. | Deck | Yes |
| `divider` | An act/section divider slide composed via foreground vizslots. | Deck | Yes |
| `closing` | A closing/essay slide composed via foreground vizslots (e.g. a long `bodyText`). | Deck | Yes |

Example — deck `cover` with full-bleed image and direct `dek`/`eyebrow` (`spacex-ipo-2026.config.yaml`):

```yaml
- id: cover
  kind: cover
  layout: hero-full-bleed       # opts out of the deck safe-area; image goes edge-to-edge
  text: "Cover"
  eyebrow: "SpaceX S-1 · May 20, 2026 · $1.75 Trillion IPO Analysis"
  heading: "A Rocket Company That Became the Internet"
  dek: "SpaceX's S-1 reveals three companies inside one stock — and only one of them makes money."
  foreground:
    - type: image
      src: /content/stories/spacex-ipo-2026/images/01-hero-orbital.webp
      priority: true
      style:
        position: { x: center, y: center }
        size: { width: "100%", height: "100vh" }
```

Example — deck `data` slide, bigStat left + chart right, text card suppressed (`spacex-ipo-2026.config.yaml`):

```yaml
- id: subscribers
  kind: data
  text: "10.3M subscribers"
  paragraphs: [0, 2]
  layout: stat-left-chart-right
  foreground:
    - type: bigStat
      value: "10.3M"
      label: "Starlink subscribers · March 31, 2026"
      delta: "164 countries · +106% YoY"
      deltaColor: positive
      color: accent2
      align: left
      style:
        position: { x: left, y: center }
        size: { width: "44%" }
    - type: chart
      id: starlink-subscribers
      style:
        position: { x: right, y: center }
        size: { width: "50%", height: "62vh" }
```

Example — deck `quote` slide (`money-in-politics-2026.config.yaml`):

```yaml
- id: research-found
  kind: quote
  text: "What the research found"
  paragraphs: [0, 1]
  layout: text-left-quote-right
  foreground:
    - type: bodyText
      from: text
      style:
        position: { x: left, y: center }
        size: { width: "42%" }
    - type: quote
      text: "Economic elites and organized groups representing business interests have substantial independent impacts on U.S. government policy, while mass-based interest groups and average citizens have little or no independent influence."
      attribution: "Gilens & Page, Perspectives on Politics, 2014 — influential, but contested"
      style:
        position: { x: right, y: center }
        size: { width: "46%" }
```

### `StatColor` tokens

`type StatColor` (`packages/viz-engine/src/lib/storyConfig.types.ts`), used by `kind: stat`'s `color` field to tint the giant number. Each token maps to a CSS variable emitted by `ThemeProvider` via `statColorVar(token)` → `var(--color-<token>)` (`packages/story-reader/src/components/story/ThemeProvider.tsx`). When `color` is unset, the default is `accent2` (the historical default for non-percentage stats). Background/surface/text tokens are intentionally excluded — they don't read as a foreground accent.

| Token | CSS variable |
| --- | --- |
| `accent` | `var(--color-accent)` |
| `accent2` | `var(--color-accent2)` — **default** |
| `red` | `var(--color-red)` |
| `positive` | `var(--color-positive)` |
| `amber` | `var(--color-amber)` |
| `teal` | `var(--color-teal)` |
| `muted` | `var(--color-muted)` |

```yaml
- id: north-korea-active
  kind: stat
  text: "1.3M"
  color: red          # giant number inks var(--color-red); omit → accent2
```

### `ResolvedUnit` — how sections/subsections become units

`interface ResolvedUnit` (`packages/viz-engine/src/lib/storyConfig.types.ts`). A renderable unit is one viewport-tall snap target. `resolveUnits(slug, sections, config)` in `packages/content-source/src/resolveUnits.ts` flattens `config.sections` into three unit arrays — `units` (desktop), `mobileUnits`, `shareUnits` — plus `desktopToMobile`, `hasMobileOverrides`, `hasShareOverrides`. `StoryMapShell` selects `mobileUnits` on portrait when present, otherwise `units`.

Flattening rules (from `resolveUnits`):
- A section with `subsections` → one unit per subsection (`subIndex` `0..N-1`).
- A section with only `text` (no subsections) → one unit (`subIndex: 0`).
- A section with neither `subsections` nor `text` is skipped entirely.

`ResolvedUnit` fields:

| Field | Type | Description |
| --- | --- | --- |
| `parentIndex` | `number` | Index into `config.sections` (and into `mapSteps`). Units sharing a `parentIndex` share the map camera + chart instance. |
| `subIndex` | `number` | Position within the parent (0 if no subsections). Passed to the chart as `activeStep`. |
| `parentConfig` | `StorySectionConfig` | The originating section config (read for `kind`, `color`, `eyebrow`, `layout`, `map`, foreground, etc.). |
| `heading` | `string \| undefined` | Resolved heading (`section/sub.heading ?? md?.heading`). On a multi-slice mobile expansion, only the first slice carries it. |
| `subheading` | `string \| undefined` | Resolved stat subheading (config override or auto-extracted `*italic*`). |
| `paragraphs` | `string[]` | The sliced (and, for stat, italic-stripped) paragraph strings to render. |
| `heroPart` | `'title' \| 'dek'` (optional) | Mobile-only. Hero kinds split into two snaps: `title` (eyebrow + H1, empty paragraphs) and `dek` (dek + byline). Undefined for desktop units and non-hero kinds. |
| `sliceIndex` | `number` (optional) | Mobile-only. 0-based position of this mobile unit within a `mobileParagraphs` (or hero title/dek) expansion. Always 0 for desktop units and non-split mobile units. Used together with `(parentIndex, subIndex)` as the per-unit identity by TTS narration overrides (`lib/storyTts.ts`). |

The pure primitives in `ResolvedUnit` are safe to serialize from a server component into a client one.

---

## Story-wide defaults, frontmatter & theme system

This section documents the story-global configuration: the markdown frontmatter (in `<slug>.md`), the `theme` block and how its tokens become CSS variables, the `$token` syntax usable inside configs, the `defaults:` block at the top of `<slug>.config.yaml`, the persistent-logo palette cascade, and chart-level defaults.

A story is two sibling files:

- `<slug>.md` — prose body plus a YAML **frontmatter** block (fenced by `---`). Shape: `packages/viz-engine/src/types/story.ts` (`Frontmatter`).
- `<slug>.config.yaml` — render config: a `defaults:` object plus a `sections:` array. Shape: `packages/viz-engine/src/lib/storyConfig.types.ts` (`StoryConfig` → `StoryDefaults` + `StorySectionConfig[]`).

Charts referenced by sections live as JSON under `<slug>/charts/`.

### Frontmatter (in the `.md`)

Source: `packages/viz-engine/src/types/story.ts` — `interface Frontmatter`, `type StoryStatus`, `type StoryFormat`, `interface Theme`.

The frontmatter is parsed from the YAML block at the top of `<slug>.md`. The four required string fields are always rendered (title/subtitle/byline/date); the rest gate publication, listing, backdrop, vertical bundle and render format.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | string | — (required) | Story title. Surfaced in the hero/cover and as page metadata. |
| `subtitle` | string | — (required) | Story subtitle / dek. |
| `byline` | string | — (required) | Attribution line (author, source, date provenance). |
| `date` | string | — (required) | Publication date string (free-form; stories use ISO `YYYY-MM-DD`). |
| `theme` | `Theme` | — (required) | Color + font palette for the whole story. See [Theme](#theme). |
| `status` | `'draft' \| 'published' \| 'archived'` | `'published'` (when missing) | Publication state. `StoryStatus`. Missing is treated as published for backwards compatibility. |
| `listed` | boolean | `true` (when missing) | Whether the story appears on the home grid. Set `false` to keep a story reachable by URL but off the grid. |
| `aura` | string | unset | Aura embed slug (`https://aura.promad.design/embed/<slug>`) used as the home-tile background. In the **deck** format it is also the fallback page backdrop when `defaults.storyBackground` is omitted. |
| `vertical` | string | unset | Vertical bundle to load. When set, the page loads `components/story/viz/verticals/<vertical>/` so that vertical's viz types register before slots look them up (e.g. `starship` registers `starship:viewer`). Unknown verticals are ignored with a console warning. See `components/story/viz/verticals.ts`. |
| `format` | `'map' \| 'deck'` | `'map'` (when missing) | Top-level renderer discriminator (`StoryFormat`). `map` = legacy map-anchored scrollytelling (every section has its own `map:` camera). `deck` = snap-scrolled slide deck over a page-level backdrop. The page route branches on this. |

```yaml
---
title: "A Rocket Company That Became the Internet"
subtitle: "SpaceX's S-1 reveals three companies inside one stock — and only one of them makes money."
byline: "Vizmaya · SpaceX Form S-1, filed May 20, 2026 · SEC EDGAR"
date: "2026-05-27"
status: "published"
listed: true
vertical: "starship"          # loads @vismay/starship-viz for starship:viewer slots
format: "deck"                # deck format instead of legacy map
aura: minimalist-gold-background-elegant-white-design-for-websites
theme:
  colors: { ... }
  fonts: { ... }
---
```
(from `apps/vizmaya-fyi/content/stories/spacex-ipo-2026.md`)

### Theme

Source: `packages/viz-engine/src/types/story.ts` (`interface Theme`); resolution in `packages/story-reader/src/components/story/ThemeProvider.tsx`; chart-color derivation in `packages/viz-engine/src/lib/chartTheme.ts`.

`theme` has two objects: `colors` and `fonts`. Colors may be hex, `rgb()`, `rgba()`, or any CSS color (the only hard requirement is that `background` and `surface` are 6-digit hex so they can be expanded to an RGB triple — see below).

#### Color tokens

| Token | Type | Required | Description |
| --- | --- | --- | --- |
| `background` | string | yes | Page background. Emitted as `--color-bg`, applied to the wrapper `background`, and also expanded to `--color-bg-rgb`. Feeds chart `bg` (the opaque canvas fill used in capture mode). |
| `text` | string | yes | Body text. Emitted as `--color-text`; set as the wrapper `color`. |
| `accent` | string | yes | Primary accent. `--color-accent`; chart `accent`. |
| `accent2` | string | yes | Secondary accent. `--color-accent2`; chart `accent2`. **Default stat-number color** (see `statColorVar`). |
| `teal` | string | yes | Tertiary accent. `--color-teal`; chart `teal`. |
| `surface` | string | yes | Card/panel surface. `--color-surface`; also expanded to `--color-panel-rgb` for alpha-composited panel chrome. Feeds chart `surface`. |
| `muted` | string | yes | Muted text/secondary. `--color-muted`; chart `muted`. |
| `positive` | string | no (optional) | Positive/green. Emitted as `--color-positive` only when set. Feeds chart `green` (falls back to `#009966`). |
| `amber` | string | no (optional) | Amber/warning. `--color-amber` only when set. Chart `amber` (falls back to `#EF9F27`). |
| `red` | string | no (optional) | Negative/red. `--color-red` only when set. Chart `red` (falls back to `#E24B4A`). |
| `line` | string | no (optional) | Gridline/divider color. Has no hard-coded CSS var; flows into chart `line` (falls back to `#1a2830`) and into `--color-line` via the derived chart colors. |

Note the optional tokens (`positive`, `amber`, `red`) only emit their CSS var when present — code that reads `var(--color-red)` should expect it may be unset on a minimal theme. Charts never miss these: `themeToChartColors()` substitutes the `defaultChartColors` fallbacks (`packages/viz-engine/src/lib/chartTheme.ts`).

#### Font tokens

| Token | Type | Required | Description |
| --- | --- | --- | --- |
| `serif` | string | yes | Serif family. Emitted as `--font-serif`, with appended fallback `, 'Times New Roman', serif`. |
| `sans` | string | yes | Sans family. `--font-sans` with `, -apple-system, 'Segoe UI', Helvetica, sans-serif`. Set as the wrapper's `fontFamily`. |
| `mono` | string | yes | Monospace family. `--font-mono` with `, 'Courier New', Consolas, monospace`. Used by chart tooltips/labels. |

#### How tokens become CSS variables

`ThemeProvider` (`packages/story-reader/src/components/story/ThemeProvider.tsx`) maps each token to a CSS custom property on a wrapper `<div>`:

- `--color-bg`, `--color-text`, `--color-accent`, `--color-accent2`, `--color-teal`, `--color-surface`, `--color-muted` — direct from `theme.colors`.
- `--color-bg-rgb` and `--color-panel-rgb` — `theme.colors.background` / `theme.colors.surface` run through `hexToRgbTriple()` to a space-separated `"r g b"` string, so consumers can compose alpha via `rgb(var(--color-panel-rgb) / 0.8)`. Falls back to `10 14 20` if the input is not a 6-digit hex.
- `--color-line`, `--color-chrome-bg`, `--color-chrome-text`, `--color-chrome-text-dim`, `--color-chrome-text-muted` — taken from the derived `ChartColors` (so chart chrome and gridlines stay in lockstep with the palette).
- `--color-positive` / `--color-amber` / `--color-red` — emitted only when the corresponding optional token is set.
- `--font-serif` / `--font-sans` / `--font-mono` — token + appended system fallbacks.

The wrapper is forced into its own stacking context (`position: relative; z-index: 0`) so a deck story's fixed `z-index: -2` backdrop paints correctly above the wrapper background. It also publishes a `ChartColors` object (derived by `themeToChartColors`) through `ChartColorsProvider`, because ECharts needs real color strings at construction time, not `var(--...)` references.

#### The `$token` syntax in configs

Many config values accept a **theme token reference**: a string starting with `$` whose remainder names a `theme.colors` key. It is resolved against the active theme at render time. The convention is shared by maps, charts, choropleth ramps, label colors, and the logo palette.

- Logo palette: `resolveColor()` in `packages/viz-engine/src/lib/logoPalette.ts` — `"$accent"` → `theme.colors.accent`; a non-`$` value passes through as a literal color. A token that resolves to `undefined` (e.g. `$line` on a theme that omits `line`) is dropped.
- Stat number color: `kind: stat` sections use `color:` whose value is a `StatColor` token (`accent | accent2 | red | positive | amber | teal | muted`), resolved by `statColorVar()` to `var(--color-<token>)`, defaulting to `accent2` when unset (`packages/story-reader/src/components/story/ThemeProvider.tsx`).
- Map region labels / pill backgrounds / text labels also accept `$token` (e.g. `$surface`, `$muted`) — see `MapLabelBackground.color` / `MapRegionLabels.color` / `MapTextLabel.color` in `packages/viz-engine/src/types/story.ts`.

```yaml
# logoPalette uses $tokens; statColor is the bare token name
defaults:
  logoPalette:
    accent: "$accent2"   # the logo's accent slot resolves to theme.colors.accent2
sections:
  - kind: stat
    color: red           # → var(--color-red); defaults to accent2 if omitted
```

> Important: Mapbox itself does **not** accept CSS vars or `$tokens` in `mapPalette` color fields — those must be concrete hex/rgb/hsl (see `MapPalette` doc comment in `packages/viz-engine/src/lib/storyConfig.types.ts`). The `$token` indirection only applies where the renderer resolves it in JS first.

### StoryDefaults (`defaults:` at the top of `config.yaml`)

Source: `packages/viz-engine/src/lib/storyConfig.types.ts` — `interface StoryDefaults`.

`defaults:` holds story-wide settings inherited by every section. The first five fields (`mapStyle`, `mapOpacity`, `pinColor`, `pinRadius`, `flySpeed`) are typed as **required** in `StoryDefaults`; everything else is optional. In practice the map-only fields are only meaningful for `format: map` stories and the backdrop/panel/scroll fields are only consumed by `format: deck` stories — the **Format** column below marks which side each field serves.

| Option | Type | Default | Format | Description |
| --- | --- | --- | --- | --- |
| `mapStyle` | string | — (required) | map | Mapbox style URL applied to the persistent map (e.g. `mapbox://styles/mapbox/dark-v11`). |
| `mapOpacity` | number | — (required) | map | Base map opacity 0..1. Per-section `map.opacity` overrides. |
| `pinColor` | string | — (required) | map | Default fill color for map pins. Per-pin `color` overrides. |
| `pinRadius` | number | — (required) | map | Default pin radius in px. Per-pin `radius` overrides. |
| `flySpeed` | number | — (required) | map | Default camera `flyTo` speed. Per-section / per-subsection `flySpeed` overrides. |
| `highlightCountry` | string | unset | map | ISO 3166-1 alpha-2 code to highlight on the map (e.g. `"KR"`). |
| `highlightColor` | string | `pinColor` | map | Override color for the country highlight; defaults to `pinColor`. |
| `mapPalette` | `MapPalette` | unset | map | Per-story semantic color overrides applied on top of a **classic** Mapbox style at runtime. See [MapPalette](#mappalette-classic-styles). Concrete colors only — no CSS vars. Does nothing on Standard styles. |
| `mapFontstack` | `string[]` | unset | map | Mapbox fontstack applied to every text layer. Must reference fonts that exist on the style's `glyphs:` URL (uploaded to Mapbox Studio), e.g. `["Vizmaya Serif Regular"]`. |
| `basemapConfig` | `Record<string, string \| number \| boolean>` | unset | map | Config properties for Mapbox v3 **Standard** / **Standard Satellite** styles. Applied via `map.setConfigProperty('basemap', key, value)` and passed as the initial `config.basemap`. See [basemapConfig](#basemapconfig-standard-styles). Ignored on classic styles. |
| `storyBackground` | `StoryBackgroundConfig` | aura→frontmatter `aura`, else `{type:'none'}` | deck | Page-level backdrop mounted once outside the snap container, persisting across every section. Resolution order in the page route: `defaults.storyBackground` → frontmatter `aura` (deck) → `{ type: 'none' }` (map). See [storyBackground](#storybackground-deck). |
| `overlay` | `OverlayConfig` | unset | deck | Darken/tint layer painted between the story background and the foreground content, for chart legibility over busy aura motion. See [overlay](#overlay-deck). |
| `panel` | `VizLayerPanel` | unset | deck | Default frosted-glass chrome for every foreground panel. Each vizslot inherits it unless its `style.panel` (or a per-section `panel`) overrides per-field. See [panel](#panel-vizlayerpanel). |
| `scroll` | `DeckScrollConfig` | unset | deck | Deck scroll mode + viewport padding. Advisory; honored by the deck shell. `{ mode: 'snap' \| 'continuous'; paddingY?: string }`. |
| `chart` | `ChartDefaults` | unset | both | Story-wide chart defaults (`theme` + `grid`) forwarded to the chart module. See [ChartDefaults](#chartdefaults). |
| `progress` | boolean | `false` | deck | When `true`, the deck shell mounts a fixed right-edge step indicator (one hairline per snap unit, active one wider/darker) with click-to-jump. Off by default. |
| `logoPalette` | `LogoPalette` | unset (→ theme) | both | Story-wide base override for the persistent Vizmaya logo's Rive colors, applied on top of the theme palette; sections layer their own `logoPalette` over this. Values are `$token` or hex. See [Logo palette cascade](#logo-palette-cascade). |

#### MapPalette (classic styles)

Source: `packages/viz-engine/src/lib/storyConfig.types.ts` — `interface MapPalette`, `type LayerOverride`. Semantic color overrides applied on top of a stock classic Mapbox style at runtime, so you can restyle to the story's palette without forking the style in Studio. Color fields are concrete colors (hex/rgb/hsl — **no CSS vars**); unset color fields keep the base style. The label/road category fields are **hidden by default** to keep the map quiet under the story; a value opts them back in.

`LayerOverride = boolean | string`: `undefined | false` → hide the category; `true` → show using the base style's own color; `string` → show, overriding the color.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `land` | string | base style | Base map background — `background` + `land` layers. |
| `water` | string | base style | Water fills — `water`, `water-shadow`, `waterway-*`. |
| `border` | string | base style | Country/state border lines — `admin-*-boundary[-bg]`. |
| `labelText` | string | base style | Text fill for every visible symbol layer with a `text-field`. |
| `labelHalo` | string | base style | Text halo (outline) for those symbol layers. |
| `building` | string | base style | 3D/2D building fill. |
| `placeLabels` | `LayerOverride` | hidden | Country/state/settlement/place labels. |
| `roadLabels` | `LayerOverride` | hidden | Road/street name labels. |
| `transitLabels` | `LayerOverride` | hidden | Transit (bus/subway/rail) labels. |
| `poiLabels` | `LayerOverride` | hidden | POI + airport labels. |
| `motorways` | `LayerOverride` | hidden | Motorways/highways (+ matching bridge/tunnel casings). |
| `trunkRoads` | `LayerOverride` | hidden | Trunk roads (`road-trunk*`). |
| `minorRoads` | `LayerOverride` | hidden | Primary/secondary/tertiary/minor/street/service roads. |
| `pedestrianPaths` | `LayerOverride` | hidden | Pedestrian paths, footways, steps. |

```yaml
defaults:
  mapStyle: mapbox://styles/mapbox/dark-v11
  mapOpacity: 0.55
  pinColor: "#5ac8d4"
  pinRadius: 12
  flySpeed: 1.2
  mapPalette:
    land: "#0f1419"
    water: "#0a1018"
    border: "#2a3545"
    labelText: "#c8d1dc"
    labelHalo: "#0a1018"
```
(from `apps/vizmaya-fyi/content/stories/europe-ai-adoption-2026.config.yaml`)

#### basemapConfig (Standard styles)

For Mapbox v3 `mapbox://styles/mapbox/standard` / `…/standard-satellite`. Standard styles are **not** layer-addressable, so `mapPalette` does nothing on them — use `basemapConfig` to control roads, labels, 3D objects and lighting. Unsupported keys for the active style are silently ignored. Common keys (from the doc comment in `storyConfig.types.ts`): `lightPreset` (`dawn|day|dusk|night`), `show3dObjects`, `show3dBuildings`, `showRoadLabels`, `showPlaceLabels`, `showPointOfInterestLabels`, `showTransitLabels`, `showRoadsAndTransit`, `showPedestrianRoads`, plus a `theme` key (`default|faded|monochrome`).

```yaml
defaults:
  mapStyle: mapbox://styles/mapbox/standard
  basemapConfig:
    theme: monochrome            # default | faded | monochrome
    lightPreset: dusk            # dawn | day | dusk | night
    show3dObjects: true
    showRoadLabels: false
    showPointOfInterestLabels: false
    showTransitLabels: false
    showPlaceLabels: true
```
(from `apps/vizmaya-fyi/content/stories/geography-of-political-money-2026.config.yaml`)

#### storyBackground (deck)

Source: `type StoryBackgroundConfig`. A discriminated union on `type`:

| `type` | Fields | Description |
| --- | --- | --- |
| `aura` | `slug` (string, required); `input?: 'on' \| 'off'` (default off in deck); `tint?: string`; `tintBlendMode?: 'multiply'\|'screen'\|'overlay'\|'soft-light'\|'difference'\|'normal'` (default `multiply` when `tint` set); `fixed?: boolean` (default `true`) | Mounts the same aura embed used by the home tile. `tint` applies a CSS-blend layer above the aura. `fixed` pins it while the page scrolls. |
| `image` | `src` (string, required); `fit?: 'cover'\|'contain'\|'fill'`; `position?: string` | Static image backdrop. |
| `color` | `value` (string, required) | Solid color backdrop. |
| `none` | — | No backdrop. |

```yaml
defaults:
  storyBackground:
    type: aura
    slug: "blue-abstract-background-elegant-soft-waves-for-design"
    fixed: true
```
(from `apps/vizmaya-fyi/content/stories/spacex-ipo-2026.config.yaml`)

#### overlay (deck)

Source: `interface OverlayConfig`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `color` | string | unset | Solid color floor. Combined with `opacity` if both set. |
| `opacity` | number | unset | 0..1, applied to `color` when no gradient is supplied. |
| `gradient` | object | unset | Radial/linear gradient layered above `color`: `{ type: 'radial' \| 'linear'; from: string; to: string; angle?: string }`. `angle` is the linear direction (`'45deg'` or `'to bottom'`); ignored for radial. |

```yaml
defaults:
  overlay:
    color: "transparent"
    opacity: 0
```
(from `apps/vizmaya-fyi/content/stories/spacex-ipo-2026.config.yaml`)

#### panel (`VizLayerPanel`)

Source: `packages/viz-engine/src/types.ts` — `interface VizLayerPanel`. The story-wide default frame for foreground panels. It merges over each vizslot's module default and is itself overridable per-section (`section.panel`) and per-slot (`style.panel`).

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `background` | string | module default | CSS `background` shorthand (color, gradient, `rgb()`/`oklch()` with `var()`). |
| `border` | string | module default | CSS `border` shorthand. |
| `borderRadius` | string | module default | CSS `border-radius` (e.g. `'8px'`). |
| `padding` | string | module default | CSS `padding` shorthand. |
| `backdropBlur` | string | module default | Radius for `backdrop-filter: blur(<value>)`. |
| `shadow` | string | module default | CSS `box-shadow` shorthand. |

```yaml
defaults:
  panel:                 # editorial: type on paper, no glass cards
    background: "transparent"
    border: "none"
    borderRadius: "0"
    padding: "0"
    backdropBlur: "0"
```
(from `apps/vizmaya-fyi/content/stories/spacex-ipo-2026.config.yaml`)

#### scroll (deck)

Source: `interface DeckScrollConfig`. `{ mode: 'snap' | 'continuous'; paddingY?: string }`. `snap` produces a one-viewport-per-section slide-deck feel; `continuous` is cinematic scroll. `paddingY` is per-section viewport padding (e.g. `"12vh"`).

```yaml
defaults:
  scroll:
    mode: snap
    paddingY: "12vh"
```
(from `apps/vizmaya-fyi/content/stories/spacex-ipo-2026.config.yaml`)

### Logo palette cascade

Source: `packages/viz-engine/src/lib/logoPalette.ts` (`resolveSectionLogoPalettes`, `SLOTS`); type `LogoPalette` in `storyConfig.types.ts`; per-section field `StorySectionConfig.logoPalette`.

The persistent top-left Vizmaya logo is a Rive animation whose colors are bound to a view-model. Authors recolor it via `LogoPalette` objects. The seven slots, in `.riv` view-model binding order, map to bindings as:

| Slot | `.riv` binding | Default (theme token) |
| --- | --- | --- |
| `text` | `textColor` | `theme.colors.text` |
| `teal` | `tealColor` | `theme.colors.teal` |
| `accent` | `accentColor` | `theme.colors.accent` |
| `accent2` | `accent2Color` | `theme.colors.accent2` |
| `surface` | `surfaceColor` | `theme.colors.surface` |
| `muted` | `mutedColor` | `theme.colors.muted` |
| `line` | `lineColor` | `theme.colors.line` (may be undefined → slot dropped) |

Each slot value is either a `$token` (resolved against the active theme via `resolveColor`) or a concrete hex. Unset slots inherit. The **three-tier cascade** is applied per section by `resolveSectionLogoPalettes(theme, defaults, sections)`:

1. **Theme base** — `basePalette(theme)`: every slot from `theme.colors`.
2. **`defaults.logoPalette`** — story-wide override layered over the theme base (`applyOverride`).
3. **`section.logoPalette`** — per-section override layered over the result of (2).

The function returns one resolved palette per `config.sections` entry (array index = `parentIndex`), so the shell can look up the active section's palette as `palettes[current.parentIndex]` and re-tint the logo as the reader scrolls. A slot whose resolved value is `undefined` is omitted (e.g. `$line` on a theme without `line`).

```yaml
defaults:
  logoPalette:
    accent: "$accent2"   # story-wide base: logo accent slot → theme accent2
sections:
  - id: cover
    logoPalette:
      text: "$surface"   # this section overrides only the text slot
```
(pattern from `apps/vizmaya-fyi/content/stories/spacex-ipo-2026.config.yaml`)

### ChartDefaults

Source: `packages/viz-engine/src/lib/storyConfig.types.ts` — `interface ChartDefaults`. Forwarded to the chart module's render path so individual chart JSONs need not repeat theme/grid.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `theme` | string | unset | Named chart theme forwarded to the chart module (e.g. `light-editorial`). |
| `grid` | object | unset | ECharts-style grid insets. `{ left?, right?, top?, bottom? }`, each `number \| string` (px number or CSS string like `'12%'`). |

```yaml
defaults:
  chart:
    theme: light-editorial
    grid: { left: 64, right: 32, top: 56, bottom: 56 }
```
(from `apps/vizmaya-fyi/content/stories/spacex-ipo-2026.config.yaml`)

### Annotated full `defaults:` example

A representative deck-format `defaults:` block exercising every story-global field (commented per field):

```yaml
defaults:
  # ── Map fields (consumed by format: map; harmless on deck) ───────────
  mapStyle: mapbox://styles/mapbox/dark-v11   # required by StoryDefaults
  mapOpacity: 0.55                            # required — base map opacity 0..1
  pinColor: "#155dfc"                         # required — default pin fill
  pinRadius: 12                               # required — default pin radius (px)
  flySpeed: 1.2                               # required — default camera flyTo speed
  highlightCountry: "KR"                      # ISO alpha-2 country highlight
  highlightColor: "#155dfc"                   # highlight color (defaults to pinColor)
  mapPalette:                                 # classic-style recolor (hex only)
    land: "#0f1419"
    water: "#0a1018"
    border: "#2a3545"
    labelText: "#c8d1dc"
    labelHalo: "#0a1018"
    placeLabels: true                         # opt a hidden category back in
  mapFontstack: ["Vizmaya Serif Regular"]     # fonts must exist on the style's glyphs:
  basemapConfig:                              # Standard-style only (ignored on classic)
    lightPreset: dusk
    showRoadLabels: false

  # ── Deck fields (consumed by format: deck) ──────────────────────────
  storyBackground:                            # page-level backdrop, mounted once
    type: aura
    slug: "blue-abstract-background-elegant-soft-waves-for-design"
    tint: "#0a0e1a"
    tintBlendMode: multiply
    fixed: true
  overlay:                                    # darken/tint between backdrop & content
    color: "#05070d"
    opacity: 0.4
    gradient:
      type: linear
      from: "rgba(0,0,0,0)"
      to: "rgba(0,0,0,0.6)"
      angle: "to bottom"
  panel:                                      # default frosted-glass card chrome
    background: "rgb(var(--color-panel-rgb) / 0.7)"
    border: "1px solid var(--color-line)"
    borderRadius: "12px"
    padding: "24px"
    backdropBlur: "10px"
  scroll:                                     # snap (slide deck) | continuous (cinematic)
    mode: snap
    paddingY: "12vh"
  progress: true                              # right-edge step indicator

  # ── Cross-format fields ─────────────────────────────────────────────
  chart:                                      # forwarded to chart module
    theme: light-editorial
    grid: { left: 64, right: 32, top: 56, bottom: 56 }
  logoPalette:                                # story-wide base for the persistent logo
    accent: "$accent2"                        # $token or hex; sections layer over this

sections:
  # …
```

---

## Viz module system (foreground/background slots)

Every visual a story renders — a chart, a map, a hero image, a big number, a block of prose — is produced by a **viz module**. A module is a self-contained plugin that knows how to (a) validate a raw YAML blob into its own typed config, (b) lazy-load a React component, and (c) report metadata the engine needs (asset keys, readiness, dedupe identity, default styling). The story page never hard-codes any viz type; it only knows about two **slots** — `foreground` and `background` — and a registry that maps a `type:` string to a module.

This section documents the framework: the slot model, the `VizModule` contract, mounting modes, how a `VizLayer` is authored in YAML and dispatched, the admin-form field kinds, and the full registry table. It deliberately stops at the framework boundary — each module's own config fields are documented in its dedicated per-module section (linked from the registry table below).

Source of truth: `packages/viz-engine/src/types.ts` (the contract), `packages/viz-engine/src/registry.ts` (the registry), `packages/viz-engine/src/ForegroundVizSlot.tsx` and `packages/viz-engine/src/BackgroundVizSlot.tsx` (the dispatchers), and `packages/viz-engine/src/lib/resolveSlots.ts` (the YAML→slots shim).

### Slots: foreground vs background

A `VizSlot` is a binary union — there are exactly two slots (`packages/viz-engine/src/types.ts`):

```ts
export type VizSlot = 'foreground' | 'background'
```

Each section of a story declares its layers into these two slots. A module advertises which slots it is allowed to render into via its `slots: readonly VizSlot[]` array; the dispatchers reject a layer whose module does not list the slot it was authored into (logging a `console.warn` and degrading silently rather than crashing).

#### Foreground slot

Rendered by `ForegroundVizSlot` (`packages/viz-engine/src/ForegroundVizSlot.tsx`). The foreground holds the **per-unit** content stack — the layers that change as the reader scrolls from one snap unit to the next. The slot is a `position: relative` box (`width: 100%; height: 100%`) and each layer is mounted into an absolutely-positioned wrapper computed by `layerWrapperStyle()`.

Key behaviors:

- **Stacking / z-order.** Layers paint in declaration order; `zIndex` defaults to the layer's array index. Layer 0 gets `pointer-events: auto` by default (it is interactive — e.g. a chart with tooltips); subsequent layers default to `pointer-events: none` so overlays don't steal clicks. Both are overridable via `style.pointerEvents`.
- **Positioning.** Without `style.position`/`style.size` a layer fills the slot (`inset: 0`). With either set it becomes a free-floating box; `position.x`/`position.y` map to `left/right/center` (center uses a `translate` transform) or any raw CSS length string.
- **Region layouts.** A foreground can be authored as a flat array OR as a named-region layout (`{ layout, regions }`) — see "Authoring a VizLayer" below. Regions are a foreground-only concept; `VizSlot` stays binary so the registry and background dispatch never learn region semantics (`ForegroundRegionName`, `ForegroundLayoutRegion`, `ForegroundLayoutDef` in `types.ts`).
- **Portrait stacking.** When a layout is flagged `stackOnPortrait` and the viewport is portrait, `ForegroundVizSlot` receives `portraitStack` and lays slots out as a full-width vertical flex column instead of honoring authored `%`-widths. Visual slot types (`chart`, `image`, `imageGrid`, `mapbox`/`map`, `embed`, `rive`, `starship:viewer` — the `STACK_VISUAL_TYPES` set) get a default `40vh` stacked height because they have no intrinsic block height; text-like modules size to their own content. Any layer can override with `style.portrait.size.height`.
- **Per-layer keying.** Layers key on `module.stableIdentity?.(layer)` when present (so e.g. an ECharts instance persists across subsections of one parent and tweens between `activeStep` values), else on a unit-scoped `${unitKey}:${index}:${type}` key that remounts cleanly on unit change.

The component receives `VizRenderProps<TConfig>` (`types.ts`):

| Prop | Type | Description |
| --- | --- | --- |
| `slug` | `string` | Story slug; used to resolve `assets://` and chart JSON paths. |
| `unitKey` | `string` | Identity of the active unit; drives state reset across sections. |
| `config` | `TConfig` | The module's parsed config (output of `parseConfig`). |
| `activeStep` | `number` | The active subsection index — drives stepped chart/rive animation. |
| `mode` | `'scroll' \| 'autoplay' \| 'capture' \| 'print'` | Render context. `capture`/`print` are the PDF/share paths. |
| `noteReady` | `() => void` | Call once at first paint so capture/PDF can wait for all layers. |
| `captureRef` | `RefObject<VizCaptureHandle \| null>` (optional) | Lets the capture pipeline `freeze()`/`resume()` the layer. |
| `isActive` | `boolean` | Whether this layer's unit is the active one. |

#### Background slot

Rendered by `BackgroundVizSlot` (`packages/viz-engine/src/BackgroundVizSlot.tsx`). The background is the **persistent backdrop** that sits behind the whole scroll-snap container. It paints into either:

- `containerMode: 'viewport'` (default) — `position: fixed; inset: 0; z-0; pointer-events: none`. The story page scrolls above it and lets the map/aura show through.
- `containerMode: 'tile'` — `position: absolute; inset: 0` so the canvas editor can mount one instance per tile without each painting full-viewport.

`BackgroundVizSlot` takes the *whole* `units: ResolvedUnit[]` array (not just the active unit) and calls `buildInstances()` to compute the **union** of every unit's background stack, deduped by `(type, stableIdentity)`. Each distinct instance is an `InstanceEntry` carrying a `perUnitLayers: (VizLayer | null)[]` array — one slot per unit, `null` where that unit's background omits the instance. This dedupe is what keeps a single Mapbox WebGL context alive across scroll instead of disposing and rebuilding it on every snap.

Background layers are full-bleed by default (`inset: 0`, `pointer-events: none`) so the snap container and foreground card chrome stay clickable; `style.position`/`style.size` turn a background layer into a free-floating overlay (drops `inset: 0`). Background layers honor the same `style` fields as foreground layers except panel chrome is not applied here (`layerWrapperStyle` in `BackgroundVizSlot.tsx` omits `applyPanel`).

### The VizModule contract

A module implements `VizModule<TConfig>` (`packages/viz-engine/src/types.ts`). The registry stores them with the generic erased (`VizModule<any>`) because each module owns its own incompatible `TConfig`; erasure at the registry boundary is safe since each module round-trips raw YAML → its own config → its own component.

| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `type` | `string` | — | yes | The `type:` key authors write in YAML. Must be unique across the registry (`registerVizModule` throws on collision). |
| `label` | `string` | — | yes | Human label shown in the admin form / module picker. |
| `slots` | `readonly VizSlot[]` | — | yes | Which slots the module may render into. Dispatchers reject layers authored into a slot not listed here. |
| `parseConfig` | `(raw: unknown, ctx: { slug; label }) => TConfig` | — | yes | Validates/normalizes the raw YAML layer object into the module's typed config. Throws on invalid input; the dispatcher catches, logs, and renders nothing for that layer. `ctx.label` is a debug breadcrumb like `foreground[1] (chart)`. |
| `load` | `() => Promise<{ default: ComponentType<VizRenderProps<TConfig>> }>` | — | yes | Lazy dynamic import of the per-unit render component. Wrapped in `React.lazy` + `Suspense` so the module's bundle is code-split. |
| `loadPersistent` | `() => Promise<{ default: ComponentType<VizPersistentRenderProps<TConfig>> }>` | — | only when `mountingMode === 'persistent-aggregated'` | Variant component for the aggregated mounting mode (one instance fed every unit's config). Used by the map module. |
| `mountingMode` | `VizMountingMode` | `'per-unit'` | no | How `BackgroundVizSlot` mounts the module (`per-unit` vs `persistent-aggregated`). See "Mounting modes" below. Ignored in the foreground slot. |
| `introspect` | `(config, { assetUrl }) => Promise<unknown>` | — | no | Optional async metadata extraction used by the asset/build pipeline (e.g. read a `.riv` file's artboards). Only the rive module implements it. |
| `adminForm` | `(config: TConfig \| null) => AdminFormField[]` | — | no | Returns the field descriptors the admin UI renders to edit this layer. `null` config means "new layer". See "Admin form fields". |
| `readinessProfile` | `'instant' \| 'first-paint' \| 'tiles-then-settle'` | — | no | Hint to the readiness/capture system about how long the module takes to be paint-stable. `instant` = synchronous (text), `first-paint` = one frame after mount (chart/image/video/embed/rive/imageGrid/table), `tiles-then-settle` = waits for tile loads then camera settle (map). |
| `collectAssetKeys` | `(config: TConfig) => string[]` | — | no | Returns the `assets://` keys this layer references so the bundler can resolve/copy them. Implemented by `image`, `video`, `embed`, `rive`. |
| `stableIdentity` | `(config: TConfig) => string` | — | no | Deterministic identity string for dedupe/keying. In the background slot it gates instance dedup (`map:default` collapses every unit's map into one instance); in the foreground it persists the component across subsections. Falls back to a per-unit key (foreground) or `${type}:${JSON.stringify(layer)}` (background) when omitted. |
| `defaultStyle` | `VizLayerStyle` | — | no | Module-level default for the layer's `style`. Merged per-field *under* the author's `style`, so a YAML `style.panel.background` overrides only that field of the default panel. Text-like modules ship a card-frame `panel` here so a bare `- type: text` looks framed out of the box. |
| `regionPreferences` | `readonly ForegroundRegionName[]` | — | no | Advisory list of region names the module suits best (admin-form guidance only — the layout's per-region `accepts` allowlist is the runtime gate). E.g. `bigStat` prefers `['lead', 'stat']`, `text` prefers `['body', 'lead']`. |

#### How style defaults merge

`resolveLayerStyle()` in `ForegroundVizSlot.tsx` computes the effective style as a per-field shallow merge: `module.defaultStyle` first, then the layer's authored `style`, then (portrait only) the layer's `style.portrait`. `panel` is merged at the sub-field level so an author can override one panel field without losing the rest of the module default. The `portrait` key is stripped from the resolved style so it never self-nests downstream.

The `VizLayerStyle` shape (`types.ts`):

| Style field | Type | Description |
| --- | --- | --- |
| `position.x` | `'left' \| 'center' \| 'right' \| string` | Horizontal anchor or raw CSS length (e.g. `"12%"`). |
| `position.y` | `'top' \| 'center' \| 'bottom' \| string` | Vertical anchor or raw CSS length. |
| `size.width` / `size.height` | `string` | CSS lengths (`"44%"`, `"62vh"`). |
| `opacity` | `number` | 0–1. |
| `blendMode` | `'normal' \| 'multiply' \| 'screen' \| 'overlay' \| 'soft-light' \| 'difference'` | Maps to CSS `mix-blend-mode`. |
| `pointerEvents` | `'auto' \| 'none'` | Overrides the index-based default. |
| `zIndex` | `number` | Overrides the index-based default. |
| `panel` | `VizLayerPanel` | Optional chrome around the wrapper box (see below). |
| `portrait` | `VizLayerStyle` | Per-slot overrides applied when `useIsMobile()` is true. Shallow-merged over the base. A nested `portrait` is ignored. |

`VizLayerPanel` (chrome forwarded straight to CSS — no DSL): `background`, `border`, `borderRadius`, `padding`, `backdropBlur` (becomes `backdrop-filter: blur(...)` plus a `-webkit-` prefix in Safari), `shadow` (`box-shadow`). Every field is optional; unset fields render bare.

### Mounting modes

The `VizMountingMode` (`types.ts`) selects how `BackgroundVizSlot` instantiates a module across the story's units. It is only consulted in the background slot — foreground layers always mount per layer in the active unit's stack.

| Mode | Component / props | Instances | Used by | Why |
| --- | --- | --- | --- | --- |
| `per-unit` (default) | `load()` → `VizRenderProps` | One per unique `stableIdentity`; visibility toggles by whether the active unit references it | `image`, `video`, `embed`, `rive` (whichever a story drops into `background:`) | Each unit's config is self-contained and cheap to mount; keeping the instance alive across scroll avoids reload between units sharing the same src. |
| `persistent-aggregated` | `loadPersistent()` → `VizPersistentRenderProps` | Exactly one for the whole story | `map` only | Mapbox disposal/rebuild is expensive, so one WebGL context is kept alive and per-unit camera state is derived from `activeUnit`. |

In `per-unit` mode (`PerUnitLayer` in `BackgroundVizSlot.tsx`) the slot parses the active unit's layer (falling back to the first non-null) and toggles `visibility: hidden` when the active unit doesn't reference the instance. In `persistent-aggregated` mode (`PersistentLayer`) the slot parses *every* unit's layer into a `configs: (TConfig | null)[]` array and hands all of them to the single component at once.

`VizPersistentRenderProps<TConfig>` (`types.ts`):

| Prop | Type | Description |
| --- | --- | --- |
| `slug` | `string` | Story slug. |
| `configs` | `(TConfig \| null)[]` | One entry per unit; `null` where that unit's background omits this layer. |
| `activeUnit` | `number` | Index of the active unit — the module derives camera/state from this. |
| `mode` | `'scroll' \| 'autoplay' \| 'capture' \| 'print'` | Render context. |
| `noteReady` | `() => void` | First-paint signal for the readiness/capture system. |
| `captureRef` | `RefObject<VizCaptureHandle \| null>` (optional) | `freeze()`/`resume()` for capture. |

### Authoring a VizLayer

A `VizLayer` is the YAML unit an author writes. It is structurally a `VizRef` (an object with a `type: string` discriminant plus arbitrary module-specific fields) optionally carrying a `style` block (`types.ts`):

```ts
export interface VizRef<TKind extends string = string> { type: TKind; [key: string]: unknown }
export type VizLayer = VizRef & { style?: VizLayerStyle }
```

The dispatcher resolves `getVizModule(layer.type)`, runs `module.parseConfig(layer, ...)` (the whole layer object is the raw input — `type` and `style` included), then renders `module.load()`'s component with the parsed config. Everything except `type` and `style` is interpreted by the module, so the set of valid keys per layer is defined by that module's `parseConfig` (documented in the per-module sections).

#### Three ways a section declares its slots

`resolveSlots()` (`packages/viz-engine/src/lib/resolveSlots.ts`) normalizes a section's authoring shape into `{ foreground, background }`. It is a back-compat shim and never mutates the section.

**1. Flat foreground array** — the deck "free" style, where each slot self-positions via `style`:

```yaml
- id: segments
  kind: split
  text: "Three segments, three stories"
  layout: text-left-chart-right
  foreground:
    - type: bodyText
      from: text
      style:
        position: { x: left, y: center }
        size: { width: "44%" }
    - type: chart
      id: segment-revenue
      caption: "2025 segment P&L · revenue, operating income, Adj. EBITDA"
      style:
        position: { x: right, y: center }
        size: { width: "50%", height: "62vh" }
```
*(from `apps/vizmaya-fyi/content/stories/spacex-ipo-2026.config.yaml`)*

When a flat `foreground:` array is paired with a section-root `layout:` string, `resolveForeground()` wraps it into a single-region `{ kind: 'regions', layout, regions: { default: layers } }`. If both `section.layout` and a `foreground.layout` are present, `foreground.layout` wins.

**2. Explicit region map** (`ForegroundRegionsInput` in `storyConfig.types.ts`) — the author names the layout and slots layers into its named regions; a single `VizLayer` per region is sugar for a one-element array:

```yaml
foreground:
  layout: split-37-63-two-row
  regions:
    lead:
      - type: bigStat
        value: "$18.7B"
    chart:
      type: chart
      id: revenue-by-year
```

**3. Single layer / legacy sugar.** A bare object or a top-level `chart:` string both resolve to a one-element flat array (`{ type: 'chart', id: section.chart }`). For the background, a top-level `map:` block with a `center` array is synthesized into a single `{ type: 'map', ... }` layer.

#### Background slot authoring

`background:` accepts a single layer, an array of layers, or the whole-slot opt-out `{ type: 'none' }` (`VizSlotNone`), which suppresses the persistent backdrop for that section (`asBackgroundArray` returns `[]`):

```yaml
- id: starlink-prose
  kind: bodyText
  background: { type: none }   # opt out of the persistent map/aura for this section
  foreground:
    - type: bodyText
      from: text
```
*(pattern from `apps/vizmaya-fyi/content/stories/spacex-s1-2026.config.yaml` and `paris-road-to-budapest.config.yaml`)*

When a section omits `background:` but carries a legacy `map:` block, the shim synthesizes a single map background layer — this is how map-format stories keep one persistent Mapbox instance behind every section.

### Admin form fields

`AdminFormField` (`types.ts`) is the discriminated union a module returns from `adminForm()` to describe its editable fields in the admin UI. Each variant carries a `key` (the config field it edits) and a `label`:

| Kind | Extra fields | Purpose |
| --- | --- | --- |
| `asset` | `accept: string[]`, `required?` | File picker constrained by MIME (e.g. `['image/*']`, `['video/mp4','video/webm']`). Writes an `assets://` key. |
| `text` | `placeholder?`, `required?` | Single-line string input. |
| `number` | `min?`, `max?`, `step?` | Numeric input with optional bounds/step. |
| `boolean` | — | Toggle. |
| `select` | `options: { value; label }[]` | Dropdown from a fixed option list (e.g. image `fit`, alignment). |
| `theme-token` | — | Picker for a theme palette token (e.g. a stat number's color). |
| `json` | `placeholder?` | Raw JSON textarea for structured fields (e.g. table `columns`/`rows`, rive `viewModel`, keyValue `items`). |

These descriptors are advisory metadata for the editor; the authoritative validation remains each module's `parseConfig`.

### Registered modules

Thirteen modules are registered as core in `packages/viz-engine/src/registry.ts` (in this order). `registerVizModule()` lets verticals add their own without touching core. The table summarizes each; see the linked per-module section for full config fields.

| `type` | Label | Slots | Mounting | Purpose |
| --- | --- | --- | --- | --- |
| `chart` | Chart | `foreground` | per-unit | ECharts visualization loaded by `id` from `<slug>/charts/<id>.json`; persists across subsections (`stableIdentity` = `chart:<id>`), animates by `activeStep`. → *Chart module*. |
| `map` | Map | `background`, `foreground` | persistent-aggregated | One persistent Mapbox instance behind the story; camera/pins/regions/heatmap derived per-unit from `configs[activeUnit]` (`stableIdentity` = `map:default`). → *Map module*. |
| `image` | Image | `foreground`, `background` | per-unit | Static image with `fit`/`focus`/`priority`; resolves `assets://` src. → *Image module*. |
| `embed` | Embed (iframe) | `foreground`, `background` | per-unit | Sandboxed iframe embed with poster fallback for capture. → *Embed module*. |
| `video` | Video | `foreground`, `background` | per-unit | HTML5 video with loop/muted/autoplay/poster + capture freeze. → *Video module*. |
| `rive` | Rive | `foreground`, `background` | per-unit | `.riv` animation with artboard/state-machine, view-model bindings, scroll→input mapping; `introspect` reads artboards. → *Rive module*. |
| `text` | Text | `foreground` | per-unit | Section text card (paragraphs or stat variant) with default panel chrome. → *Text module*. |
| `bigStat` | Big stat | `foreground` | per-unit | Giant number + unit/label/delta with theme-token coloring. → *BigStat module*. |
| `bodyText` | Body text | `foreground` | per-unit | Prose block (paragraphs) with size/color variants; pulls from the markdown via `from: text`. → *BodyText module*. |
| `quote` | Quote | `foreground` | per-unit | Pull-quote with attribution and alignment. → *Quote module*. |
| `keyValue` | Key/value list | `foreground` | per-unit | Labeled key/value rows with optional per-row color. → *KeyValue module*. |
| `imageGrid` | Image grid | `foreground` | per-unit | Grid of images with captions and a `fit` mode. → *ImageGrid module*. |
| `table` | Table | `foreground` | per-unit | Tabular data with typed/formatted columns and rows. → *Table module*. |

All modules except `map` use the default `per-unit` mounting mode. Only `map` ships a `loadPersistent` (required by `persistent-aggregated`). `chart`, `image`, `embed`, `video`, `rive`, `imageGrid`, `table` use the `first-paint` readiness profile; `text`, `bigStat`, `bodyText`, `quote`, `keyValue` are `instant`; `map` is `tiles-then-settle`.

---

## Module: chart

The `chart` viz module renders an ECharts-backed data chart in the **foreground** of a story unit. It is the layered-schema replacement for the legacy `chart:` shortcut and the `data:`-prefixed ScrollySection blocks. The module itself is intentionally thin: its layer config carries only an `id`, and that `id` resolves through `ChartPanel` to either a bespoke hand-built chart component or — for the common case — the data-driven `GenericChart`, which fetches the chart's ECharts option(s) from a JSON file and themes them against the story's palette.

Source: `packages/viz-engine/src/modules/chart/index.ts`, `packages/viz-engine/src/modules/chart/Component.tsx`, `packages/viz-engine/src/charts/ChartPanel.tsx`, `packages/viz-engine/src/charts/StoryEChart.tsx`, `packages/viz-engine/src/charts/GenericChart.tsx`, `packages/viz-engine/src/charts/chartCapture.tsx`.

### Module identity

| Field | Value | Source |
| --- | --- | --- |
| `type` | `"chart"` | `packages/viz-engine/src/modules/chart/index.ts` (`type: 'chart'`) |
| `label` | `"Chart"` | same — shown in the admin picker |
| `slots` | `['foreground']` | foreground-only; it cannot be used as a `background:` layer |

Because `slots` is `['foreground']`, `ForegroundVizSlot` accepts the module but `BackgroundVizSlot` does not. A `chart` placed under `background:` is dropped with a `[ForegroundVizSlot] unknown or non-foreground viz type` console warning (see `packages/viz-engine/src/ForegroundVizSlot.tsx`, the `module.slots.includes('foreground')` guard).

The module is registered in core at `packages/viz-engine/src/registry.ts` (`chartModule` is the first entry in `core`), so it is always available without a vertical opt-in.

### Layer config (`parseConfig`)

`parseConfig` is deliberately minimal. From `packages/viz-engine/src/modules/chart/index.ts`:

```ts
function parseConfig(raw, ctx) {
  if (!raw || typeof raw !== 'object')
    throw new Error(`${ctx.label}: chart layer must be an object`)
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || r.id.trim().length === 0)
    throw new Error(`${ctx.label}: chart layer requires 'id' (string)`)
  return { type: 'chart', id: r.id }
}
```

It returns exactly `{ type: 'chart', id }` — every other key on the YAML layer object is **dropped** by `parseConfig`.

| Option | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `type` | `'chart'` | — | yes | Module discriminator. Must be the literal string `chart`. Set automatically in the returned config regardless of input. |
| `id` | `string` | — | **yes** | The chart identifier. Must be a non-empty string (after `trim`). Resolved by `ChartPanel` (see "How `id` resolves" below). Throws `chart layer requires 'id' (string)` if missing/blank. |
| `style` | `VizLayerStyle` | none (module ships no `defaultStyle`) | no | **Not** read by `parseConfig` — it is read off the raw layer object by `ForegroundVizSlot` to position/size/chrome the wrapper box. See "Layer style & panel chrome". |

#### `caption` is parsed away (gotcha)

Real story configs frequently write a `caption:` on a chart layer, e.g.:

```yaml
- type: chart
  id: segment-revenue
  caption: "2025 segment P&L · revenue, operating income, Adj. EBITDA"
```

The `chart` module's `parseConfig` does **not** read `caption` (unlike `table`/`imageGrid`, which do). That YAML key is silently discarded and renders nothing on its own. The visible sub-chart caption you see in the live story is the chart JSON step's `title` field rendered by `GenericChart`, not the YAML `caption`. Treat a YAML `caption:` on a `chart` layer as documentation/authoring metadata only — to change the on-screen caption, edit the `title` inside the chart's JSON step (see "Chart JSON shape"). Verified against `apps/vizmaya-fyi/content/stories/spacex-ipo-2026.config.yaml` (the `caption:` line) and `apps/vizmaya-fyi/content/stories/spacex-ipo-2026/charts/segment-revenue.json` (the `steps[].title`).

### Module flags

| Module field | Value for `chart` | Effect |
| --- | --- | --- |
| `readinessProfile` | `'first-paint'` | Capture (PDF/share) waits for the chart's first paint rather than treating it as instant. `'instant'` and `'tiles-then-settle'` are the other allowed values (`packages/viz-engine/src/types.ts`). |
| `stableIdentity` | `(config) => `chart:${config.id}`` | Deterministic key. `ForegroundVizSlot` uses it as the React `key` so the same chart `id` keeps one ECharts instance alive across subsections/steps of a parent unit — series tween between `activeStep` values instead of remounting. Two layers with the same `id` would collide on this key. |
| `load` | `() => import('./Component')` | Lazy-loads the foreground component (`ChartLayerComponent`). |
| `mountingMode` | _unset_ → defaults to `'per-unit'` | The chart is a foreground module; `mountingMode`/`loadPersistent` apply only to background modules (`map`). Not relevant here. |
| `regionPreferences` | _unset_ | No region hints; the admin form/preview offers no preferred-region guidance for charts. |
| `adminForm` | _unset_ | The module exposes **no** `adminForm` fields. The admin UI gets nothing beyond the generic layer scaffolding — charts are authored by writing the `id` (and dropping the JSON under `<slug>/charts/`), not via per-field admin inputs. |
| `collectAssetKeys` | _unset_ | The chart references no uploaded media assets, so it contributes nothing to asset collection. Its data lives in the chart-data JSON, fetched by URL at runtime, not as a tracked asset key. |
| `introspect` | _unset_ | No introspection hook. |
| `defaultStyle` | _unset_ | No module-level default style/panel. The wrapper renders bare unless the layer's own `style.panel` (or a story-wide `defaults.panel`) supplies chrome. Contrast with the text modules, which ship a card frame via `defaultStyle.panel`. |

### How `id` resolves (`ChartPanel`)

`ChartLayerComponent` (`packages/viz-engine/src/modules/chart/Component.tsx`) mounts `<ChartPanel chartId={config.id} activeStep={activeStep} slug={slug} />` inside a `ChartCaptureProvider`. `ChartPanel` (`packages/viz-engine/src/charts/ChartPanel.tsx`) resolves the id in this order:

1. **`data:<id>`** (legacy explicit form) — strips the `data:` prefix and renders `GenericChart` for `<id>`, fetching `/api/chart-data/<slug>/<id>`. Requires `slug`; returns `null` (renders nothing) if no slug.
2. **Bespoke hardcoded id** — one of a fixed switch of hand-built chart components: `stock-candlestick`, `polar-exposure`, `hbm-treemap`, `lng-treemap`, `qatar-map`, `ddr5-area`, `korea-bar`, `helium-price`, `feedback-loop`, `dram-price`. These ignore `slug` and carry their own data/series in code.
3. **Bare id with a slug** (the default for the layered schema) — any other string is treated as a `GenericChart` data id and fetched from `/api/chart-data/<slug>/<id>`. A missing row renders `GenericChart`'s "Chart load failed: <status>" message rather than silently disappearing.
4. **Bare id with no slug** → `null`. (Only the legacy ScrollySection callsite mounts `ChartPanel` without a slug; the foreground layer path always passes the story `slug`, so this case does not arise from a `foreground:` layer.)

So in the layered schema you almost always write a bare `id` that matches a JSON filename under the story's `charts/` directory — e.g. `id: segment-revenue` → `<slug>/charts/segment-revenue.json` (served as `/api/chart-data/<slug>/segment-revenue`). The `data:` prefix is legacy and unnecessary for new stories.

### Chart JSON shape (`GenericChart`)

For data-driven charts, the JSON served at `/api/chart-data/<slug>/<id>` (backed by `CONTENT_SOURCE`; on disk it is `content/stories/<slug>/charts/<id>.json`) has this shape (`packages/viz-engine/src/charts/GenericChart.tsx`):

```jsonc
{
  "steps": [
    { "title": "optional caption string", "option": { /* EChartsOption */ } }
  ]
}
```

| JSON field | Type | Required | Description |
| --- | --- | --- | --- |
| `steps` | `ChartStep[]` | yes | One entry per step. `activeStep` (from the unit's active scroll step) selects `steps[activeStep]`, falling back to `steps[0]`. If empty, nothing renders. |
| `steps[].option` | `EChartsOption` | yes | The full ECharts option object. Color tokens (any string starting with `$`) are replaced with live theme colors before handing to ECharts. |
| `steps[].title` | `string` | no | Caption rendered beneath the chart in muted monospace (this is the real on-screen caption, not the YAML `caption`). |

Color-token resolution (`replaceColorTokens` in `GenericChart.tsx`): any string value of the form `"$<name>"` anywhere in the option is swapped for the live palette value. The palette is `{ ...cssVars, ...ChartColors }` — `ChartColors` keys win on collision. Recognized token names include `$accent`, `$accent2`, `$teal`, `$green`/`$positive`, `$amber`, `$red`, `$muted`, `$line`, `$surface`, `$bg`/`$background`, `$text`. Ingest-generated JSON should prefer `$`-tokens so retheming the story auto-reflows the chart. The palette source is `packages/viz-engine/src/lib/chartTheme.ts` (`useChartColors`, `themeToChartColors`, `defaultChartColors`).

`GenericChart` additionally:
- Forces `backgroundColor` to the story's theme bg (`--color-bg`) when available, else `'transparent'`. This sidesteps a Chromium print-to-PDF bug that drops transparent canvases.
- Merges a themed tooltip (`chartTooltip`) **under** whatever the JSON specifies (JSON wins on collision), except on mobile (`useIsMobile()`, portrait `max-aspect-ratio: 1/1`) where tooltips are forced `show: false`.
- Sets a `minHeight` of 280px (mobile) / 360px (desktop) on the chart, and renders the optional `title` caption below.

### Theme / capture host (`StoryEChart` + `chartCapture`)

Every foreground ECharts chart (both bespoke charts and `GenericChart`) renders through `StoryEChart` (`packages/viz-engine/src/charts/StoryEChart.tsx`), which centralizes capture-mode behavior:

- **Renderer**: live mode keeps the chart's authored renderer (`opts.renderer`), defaulting to `canvas`; capture mode (`mode` is `'print'`/`'capture'`) forces `canvas` (SVG does not survive Chromium print-to-PDF reliably).
- **Opaque bg in capture**: forces `backgroundColor` to the theme bg so the canvas isn't dropped by the PDF compositor.
- **Animation off in capture**: paints the final frame on the first `setOption`.
- **Readiness via the ECharts `finished` event**: `ChartLayerComponent` signals readiness a frame after mount for synchronous charts, but in capture mode `StoryEChart` "claims" the layer's readiness slot (`onClaim`) and only flips it once ECharts emits `finished` (`onPainted`) — preventing PDFs from snapshotting a chart mid entrance-animation. This coordination flows through `chartCapture.tsx`'s `ChartCaptureProvider`/`useChartCapture`.

Outside capture, the capture context defaults are no-ops, so charts animate and use a transparent background normally.

### Layer style & panel chrome

`style` is read off the raw layer object by `ForegroundVizSlot` (`packages/viz-engine/src/ForegroundVizSlot.tsx`), not by `parseConfig`. It controls the absolutely-positioned (or portrait-stacked) wrapper box the chart paints into. The shape is `VizLayerStyle` (`packages/viz-engine/src/types.ts`):

| `style` field | Type | Default | Description |
| --- | --- | --- | --- |
| `position.x` | `'left' \| 'center' \| 'right' \| string` | wrapper fills slot (`inset: 0`) when neither `position` nor `size` is set | Horizontal anchor. `center` translates -50%. A raw string is used as a CSS `left`. |
| `position.y` | `'top' \| 'center' \| 'bottom' \| string` | as above | Vertical anchor. `center` translates -50%. |
| `size.width` | `string` | auto | CSS width (e.g. `"50%"`). |
| `size.height` | `string` | auto | CSS height (e.g. `"62vh"`). Charts have no intrinsic block height, so give one when not filling the slot. |
| `opacity` | `number` | 1 | Wrapper opacity. |
| `blendMode` | `'normal' \| 'multiply' \| 'screen' \| 'overlay' \| 'soft-light' \| 'difference'` | normal | `mix-blend-mode`. |
| `pointerEvents` | `'auto' \| 'none'` | first layer (`index 0`) → `auto`, others → `none` (portrait-stack → `none`) | Hover/tooltip interactivity. Mobile charts get no tooltips, so portrait stack forces click-through. |
| `zIndex` | `number` | layer index | Stacking order within the slot. |
| `panel` | `VizLayerPanel` | none (no module `defaultStyle`) | Optional card chrome around the wrapper. Fields: `background`, `border`, `borderRadius`, `padding`, `backdropBlur` (→ `backdrop-filter: blur()`, plus `-webkit-` prefix), `shadow` (→ `box-shadow`). A story-wide `defaults.panel` is inherited unless overridden per-field. |
| `portrait` | `VizLayerStyle` | none | Per-slot overrides applied when `useIsMobile()` is true (portrait). Shallow-merged over the base style; e.g. `portrait: { size: { height: '38vh' } }` to tune stacked height, or `portrait: { opacity: 0 }` to drop the chart on mobile. A nested `portrait` is ignored. |

Portrait nuances:
- `chart` is in `STACK_VISUAL_TYPES`, so when a layout flagged `stackOnPortrait` restacks vertically on a phone, the chart wrapper gets a default height of `40vh` (override via `style.portrait.size.height`). Without that default it would collapse to zero height.
- In portrait stack mode the authored `position`/`%`-width are ignored — the chart becomes a full-width block in document flow.

### Story-wide chart defaults (`defaults.chart`) — declared, not yet wired

`StoryDefaults.chart` (`packages/viz-engine/src/lib/storyConfig.types.ts`) defines a `ChartDefaults` shape intended to forward story-wide theme/grid to every chart:

| `defaults.chart` field | Type | Default | Description |
| --- | --- | --- | --- |
| `theme` | `string` | none | Intended chart theme name. |
| `grid.left` / `grid.right` / `grid.top` / `grid.bottom` | `number \| string` | none | Intended default ECharts grid insets so per-chart JSON need not repeat them. |

Caveat: although the type comment says it is "forwarded to the chart module's render path," a repo-wide search finds **no consumer** of `defaults.chart` / `ChartDefaults` outside the type definition. The chart Component, `ChartPanel`, and `GenericChart` do not read it. Today, grid and per-chart theming come entirely from each chart's own JSON `option` (plus `$`-token resolution against the story palette). Treat `defaults.chart` as a reserved/advisory key with no current runtime effect.

### Complete YAML examples

Real foreground chart layer inside a `text-left-chart-right` deck layout, from `apps/vizmaya-fyi/content/stories/spacex-ipo-2026.config.yaml`:

```yaml
layout: text-left-chart-right
foreground:
  - type: bodyText
    from: text
    style:
      position: { x: left, y: center }
      size: { width: "44%" }
  - type: chart
    id: segment-revenue
    caption: "2025 segment P&L · revenue, operating income, Adj. EBITDA"  # authoring note only; not rendered
    style:
      position: { x: right, y: center }
      size: { width: "50%", height: "62vh" }
```

Minimal foreground stack (chart only, fills the slot):

```yaml
foreground:
  - type: chart
    id: starlink-subscribers
```

Chart with explicit panel chrome and a portrait height override:

```yaml
foreground:
  - type: chart
    id: valuation-trajectory
    style:
      position: { x: center, y: center }
      size: { width: "60%", height: "60vh" }
      panel:
        background: "color-mix(in oklch, var(--color-surface) 80%, transparent)"
        border: "1px solid var(--color-line)"
        borderRadius: "12px"
        padding: "16px"
        backdropBlur: "8px"
      portrait:
        size: { height: "42vh" }
```

Catalog sample fixture (`packages/viz-engine/src/modules/chart/sample.ts`) — note the catalog cannot serve chart-data JSON, so it shows a "preview unavailable" chip rather than a live chart:

```yaml
- type: chart
  id: catalog-demo-bars
```

Companion JSON for `id: segment-revenue` lives at `apps/vizmaya-fyi/content/stories/spacex-ipo-2026/charts/segment-revenue.json` and follows the `{ steps: [{ title, option }] }` shape above, using `$`-tokens (`$accent2`, `$muted`, `$line`, `$text`, …) for theme-reactive colors.

---

## Module: image

A static raster-image layer. It renders a single `<img>` that fills its slot box and fits the picture to that box via CSS `object-fit` / `object-position`. The module works in **both** the foreground and background slots — the surrounding `VizLayerFrame` decides the box size; the component only controls how the bitmap is fitted inside it.

Source: `packages/viz-engine/src/modules/image/index.ts`, `packages/viz-engine/src/modules/image/Component.tsx`, `packages/viz-engine/src/modules/image/sample.ts`.

### Identity

| Field | Value | Source |
| --- | --- | --- |
| `type` (the YAML `type:` discriminator) | `"image"` | `index.ts:50` |
| `label` (admin display name) | `"Image"` | `index.ts:51` |
| `slots` | `['foreground', 'background']` | `index.ts:52` |

Because `slots` lists both, an `image` layer is valid under either a section's `background:` array or its `foreground:` array (and, for foreground, inside any layout region whose `accepts` allowlist is empty or includes `image` — see `ForegroundLayoutRegion.accepts` in `packages/viz-engine/src/types.ts`).

### Config shape (`parseConfig`)

`parseConfig(raw, ctx)` (`index.ts:26-47`) validates the raw YAML object and returns a normalized `ImageLayerConfig`. The interface is declared at `index.ts:5-24`.

| Option | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `src` | `string` | — | **Yes** | The image reference. Accepts an `assets://<key>` ref (resolved to the Supabase public bucket), an absolute `https://…`/`http://…` URL, or a same-origin `/public` path (e.g. `/content/stories/<slug>/images/x.webp`). Must be a non-empty string after trim or `parseConfig` throws `… image layer requires 'src' (assets://… , https://… , or /public path)`. Resolution is done by `resolveAssetUrl` (`packages/viz-engine/src/lib/assetUrl.ts`). |
| `alt` | `string` | `undefined` → rendered as `""` | No | Alt text for the `<img>`. Any non-string value is coerced to `undefined`; the component then emits `alt=""` (decorative). |
| `fit` | `'cover' \| 'contain' \| 'fill' \| 'scale-down' \| 'none'` | `'cover'` | No | CSS `object-fit`. `'cover'` fills the slot edge-to-edge and crops overflow. Any value outside the five-member set throws `… image 'fit' must be one of cover \| contain \| fill \| scale-down \| none`. |
| `focus` | `string` | `undefined` → rendered as `'center'` | No | CSS `object-position`. Shifts the focal point, e.g. `'top'`, `'30% 50%'`. Non-string values become `undefined`. |
| `background` | `string` | `undefined` | No | CSS `background` shown behind the image while it loads and in the letterbox bars produced by `contain`/`scale-down`. Non-string values become `undefined`. NOTE: this is a distinct concept from the layer chrome `style.panel.background` — see "Background config vs panel chrome" below. |
| `priority` | `boolean` | `false` | No | Marks an above-the-fold / LCP image. When `true` the `<img>` loads `eager` with `fetchpriority="high"`; otherwise it lazy-loads. Parsed strictly: only the literal `true` yields `true` (`r.priority === true`). |
| `sizes` | `string` | `undefined` → rendered as `'100vw'` | No | The `sizes` attribute hint. Forward-compatible for future `srcset` variants; inert until srcset exists. Non-string values become `undefined`. |

The returned object always carries `type: 'image'`. There is **no** validation of `src` URL scheme beyond non-emptiness — a bad path just renders a broken image (readiness still fires via `onError`, see below).

#### Fields that are NOT parsed (silently dropped)

`parseConfig` only reads the seven keys above. Any other key on the layer object is discarded by the module. In particular, real story configs sometimes carry an authoring-only `caption:` on an image layer (e.g. `apps/vizmaya-fyi/content/stories/spacex-ipo-2026.config.yaml:314`) — **the image module does not parse or render `caption`**; it is an inert authoring note. Layer-frame concerns such as `style:` (position/size/opacity/blendMode/panel/portrait) are handled by the slot/`VizLayerFrame`, not by `parseConfig` (see `VizLayerStyle` in `packages/viz-engine/src/types.ts`), so they live alongside the config keys on the same layer object but are consumed elsewhere.

### Rendering behavior (`Component.tsx`)

The component (`packages/viz-engine/src/modules/image/Component.tsx`) renders one `<img>` with:

- `style`: `width:100%; height:100%; display:block; objectFit: config.fit ?? 'cover'; objectPosition: config.focus ?? 'center'; background: config.background` (`Component.tsx:61-68`).
- `loading`: `'eager'` when `mode` is `'capture'` or `'print'` **or** `config.priority` is set; otherwise `'lazy'` (`Component.tsx:74-75`). This forces eager loads during headless PDF/video capture so readiness never waits on an unscrolled lazy image.
- `fetchPriority`: `'high'` when `priority`, else `'auto'` (`Component.tsx:76`).
- `decoding="async"`, `sizes={config.sizes ?? '100vw'}`, `draggable={false}` (`Component.tsx:87-94`).

#### Readiness & capture

`readinessProfile: 'first-paint'` (`index.ts:55`). The component signals paintable pixels through `noteReady()`:

- On `onLoad` and, defensively, on `onError` — a missing/404 asset fires readiness so a capture render proceeds with a broken image rather than hanging (`Component.tsx:89-93`).
- On mount, if `img.complete` is already true (cached image whose `onLoad` fired before React attached handlers), `noteReady()` is called immediately (`Component.tsx:34-40`).

A capture handle is exposed via `captureRef`: its `freeze()` awaits `img.decode()` so headless PDF/share pipelines do not rasterize a half-decoded bitmap; a rejected decode (broken asset) is swallowed so capture never blocks (`Component.tsx:42-59`).

### Mounting / persistence

| Aspect | Value | Notes |
| --- | --- | --- |
| `mountingMode` | _unset_ → defaults to `'per-unit'` | The slot mounts one instance per unique `stableIdentity` and feeds the active unit's config; visibility toggles when the active unit doesn't reference it (`VizMountingMode` docs in `types.ts:144-157`). |
| `loadPersistent` | _unset_ | Not a persistent-aggregated module (that mode is for the map module). |
| `stableIdentity` | `image:${src}::${fit ?? 'cover'}::${focus ?? 'center'}::${background ?? ''}` | `index.ts:61-62`. Sections referencing the same `src` **with identical framing** share one mount so the browser keeps the decoded bitmap across scroll snaps. Framing (fit/focus/background) is part of identity on purpose: two cards showing the same `src` with different framing get **separate** `<img>` elements, each with its own `object-fit`. |
| `collectAssetKeys` | returns `[config.src]` only if `src` starts with `assets://`, else `[]` | `index.ts:63`. Only Supabase-bucket refs are reported for prefetch/manifest collection; plain URLs and `/public` paths contribute nothing. |
| `introspect` | _unset_ | No async introspection. |
| `regionPreferences` | _unset_ | No foreground-region hints; placement is gated solely by each layout region's `accepts` allowlist. |

### Default style (`defaultStyle`)

```ts
defaultStyle: { pointerEvents: 'none' }
```

`index.ts:68-70`. Images are **non-interactive by default** so scroll/wheel events pass through to the snap-scroll container — essential when an image fills a foreground region edge-to-edge, otherwise the user could not scroll past that section. The module ships **no panel chrome by default** (unlike the text module): no `panel`, no `background`, no `borderRadius`. An image therefore renders frameless unless the author adds a `style.panel`.

`defaultStyle` is merged shallowly **per-field** under the author's `style:` (`VizModule.defaultStyle` docs in `types.ts:175-182`). To make an image clickable, set `style.pointerEvents: 'auto'` on the layer (this overrides only `pointerEvents`, leaving other defaults intact).

#### Background config vs panel chrome

Two distinct "background" concepts apply to an image layer:

- `config.background` (a top-level config key) → CSS `background` of the `<img>` itself; visible during load and in letterbox gaps under `contain`/`scale-down`.
- `style.panel.background` (`VizLayerPanel` in `types.ts:65-78`) → the chrome painted around the layer's **wrapper box** by `VizLayerFrame`. The spacex hero (below) explicitly zeroes the panel (`background: transparent; border: none; borderRadius: 0`) to keep a full-bleed image frameless.

### Admin form (`adminForm`)

`adminForm()` (ignores its config arg) returns these fields (`index.ts:71-89`); field kinds map to `AdminFormField` in `types.ts:135-142`:

| Field key | Kind | Label | Notes |
| --- | --- | --- | --- |
| `src` | `asset` | Image source | `accept: ['image/*']`, **`required: true`**. |
| `alt` | `text` | Alt text | placeholder `Describe the image…`. |
| `priority` | `boolean` | Priority (hero / above the fold — eager + high fetchpriority) | — |
| `fit` | `select` | Fit | options: `cover` (Cover — fill, crop overflow), `contain` (Contain — fit inside, letterbox), `fill` (Fill — stretch), `scale-down` (Scale down), `none` (None — intrinsic size). |
| `focus` | `text` | Focus (CSS object-position) | placeholder `center / top / 30% 50%`. |
| `background` | `text` | Background color | placeholder `#000 or transparent`. |

`sizes` is **not** exposed in the admin form (it is forward-compatible only).

### YAML examples

#### Background fill (minimal)

From `apps/vizmaya-fyi/content/stories/_demo-viz-static.config.yaml:26-29`:

```yaml
background:
  - type: image
    src: "https://picsum.photos/seed/vizmaya-bg/1600/900"
    fit: cover
    focus: center
```

#### Composited background overlays (position / size / opacity / blend)

Multiple image layers stacked in the background, each framed by its `style:` block (consumed by the slot via `VizLayerStyle`, not by `parseConfig`). From `_demo-viz-static.config.yaml:52-77`:

```yaml
background:
  - type: image
    src: "https://picsum.photos/seed/viz-a/600/600"
    style:
      position: { x: left, y: bottom }
      size: { width: "240px", height: "240px" }
      opacity: 0.6
      pointerEvents: none
  - type: image
    src: "https://picsum.photos/seed/viz-c/400/400"
    style:
      position: { x: "60px", y: center }
      size: { width: "160px", height: "160px" }
      opacity: 0.85
      blendMode: multiply
      zIndex: 10
      pointerEvents: none
```

Note `pointerEvents: none` is set explicitly here even though it is already the module default — overlays must let scroll events through.

#### Full-bleed hero (priority LCP, frameless panel)

From `apps/vizmaya-fyi/content/stories/spacex-ipo-2026.config.yaml:100-111` — a same-origin `/public` path, `priority: true` for LCP, and a panel that is explicitly zeroed so the hero stays frameless:

```yaml
background:
  - type: image
    src: /content/stories/spacex-ipo-2026/images/01-hero-orbital.webp
    alt: "Falcon stage one re-entry plume over a Starlink constellation arc, deep dusk"
    priority: true              # hero / LCP — load eager with fetchpriority=high
    style:
      position: { x: center, y: center }
      size: { width: "100%", height: "100vh" }
      opacity: 1
      panel:
        background: "transparent"
        border: "none"
        borderRadius: "0"
```

#### Foreground image alongside a chart

From `spacex-ipo-2026.config.yaml:311-317` — an image slotted into the foreground, sized to part of the box. (The `caption:` key shown in the source is an authoring note and is **not** rendered by this module.)

```yaml
foreground:
  - type: image
    src: /content/stories/spacex-ipo-2026/images/02-colossus-data-center.webp
    alt: "Inside view of COLOSSUS — gigawatt-scale AI training cluster, Memphis"
    style:
      position: { x: right, y: center }
      size: { width: "50%", height: "62vh" }
```

#### Module sample

`packages/viz-engine/src/modules/image/sample.ts`:

```yaml
type: image
src: "https://images.unsplash.com/photo-1500964757637-c85e8a162699?auto=format&fit=crop&w=1200&q=70"
alt: "Sample landscape image"
fit: cover
```

### Portrait / style nuances

- The image module defines **no `portrait` override** of its own; portrait tuning is done per-layer via `style.portrait` (shallow-merged over the base `style` when `useIsMobile()` is true — `VizLayerStyle.portrait` in `types.ts:89-95`), e.g. dropping or resizing the image on mobile.
- Because the default is `pointerEvents: 'none'`, an edge-to-edge foreground image will not trap touch/scroll on portrait — but if you opt into `pointerEvents: 'auto'` for a clickable image filling the region, you reintroduce the scroll-trap risk on mobile.
- For `contain`/`scale-down` images, set `config.background` (or a `style.panel.background`) so the letterbox bars match the surface rather than showing through to whatever sits behind the slot.

---

## Module: embed

The `embed` module mounts an arbitrary cross-origin resource inside an `<iframe>` — a tweet, an Observable notebook, a YouTube clip, a Wikipedia page, an interactive third-party widget, etc. Because cross-origin iframes refuse to rasterize reliably into headless captures (PDF, share cards, video), the module is built around a **live-iframe ↔ static-poster swap**: live `scroll`/`autoplay` modes render the real iframe, while `capture`/`print` modes render a required `poster` image so the render pipelines always get a deterministic frame.

Source: `packages/viz-engine/src/modules/embed/index.ts`, `packages/viz-engine/src/modules/embed/Component.tsx`, `packages/viz-engine/src/modules/embed/sample.ts`.

> Note on "aura": the `embed` documented here is the generic iframe layer module. It is distinct from the deck format's page-level `aura` background (referenced in `apps/vizmaya-fyi/content/stories/spacex-ipo-2026.config.yaml` as `storyBackground: { type: aura }`), which is a different rendering layer, not this viz module.

### Module identity

| Property | Value | Source |
| --- | --- | --- |
| `type` | `'embed'` | `index.ts:56` |
| `label` | `'Embed (iframe)'` | `index.ts:57` |
| `slots` | `['foreground', 'background']` | `index.ts:58` |
| `readinessProfile` | `'first-paint'` | `index.ts:61` |
| `mountingMode` | _unset_ → defaults to `'per-unit'` | see `VizMountingMode`, `types.ts:157` |
| `defaultStyle` | _unset_ (no module default) | `index.ts` |
| `regionPreferences` | _unset_ | `index.ts` |
| `introspect` | _unset_ | `index.ts` |
| `loadPersistent` | _unset_ | `index.ts` |

The component is lazily loaded via `load: () => import('./Component')` (`index.ts:60`).

Because `slots` lists both `foreground` and `background`, an embed layer is valid in either a section's `foreground:` array or its `background:` array. In the background slot it uses the default `per-unit` mounting mode — the slot mounts one instance per unique `stableIdentity` and toggles visibility per active unit (`types.ts:144-157`), which is appropriate here since each embed config is self-contained (unlike `map`, which needs `persistent-aggregated`).

### Config shape (`EmbedLayerConfig`)

Defined in `index.ts:3-28` and produced by `parseConfig` (`index.ts:30-53`). The parser throws if `raw` is not an object, if `src` is missing/blank, or if `poster` is missing/blank. All other fields are optional and defaulted.

| Option | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `type` | `'embed'` | — | yes (discriminator) | Selects this module. In YAML this is the layer's `type:` key. `parseConfig` always emits `type: 'embed'`. |
| `src` | `string` | — | **yes** | Absolute URL of the embedded resource (tweet, notebook, YouTube, Wikipedia, …). Forwarded straight to the iframe's `src`. Parser rejects a non-string or whitespace-only value with `"<label>: embed layer requires 'src' (URL)"` (`index.ts:35-37`). |
| `poster` | `string` | — | **yes** | Static image shown in `capture`/`print` mode (cross-origin iframes don't rasterize into PDFs/share-card screenshots). Accepts the same reference shapes as `image.src`: `assets://<key>`, `https://…`/`http://…`, or a same-origin `/public` path (resolved by `resolveAssetUrl`, `lib/assetUrl.ts`). Parser rejects a missing/blank value with a message explaining why it is required (`index.ts:38-42`). |
| `aspect` | `string` | `'16 / 9'` | no | CSS `aspect-ratio` applied to the inner iframe (most embed sources ignore parent height, so the aspect keeps them framed). The literal string `'auto'` lets the iframe size itself — the component omits `aspectRatio` entirely in that case (`Component.tsx:104`). Any non-string value falls back to the `'16 / 9'` default (`index.ts:47`). |
| `sandbox` | `string` | `'allow-scripts'` | no | iframe `sandbox` attribute. The default `'allow-scripts'` is the minimal surface that still permits most read-only embeds. Authors who trust the source can opt into more (`allow-same-origin`, `allow-forms`, `allow-popups`, space-separated). Non-string → default (`index.ts:48`). |
| `allow` | `string` | `undefined` | no | iframe `allow` attribute (e.g. `camera`, `microphone`, `autoplay`, `fullscreen`). Empty by default; passed through verbatim when a string is given (`index.ts:49`, `Component.tsx:99`). **Not exposed in the admin form** — only settable by hand in YAML. |
| `referrerPolicy` | `string` | `undefined` | no | iframe `referrerpolicy` attribute. When unset the browser default applies (the source doc-comment mentions `'no-referrer-when-downgrade'` as the browser default, but the parser leaves it `undefined` unless a string is given — `index.ts:50`). Cast to `React.HTMLAttributeReferrerPolicy` on render (`Component.tsx:100`). **Not exposed in the admin form.** |
| `title` | `string` | `'Embedded content'` | no | Accessibility title. Used as the iframe `title` and as the poster `<img alt>` (the alt falls back to `''` if title is absent — `Component.tsx:70`). Non-string → default (`index.ts:51`). |

#### Parser defaulting summary

```ts
// packages/viz-engine/src/modules/embed/index.ts
return {
  type: 'embed',
  src: r.src,                                                  // required, validated
  poster: r.poster,                                            // required, validated
  aspect: typeof r.aspect === 'string' ? r.aspect : '16 / 9',
  sandbox: typeof r.sandbox === 'string' ? r.sandbox : 'allow-scripts',
  allow: typeof r.allow === 'string' ? r.allow : undefined,
  referrerPolicy: typeof r.referrerPolicy === 'string' ? r.referrerPolicy : undefined,
  title: typeof r.title === 'string' ? r.title : 'Embedded content',
}
```

### Admin form fields

`adminForm` (`index.ts:68-80`) returns five fields. Note `allow` and `referrerPolicy` are intentionally **omitted** from the form — they're advanced/trusted-source attributes you set directly in YAML.

| Field key | Kind | Label | Required | Notes |
| --- | --- | --- | --- | --- |
| `src` | `text` | `Embed URL` | yes | Placeholder `https://…`. |
| `poster` | `asset` | `Poster image (required for capture)` | yes | `accept: ['image/*']` — picks from the story asset bucket. |
| `aspect` | `text` | `Aspect ratio (CSS)` | no | Placeholder `16 / 9`. |
| `sandbox` | `text` | `iframe sandbox attribute` | no | Placeholder `allow-scripts`. |
| `title` | `text` | `Accessibility title` | no | — |

Field kinds correspond to the `AdminFormField` union in `types.ts:135-142`.

### Styling, chrome, and portrait

The embed module ships **no `defaultStyle`**. This is a deliberate contrast with the `image` module, which sets `defaultStyle: { pointerEvents: 'none' }` (`modules/image/index.ts:68-70`) so it never blocks scroll. An embed has no module default, so:

- **`pointerEvents` defaults to `'auto'`** (the browser default) — embeds are interactive by design, which is usually what you want (you can click into the tweet/notebook). If an edge-to-edge embed in a foreground region traps scroll/wheel events, set `style.pointerEvents: 'none'` on the layer to let scroll pass through (at the cost of in-iframe interaction).
- **No panel chrome by default.** Unlike the text-family modules, the embed wrapper has no card frame. Add one via the layer's `style.panel` (`VizLayerPanel`, `types.ts:65-78`): `background`, `border`, `borderRadius`, `padding`, `backdropBlur`, `shadow`. Every panel field is forwarded straight to CSS.

All other layer-level `style` options come from `VizLayerStyle` (`types.ts:80-96`) and apply to the embed like any other layer: `position` (`x`/`y` keywords or CSS), `size` (`width`/`height`), `opacity`, `blendMode`, `zIndex`, and a `portrait` block that shallow-merges over the base style when `useIsMobile()` is true.

Layout note from the component (`Component.tsx:14-17`): the embed container is always `width: 100%; height: 100%` and the slot's positioning wrapper decides the actual box; `config.aspect` is applied to the inner iframe only. In live mode the iframe sits in a centered flex container with `overflow: hidden` (`Component.tsx:83-92`). In capture/print mode the poster renders as a full-box `<img>` with `objectFit: 'cover'` (`Component.tsx:64-80`).

**Portrait nuance:** there is no embed-specific portrait behavior in the module — sizing/stacking is governed by the foreground layout's `stackOnPortrait` and any `style.portrait` overrides you set on the layer. Because the inner iframe carries a fixed `aspect` (default `16 / 9`), a narrow portrait viewport can letterbox the embed inside its region; use `aspect: 'auto'` or a `style.portrait.size` override to retune.

### Capture / readiness behavior

- **`readinessProfile: 'first-paint'`** (`index.ts:61`).
- **Mode swap** (`Component.tsx:28`): `showPoster = mode === 'capture' || mode === 'print'`. Live `scroll`/`autoplay` render the iframe; `capture`/`print` render the poster.
- **Readiness gating** (`Component.tsx:34-44`): in capture/print mode `noteReady()` fires once the poster image is decoded (`img.complete && img.naturalWidth > 0`, plus an `onLoad` handler). In live mode it waits for the iframe `load` event then a 500 ms settle beat before signalling ready.
- **`VizCaptureHandle.freeze`** (`Component.tsx:46-62`): defensively `await img.decode()` so the rasterizer sees a complete bitmap even though the poster swap already happened via the `mode` prop.

### Identity & asset collection

- **`stableIdentity`** (`index.ts:62`): `` `embed:${config.src}::${config.sandbox ?? ''}` `` — two embeds with the same URL and sandbox dedupe to one persistent instance in the background slot.
- **`collectAssetKeys`** (`index.ts:63-67`): returns the `poster` key **only when it starts with `assets://`** (so the Supabase bucket asset is bundled/validated). The `src` URL is never collected — it's always an external resource, not a story asset.

### Complete YAML examples

#### Foreground embed over a map background (real story config)

From `apps/vizmaya-fyi/content/stories/_demo-viz-static.config.yaml` (section 4, `embed-fg`) — an interactive iframe in the foreground card with a map behind it:

```yaml
- id: embed-fg
  text: "Embed in the foreground"
  background:
    - type: map
      center: [-95, 40]
      zoom: 3
  foreground:
    - type: embed
      src: "https://en.wikipedia.org/wiki/Data_visualization"
      poster: "https://picsum.photos/seed/vizmaya-embed/1200/675"
      aspect: "16 / 9"
      sandbox: "allow-scripts allow-same-origin"
```

#### Module sample (every common field, asset poster)

Adapted from `packages/viz-engine/src/modules/embed/sample.ts`, here using an `assets://` poster (so it is collected by `collectAssetKeys`) plus a panel frame and a portrait height override:

```yaml
foreground:
  - type: embed
    src: "https://en.wikipedia.org/wiki/Special:RandomInCategory/Visualization"
    poster: "assets://my-story/embed-poster.jpg"   # collected as a bucket asset
    aspect: "16 / 9"
    sandbox: "allow-scripts allow-same-origin"
    allow: "fullscreen; clipboard-write"            # advanced — YAML only, no admin field
    referrerPolicy: "no-referrer"                   # advanced — YAML only, no admin field
    title: "Embedded webpage"
    style:
      size: { width: "100%", height: "60vh" }
      panel:
        border: "1px solid var(--border)"
        borderRadius: "12px"
        shadow: "0 10px 30px rgba(0,0,0,0.25)"
      portrait:
        size: { height: "42vh" }
```

#### Self-sizing embed in the background slot

```yaml
background:
  - type: embed
    src: "https://example.com/widget"
    poster: "https://example.com/widget-poster.png"
    aspect: auto                # iframe sizes itself; aspectRatio omitted
    sandbox: "allow-scripts"
    style:
      pointerEvents: none       # opt out so scroll passes through the backdrop
```

---

## Module: video

The `video` module renders a native HTML `<video>` element as a full-bleed layer. It is the dominant editorial vehicle for ambient/looping motion (silent muted loops) and supports optional scroll-driven seeking, plus a deterministic `freeze()` frame for capture/print/share pipelines.

Source: `packages/viz-engine/src/modules/video/index.ts`, `packages/viz-engine/src/modules/video/Component.tsx`, `packages/viz-engine/src/modules/video/sample.ts`.

### Registration

| Field | Value | Source |
| --- | --- | --- |
| `type` | `"video"` | `index.ts` `videoModule.type` |
| `label` | `"Video"` | `index.ts` `videoModule.label` |
| `slots` | `['foreground', 'background']` | `index.ts` `videoModule.slots` |
| `readinessProfile` | `'first-paint'` | `index.ts` — the slot waits until the first frame paints (`<video onLoadedData>` calls `noteReady()`) before counting the layer ready. |
| `mountingMode` | _unset_ → defaults to `'per-unit'` | Not declared on the module. Per `packages/viz-engine/src/types.ts`, an unset `mountingMode` resolves to `'per-unit'`: in a background slot the engine mounts one instance per unique `stableIdentity` and toggles visibility for units that don't reference it. Video is explicitly called out in the types doc-comment as a lightweight per-unit case. |
| `loadPersistent` | _unset_ | No persistent variant (none needed for `per-unit`). |
| `defaultStyle` | _unset_ | The module ships no `defaultStyle`, so there is **no panel chrome by default** (unlike the text module). The wrapper is a transparent full-bleed `<div>`; any framing must be supplied via the layer's `style.panel`. |
| `regionPreferences` | _unset_ | No region hints — the module fits any foreground region whose `accepts` allowlist permits `video` (or any region with no allowlist). |
| `introspect` | _unset_ | Not implemented. |
| `load` | `() => import('./Component')` | Lazily loads the React renderer. |

### Identity & assets

#### `stableIdentity`

```ts
stableIdentity: (config) => `video:${config.src}`
```

Identity is derived **only from `src`** — style is intentionally stripped. The doc-comment in `index.ts` explains the consequence: two cards referencing the same `src` reuse a single `<video>` element, so the browser keeps the buffered byte ranges across scroll snaps and never re-downloads the same MP4. If you want two genuinely independent video instances (separate playback state), they must have distinct `src` values.

#### `collectAssetKeys`

```ts
collectAssetKeys: (config) => {
  const keys = []
  if (config.src.startsWith('assets://')) keys.push(config.src)
  if (config.poster?.startsWith('assets://')) keys.push(config.poster)
  return keys
}
```

Both `src` and `poster` participate in asset collection, but **only when they use the `assets://` scheme**. Absolute URLs and same-origin `/public` paths are passed through unchanged and are not collected. At render time both are resolved through `resolveAssetUrl()` (`packages/viz-engine/src/lib/assetUrl.ts`), so `assets://<key>`, an absolute URL, or a `/public` path all work as `src`/`poster`.

### Config shape (`parseConfig`)

`parseConfig(raw, ctx)` validates and normalizes the YAML object. It throws when `raw` is not an object (`"<label>: video layer must be an object"`). The TypeScript shape is `VideoLayerConfig` in `index.ts`.

| Option | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `type` | `"video"` | — | yes | Module discriminator. Always emitted as `'video'` by `parseConfig`. |
| `src` | `string` | — | **yes** | The video source. Accepts `assets://<key>`, an absolute URL, or a same-origin `/public` path. Must be a non-empty string or `parseConfig` throws `"<label>: video layer requires 'src' (URL or assets://… key)"`. |
| `poster` | `string` | `undefined` | no | Static image shown until the video decodes its first frame. Forwarded to the `<video poster>` attribute (resolved via `resolveAssetUrl`). Non-string values are coerced to `undefined`. |
| `loop` | `boolean` | `true` | no | Whether the video loops. Normalized as `r.loop !== false`, so **anything other than an explicit `false` becomes `true`** — to disable looping you must set `loop: false`. |
| `muted` | `boolean` | `true` | no | Whether audio is muted. Normalized as `r.muted !== false` (defaults to `true`). The doc-comment notes the default is muted because browsers refuse autoplay with sound and silent ambient loops are the common editorial case. Set `muted: false` to allow sound (which generally disables autoplay in browsers). |
| `autoplay` | `boolean` | `true` | no | Whether the video autoplays in live modes. Normalized as `r.autoplay !== false` (defaults to `true`). Note: autoplay is only honored in `scroll`/`autoplay` render modes — see [Modes & playback](#modes--playback). |
| `fit` | `'cover' \| 'contain' \| 'fill' \| 'scale-down' \| 'none'` | `'cover'` | no | CSS `object-fit` for the `<video>`. Validated against the enum; an out-of-range value throws `"<label>: video 'fit' must be one of cover \| contain \| fill \| scale-down \| none"`. |
| `focus` | `string` | `undefined` (renders as `'center'`) | no | CSS `object-position` for the `<video>` (e.g. `"50% 20%"`, `"top"`). When omitted, the component applies `'center'`. Non-string values coerce to `undefined`. |
| `background` | `string` | `undefined` | no | CSS `background` shorthand on the wrapper `<div>`, shown while loading and in the letterbox bars when `fit: contain`. Non-string values coerce to `undefined`. |
| `posterTime` | `number` (seconds) | `0` | no | The timestamp `freeze()` seeks to when the capture/PDF/share/video pipelines pause the video, so the snapshotted frame is deterministic. Non-number values coerce to the default `0`. |
| `stepSync` | `VideoStepSync` (object) | `undefined` | no | Optional scroll-driven seek mapping. See [stepSync](#stepsync-scroll-driven-seeking). Must be an object or `parseConfig` throws `"<label>: video.stepSync must be an object"`. |

> Coercion caveat: `loop`, `muted`, and `autoplay` use `!== false` rather than a truthiness check. Any non-boolean value (e.g. a string, a number, or even `null`) that isn't literally `false` will be treated as `true`. The only way to turn these off is the explicit value `false`.

#### `stepSync` (scroll-driven seeking)

`stepSync` maps the layer's `activeStep` onto the video's `currentTime`. Shape — `VideoStepSync` in `index.ts`:

| Field | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `mode` | `'stepwise'` | — | **yes** | The only mode shipped (Phase 4). `'scrubbed'` (linear interpolation across the timestamp range) is described in the doc-comment but reserved for Phase 4.5 and **not yet accepted** — any value other than `'stepwise'` throws `"<label>: video.stepSync.mode must be 'stepwise' (only mode shipped in Phase 4)"`. |
| `stepTimestamps` | `number[]` (seconds) | — | **yes** | One timestamp per step. On each step change the component jumps `currentTime` to `stepTimestamps[activeStep]`. Must be an array of numbers or `parseConfig` throws `"<label>: video.stepSync.stepTimestamps must be an array of numbers (seconds)"`. |

Seek behavior (`Component.tsx`): the active index is clamped to `[0, stepTimestamps.length - 1]`, so steps beyond the array length hold on the last timestamp and negative steps hold on the first. A seek only fires when the target differs from the current time by more than `0.05s` (avoids churn). The seek effect is independent of the play/pause cycle, so scroll-driven seeks land correctly even on a paused video.

### Capture / freeze behavior

`Component.tsx` implements a `VizCaptureHandle` via `useImperativeHandle(captureRef, …)` with two methods:

- `freeze()` — pauses the `<video>`, seeks to `config.posterTime` (when set), then awaits the next composited frame. It awaits `requestVideoFrameCallback` when available, falling back to a 50ms `setTimeout` for browsers/Safari versions without it (`awaitVideoFrame`). The doc-comment warns that a paused `<video>` can rasterize black in headless chromium until a frame is decoded, so **PDF/share pipelines should `await captureRef.current.freeze()` before snapshotting**.
- `resume()` — calls `video.play()` again, but only if `wantsAutoplay` is true (best-effort, swallows play rejections).

### Modes & playback

The renderer receives `mode: 'scroll' | 'autoplay' | 'capture' | 'print'` (`VizRenderProps`). From `Component.tsx`:

```ts
const liveMode = mode === 'scroll' || mode === 'autoplay'
const wantsAutoplay = liveMode && (config.autoplay ?? true)
```

- Autoplay is honored only in `scroll` and `autoplay` modes. In `capture`/`print` the video starts **paused** — the headless pipelines pause on `freeze()` and the component deliberately avoids a first-frame flash.
- The `<video>` is always rendered with `playsInline` and `preload="auto"` (so the first frame decodes before the section scrolls into view, keeping the `noteReady()` readiness signal honest).
- `noteReady()` fires from the `<video onLoadedData>` handler.

### Styling & wrapper

`Component.tsx` renders a wrapper `<div>` containing the `<video>`:

- Wrapper `<div>`: `width/height: 100%`, `display: block`, `background: config.background` (undefined → transparent).
- `<video>`: `width/height: 100%`, `display: block`, `objectFit: config.fit ?? 'cover'`, `objectPosition: config.focus ?? 'center'`.

The module has **no `defaultStyle`**, so any layer-level framing (panel chrome, opacity, blend mode, sizing, position, z-index, portrait overrides) comes entirely from the shared `style:` block on the `VizLayer` (`VizLayerStyle` / `VizLayerPanel` in `packages/viz-engine/src/types.ts`). For example, to give a foreground video a rounded card frame or to drop it on portrait you set `style.panel` / `style.portrait` on the layer — the video module itself contributes nothing.

#### Portrait nuances

Video has no module-level portrait handling; portrait behavior is whatever the enclosing foreground layout and the layer's own `style.portrait` provide. Because `fit` defaults to `'cover'`, a landscape-shot MP4 dropped into a tall portrait region will be center-cropped — set `focus` (object-position) to bias the crop, switch to `fit: 'contain'` plus a `background` color to letterbox instead, or add a `style.portrait` override (e.g. a different `size.height`).

### Admin form

`adminForm()` exposes these fields (`AdminFormField` in `packages/viz-engine/src/types.ts`). It ignores its `config` argument (static field list):

| Field key | Kind | Label | Notes |
| --- | --- | --- | --- |
| `src` | `asset` | "Video source" | `accept: ['video/mp4', 'video/webm']`, `required: true`. |
| `poster` | `asset` | "Poster image" | `accept: ['image/*']`. Optional. |
| `loop` | `boolean` | "Loop" | |
| `muted` | `boolean` | "Muted" | |
| `autoplay` | `boolean` | "Autoplay" | |
| `fit` | `select` | "Fit" | Options: Cover / Contain / Fill / Scale down / None. |
| `posterTime` | `number` | "Capture freeze time (seconds)" | `min: 0`, `step: 0.1`. |

Note the admin form does **not** surface `focus`, `background`, or `stepSync` — those are YAML/config-only options.

### YAML examples

#### Minimal (from `sample.ts`)

The module sample (`packages/viz-engine/src/modules/video/sample.ts`) is the canonical minimal case — a looping, muted, autoplaying cover-fit video:

```yaml
- type: video
  src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
  loop: true
  muted: true
  autoplay: true
  fit: cover
```

#### Foreground over a live map (real story config)

From `apps/vizmaya-fyi/content/stories/_demo-viz-static.config.yaml` (the `video-fg` section) — a foreground video layered over a continuing map background, with a poster and a `posterTime` so capture/print freezes on a representative frame:

```yaml
- id: video-fg
  text: "Video in the foreground"
  background:
    - type: map
      center: [120, 22]
      zoom: 3
  foreground:
    - type: video
      src: "https://media.w3.org/2010/05/sintel/trailer.mp4"
      poster: "https://picsum.photos/seed/viz-video-poster/1200/675"
      loop: true
      muted: true
      autoplay: true
      posterTime: 1.5
```

#### Full-bleed background with framing and scroll-driven seek

A composed example exercising the niche options — `assets://` source, `contain` fit with a letterbox `background`, `focus`, a `style.panel` frame, a `style.portrait` override, and `stepSync` to seek the video on each scroll step:

```yaml
background:
  - type: video
    src: "assets://hero-loop.mp4"
    poster: "assets://hero-loop-poster.jpg"
    loop: false
    muted: true
    autoplay: true
    fit: contain
    focus: "50% 20%"
    background: "#0b0d12"
    posterTime: 2.0
    stepSync:
      mode: stepwise
      stepTimestamps: [0, 3.5, 7.0, 11.25]
    style:
      opacity: 0.9
      panel:
        borderRadius: "12px"
      portrait:
        size: { height: "48vh" }
```

---

## Module: rive

The `rive` viz module mounts a [Rive](https://rive.app/) state-machine animation as a story layer. It wraps `@rive-app/react-canvas` (`useRive`, the `useStateMachineInput` hook, and the `useViewModelInstance*` family) so authors can drop a `.riv` file into a foreground or background slot, recolor it through view-model bindings, and drive a state-machine input from the active scroll step. It also implements a capture-freeze handle so the animation lands deterministically in PDF / share / video exports.

Source: `packages/viz-engine/src/modules/rive/index.ts` (module definition + `parseConfig`), `packages/viz-engine/src/modules/rive/Component.tsx` (renderer), `packages/viz-engine/src/modules/rive/sample.ts` (catalog sample).

### Module registration

Defined in `packages/viz-engine/src/modules/rive/index.ts` as the default export `riveModule`:

| Property | Value | Notes |
| --- | --- | --- |
| `type` | `'rive'` | The string used as `type: rive` in YAML layers. |
| `label` | `'Rive'` | Human label shown in the admin form / catalog. |
| `slots` | `['foreground', 'background']` | May be placed in either the foreground or background slot of a section. |
| `load` | `() => import('./Component')` | Lazy-loads `RiveLayerComponent`. |
| `readinessProfile` | `'first-paint'` | The readiness coordinator treats the layer ready as soon as Rive fires `onLoad` (`noteReady()` in `Component.tsx`). Valid profile values per `VizModule` in `packages/viz-engine/src/types.ts` are `'instant' | 'first-paint' | 'tiles-then-settle'`; rive uses `'first-paint'`. |
| `mountingMode` | _unset_ → defaults to `'per-unit'` | Not declared, so the background slot mounts one instance per unique `stableIdentity` and feeds the active unit's config. There is **no** `loadPersistent` variant. |
| `defaultStyle` | _unset_ | No module-level default `VizLayer.style`. In particular there is **no default panel/card chrome** — a rive layer paints edge-to-edge inside its wrapper unless the author sets `style.panel`. |
| `regionPreferences` | _unset_ | No region hints; placement is gated only by the layout's per-region `accepts` allowlist. |
| `introspect` | _unset_ | The Phase-7b Rive introspector is not wired yet (see the `adminForm` comment in `index.ts`). |
| `stableIdentity` | see below | |
| `collectAssetKeys` | see below | |
| `parseConfig` / `adminForm` | see below | |

#### `stableIdentity`

```
rive:${config.src}::${config.artboard ?? ''}::${config.stateMachine ?? ''}
```

Two rive layers dedupe to the same persistent instance only when their `src`, `artboard`, and `stateMachine` all match (`packages/viz-engine/src/modules/rive/index.ts`). Note that `viewModel`, `stepInput`, `layout`, and `capture` are **not** part of the identity — they are treated as per-unit config.

#### `collectAssetKeys`

Returns the `assets://…` bucket keys this layer references so the asset packer can collect them (`packages/viz-engine/src/modules/rive/index.ts`):

- `config.src` — included only if it starts with `assets://`.
- `config.posterImage` — included only if it starts with `assets://`.

Plain `/public` paths (e.g. `/vizmaya-logo.riv`) and absolute `http(s)://` URLs are **not** collected — they resolve at runtime via `resolveAssetUrl` (`packages/viz-engine/src/lib/assetUrl.ts`) and don't live in the `story-assets` bucket.

### Config shape (`parseConfig`)

`parseConfig(raw, ctx)` validates the layer object and returns a `RiveLayerConfig`. It throws `"<label>: rive layer must be an object"` if `raw` is not an object. Every field it reads:

| Option | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `type` | `'rive'` | — | yes (selects the module) | Discriminator. The returned config always has `type: 'rive'`. |
| `src` | `string` | — | **yes** | The `.riv` source: an `assets://<key>` bucket ref, an absolute `http(s)://` URL, or a same-origin `/public` path (e.g. `/vizmaya-logo.riv`). Resolved by `resolveAssetUrl`. Throws `"<label>: rive layer requires 'src' (.riv URL or assets:// key)"` if missing or blank. |
| `artboard` | `string` | `undefined` (Rive default artboard) | no | Named artboard inside the `.riv`. Non-string values are dropped to `undefined`. |
| `stateMachine` | `string` | `undefined` (no state machine) | no | Named state machine to run. Required if you use `stepInput` or `capture.mode: stateMachineInput` (the input hooks key off this name). Non-string values are dropped to `undefined`. |
| `layout` | `{ fit?, alignment? }` | `undefined` → `{ fit: 'contain', alignment: 'center' }` at render | no | Rive layout box. Throws `"<label>: rive.layout must be an object"` if not an object. See the layout sub-table. |
| `autoplay` | `boolean` | `true` | no | Whether the animation plays on mount. Parsed as `r.autoplay !== false`, so any value other than literal `false` (including omission) yields `true`. **Always forced off in capture/print mode** regardless of this value. |
| `posterImage` | `string` | `undefined` | no | Fallback still image. Used while the `.riv` loads and, in capture/print, rendered instead of the canvas when `capture.mode === 'posterImage'`. Same ref scheme as `src`. Non-string values dropped. |
| `viewModel` | `{ instance?, bindings? }` | `undefined` | no | Static view-model bindings applied once on mount. Throws if not an object; throws `"<label>: rive.viewModel.bindings must be a map"` if `bindings` is present but not an object. See the view-model sub-table. |
| `stepInput` | `RiveStepInputConfig` | `undefined` | no | Drives a state-machine input from the active scroll step. Validated strictly — see the step-input sub-table. |
| `background` | `string` | `undefined` | no | CSS `background` applied to the layer wrapper (shown while the `.riv` loads / behind a transparent artboard). Non-string values dropped. Forwarded to `wrapperStyle.background` in `Component.tsx`. Distinct from a section `background:` slot — this is the layer's own backdrop color. |
| `capture` | `RiveCaptureConfig` | `undefined` → `{ mode: 'currentFrame' }` at capture | no | Freeze strategy for PDF / share / video captures. Throws on an invalid `mode`. See the capture sub-table. |

#### `layout` sub-fields

`layout: { fit?, alignment? }` (`RiveLayoutFit` / `RiveLayoutAlignment` in `index.ts`; mapped to Rive enums in `Component.tsx`).

| Sub-option | Type | Default | Description |
| --- | --- | --- | --- |
| `layout.fit` | `'cover' \| 'contain' \| 'fill' \| 'fitWidth' \| 'fitHeight' \| 'scaleDown' \| 'none'` | `'contain'` | Maps to `Fit.*`. Applied via `new Layout({ fit })`. |
| `layout.alignment` | `'center' \| 'topLeft' \| 'topCenter' \| 'topRight' \| 'centerLeft' \| 'centerRight' \| 'bottomLeft' \| 'bottomCenter' \| 'bottomRight'` | `'center'` | Maps to `Alignment.*`. |

Note: `parseConfig` does **not** validate the individual `fit`/`alignment` strings — it only checks that `layout` is an object. An unknown value falls through `FIT_MAP`/`ALIGN_MAP` to `undefined` at render. Stick to the documented enums.

#### `viewModel` sub-fields

`viewModel: { instance?, bindings? }` (`index.ts`; consumed by `ViewModelBindingsHost` / `ViewModelBindings` in `Component.tsx`).

| Sub-option | Type | Default | Description |
| --- | --- | --- | --- |
| `viewModel.instance` | `string` | `undefined` | Parsed and stored, but **note**: `Component.tsx` resolves the view model with `useViewModel(rive, { useDefault: true })` and `useViewModelInstance(viewModel, { rive })` — it uses the `.riv`'s default view model and instance. The `instance` name is currently captured in config but not used to pick a named instance. |
| `viewModel.bindings` | `Record<string, RiveBindingValue>` | `undefined` | Map of view-model property path → value. The binding host only mounts when at least one binding is present (avoids the Rive "Could not find a View Model linked to Artboard" warning on stories that don't use view models). |

**Binding value typing** (`pickBindingKind` in `Component.tsx`) — the node type is inferred from the YAML value:

| `RiveBindingValue` | Inferred kind | Hook used | Behavior |
| --- | --- | --- | --- |
| `number` | `number` | `useViewModelInstanceNumber` | `target.setValue(value)`. |
| `boolean` | `boolean` | `useViewModelInstanceBoolean` | `target.setValue(value)`. |
| `string` starting with `#` **or** matching `/^[0-9a-f]{6}$/i` | `color` | `useViewModelInstanceColor` | Parsed by `parseHex` (3- or 6-digit hex), applied as `setRgba(r, g, b, 255)` — always fully opaque; alpha cannot be expressed. Invalid hex is silently skipped. |
| any other `string` | `string` | `useViewModelInstanceString` | `target.setValue(value)`. |

The header docstring also mentions a theme-token form (`"$accent"`) resolved via `lib/theme.ts`, but **in the layer module `pickBindingKind` does not special-case `$…` tokens** — a `$`-prefixed string is treated as a plain string binding. Theme-token resolution to hex happens upstream for the persistent chrome logo (`logoPalette`, below), not inside `parseConfig`/`Component.tsx`. Pass literal hex in layer `viewModel.bindings`.

Bindings are rendered as sorted sub-components (one hook per binding, key-sorted via `localeCompare`) to keep the rules-of-hooks contract honest across re-renders.

#### `stepInput` sub-fields

`stepInput: RiveStepInputConfig` — drives one named state-machine input from `activeStep` (`index.ts` parse + `StepInputDriver` in `Component.tsx`). Validated strictly by `parseConfig`.

| Sub-option | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `stepInput.name` | `string` | — | **yes** | State-machine input name; must match the `.riv` exactly. Throws `"<label>: rive.stepInput.name required"` if missing. The input is read via `useStateMachineInput(rive, stateMachine, name)`, so a `stateMachine` must be set for it to resolve. |
| `stepInput.type` | `'number' \| 'boolean' \| 'trigger'` | — | **yes** | Input data type. Throws if not one of the three. |
| `stepInput.map` | `'linear' \| 'stepwise' \| 'trigger'` | — | **yes** | How the value is derived from `activeStep`. Throws if not one of the three. `linear`: `activeStep / Math.max(1, totalSteps - 1)` → 0..1 (number inputs only). `stepwise`: reads `values[activeStep]` (clamped to the array bounds). `trigger`: fires the trigger on each step change. |
| `stepInput.totalSteps` | `number` | — | **yes when `map === 'linear'`** | Total step count for the linear normalization. Throws `"<label>: rive.stepInput.totalSteps required when map === 'linear'"` if `map` is `linear` and this is not a number. |
| `stepInput.values` | `Array<number \| boolean>` | — | **yes when `map === 'stepwise'`** | Per-step values. Throws `"<label>: rive.stepInput.values required when map === 'stepwise'"` if `map` is `stepwise` and this is not an array. The driver clamps the index to the array bounds. |

#### `capture` sub-fields

`capture: RiveCaptureConfig` — freeze strategy for PDF / share / video exports (`index.ts` parse + the `freeze` handler in `useImperativeHandle` in `Component.tsx`). Defaults to `{ mode: 'currentFrame' }` when omitted.

| Sub-option | Type | Default | Description |
| --- | --- | --- | --- |
| `capture.mode` | `'currentFrame' \| 'stateMachineInput' \| 'advanceMs' \| 'posterImage'` | `'currentFrame'` | Required if `capture` is present; throws `"<label>: rive.capture.mode must be currentFrame \| stateMachineInput \| advanceMs \| posterImage"` otherwise. `currentFrame`: pause + one `requestAnimationFrame` settle (deterministic only if autoplay is off or the `.riv` idled). `stateMachineInput`: write the configured input then pause. `advanceMs`: play for N ms from start, then pause. `posterImage`: skip Rive, render `posterImage` (fastest; requires a `posterImage`). |
| `capture.advanceMs` | `number` | `500` (fallback in `freeze`) | Only used when `mode === 'advanceMs'`. Milliseconds to play before pausing. |
| `capture.stateMachineInput` | `{ name: string; type: 'number' \| 'boolean' \| 'trigger'; value?: number \| boolean }` | `undefined` | Only used when `mode === 'stateMachineInput'`. Looks up the input by `name` on `config.stateMachine`; for `trigger` calls `fire()`, otherwise sets `value` (when defined). No-op if `config.stateMachine` is unset. |

Capture/print behavior in `Component.tsx`: when `mode === 'capture'` or `mode === 'print'`, autoplay is forced off (`wantsAutoplay = !isCapture && (config.autoplay ?? true)`). If `capture.mode === 'posterImage'` and a poster URL resolves, the component renders an `<img>` (object-fit: cover) instead of the canvas — the Rive instance still loads in the background but nothing paints from it. The `resume()` capture handle replays only when `wantsAutoplay` is true.

### adminForm fields

`adminForm()` returns these fields (`packages/viz-engine/src/modules/rive/index.ts`). Per the inline comment, `viewModel.bindings` and `stepInput` ship as raw JSON kinds until the Phase-7b Rive introspector graduates them to enumerated dropdowns populated from the actual `.riv` artboards/state machines.

| Field key | Kind | Label | Notes |
| --- | --- | --- | --- |
| `src` | `asset` | `.riv file` | `accept: ['application/octet-stream', '.riv']`, `required: true`. |
| `artboard` | `text` | `Artboard` | placeholder `(default)`. |
| `stateMachine` | `text` | `State machine` | placeholder `(none — autoplay only)`. |
| `posterImage` | `asset` | `Poster image (fallback)` | `accept: ['image/*']`. |
| `autoplay` | `boolean` | `Autoplay` | |
| `viewModel` | `json` | `View model bindings (JSON)` | placeholder `{"instance":"default","bindings":{}}`. |
| `stepInput` | `json` | `Scroll → input mapping (JSON)` | |
| `capture` | `json` | `Capture freeze (JSON)` | |

Note: `layout` and `background` are **not** exposed in the admin form — they are YAML-only authoring fields.

### Realistic YAML examples

#### Foreground layer with view-model recolor (from a real story)

The only `rive` layer in the live story configs is in `apps/vizmaya-fyi/content/stories/_demo-viz-static.config.yaml` (the "rive-fg" section). It reuses the public `/vizmaya-logo.riv` (`apps/vizmaya-fyi/public/vizmaya-logo.riv`) with its known color bindings, hex-coded inline:

```yaml
foreground:
  - type: rive
    src: "/vizmaya-logo.riv"
    autoplay: true
    layout:
      fit: contain
      alignment: center
    viewModel:
      bindings:
        textColor:    "#f1ecdf"
        tealColor:    "#7faecf"
        accentColor:  "#d8804a"
        accent2Color: "#7faecf"
        surfaceColor: "#1d2026"
        mutedColor:   "#8a8e96"
        lineColor:    "#2c303a"
    capture:
      mode: currentFrame
```

#### Catalog sample (minimal)

From `packages/viz-engine/src/modules/rive/sample.ts` — the official public "vehicles" demo, the smallest valid config:

```yaml
- type: rive
  src: "https://cdn.rive.app/animations/vehicles.riv"
  autoplay: true
```

#### Background layer with a scroll-driven state machine

Illustrating `stepInput` + `capture.mode: advanceMs` (synthesised from the documented fields; place in a section's `background:` slot):

```yaml
background:
  - type: rive
    src: "assets://my-story/orbit-bg.riv"
    artboard: "Orbit"
    stateMachine: "Scroll"
    autoplay: true
    background: "#0b0d12"        # backdrop while the .riv loads
    layout:
      fit: cover
      alignment: center
    stepInput:
      name: "progress"
      type: number
      map: linear
      totalSteps: 5              # required for map: linear
    capture:
      mode: advanceMs
      advanceMs: 800
    posterImage: "assets://my-story/orbit-poster.webp"
    style:
      opacity: 0.6
      portrait:
        opacity: 0.4             # generic VizLayerStyle portrait override
```

A `stepwise` variant maps each step to an explicit value instead:

```yaml
stepInput:
  name: "phase"
  type: number
  map: stepwise
  values: [0, 0.5, 1]           # required for map: stepwise; one per step
```

### Portrait / style nuances

- The module ships **no** `defaultStyle`, so it inherits none of the text module's card chrome. Per-slot styling (`style.position`, `style.size`, `style.opacity`, `style.panel`, `style.portrait`, …) comes from the generic `VizLayerStyle` in `packages/viz-engine/src/types.ts` — the rive module does not add any of its own. Use `style.portrait` to override size/opacity on mobile (`useIsMobile()`).
- The layer wrapper is `width: 100%; height: 100%; position: relative` with `background: config.background`. The `RiveComponent` canvas fills it (`width/height: 100%`). To frame the animation, set `style.panel` on the layer (background/border/radius/padding/blur/shadow) — there is no rive-specific panel default.
- Layout fit defaults to `contain` + `center`; for a full-bleed background animation set `layout.fit: cover`.

### Logo recolor + crash gotchas

The rive module's view-model color bindings are the same mechanism the **persistent chrome logo** uses. That logo is configured at the story level (not as a `rive` layer) via `logoPalette` — see `apps/vizmaya-fyi/content/stories/spacex-ipo-2026.config.yaml`, where `defaults.logoPalette` sets a story-wide base and each section's own `logoPalette` layers over it. Its slots map to the `.riv` color bindings: `text / teal / accent / accent2 / surface / muted / line`. There, theme tokens (`"$accent"`, `"$teal"`, `"$muted"`, …) are resolved to hex before binding; a literal hex also works.

Known gotchas carried from the logo work (relevant whenever you point a rive layer at `vizmaya-logo.riv` or any logo-style `.riv`):

- **Use the default artboard / view model.** The mark/Logo artboard path crashes; only the default artboard + default view model are safe. `Component.tsx` deliberately resolves the view model with `useViewModel(rive, { useDefault: true })`. Do not set `artboard` to a non-default logo artboard.
- **Color bindings must be valid hex (or a resolved hex).** Bindings flow through `parseHex` → `setRgba(r, g, b, 255)`; non-hex strings are treated as `string` bindings (or silently skipped if they look color-ish but fail to parse). Alpha is always forced to fully opaque.
- **Set a surface color so the panel doesn't go gray.** For the logo `.riv`, the `surfaceColor` / `surface` binding must be a hex value, otherwise the hero panel renders gray. Title heroes that want the logo to sit on the section background should keep the panel transparent (`panel: { background: none/transparent }`) rather than relying on the `.riv` surface.
- A mis-shaped `viewModel`/`bindings` value throws at parse time (`rive.viewModel must be an object` / `rive.viewModel.bindings must be a map`), which is a hard config error — fix the YAML shape rather than letting it through.

---

## Module: text

The `text` viz module renders a rich text panel — a heading + paragraph stack, or (in `stat` variant) a giant number with a label and supporting copy. It is a **foreground-only** module and is the single most common layer in region-driven and flat foreground stacks. Source: `packages/viz-engine/src/modules/text/index.ts` and `packages/viz-engine/src/modules/text/Component.tsx`.

Its defining behavior: **every config field is optional**. When a field is omitted, the renderer falls back to the active unit's resolved content (the section's own heading / subheading / paragraphs from the authored markdown). This lets an author either rely on the section's prose (the common case — drop a bare `- type: text` into a region) or override with literal text when slotting a text panel into a non-default region.

There is no `sample.ts` for this module (`packages/viz-engine/src/modules/text/` contains only `index.ts` and `Component.tsx`).

### Module registration

These are the `VizModule` fields the module sets (`packages/viz-engine/src/modules/text/index.ts`), as typed in `packages/viz-engine/src/types.ts`:

| Field | Value | Notes |
| --- | --- | --- |
| `type` | `'text'` | The YAML `type:` discriminator. |
| `label` | `'Text'` | Human label shown in the admin form / module picker. |
| `slots` | `['foreground']` | Foreground only. A `type: text` layer placed under `background:` is rejected by `ForegroundVizSlot`/`BackgroundVizSlot` (it isn't in `slots`). |
| `parseConfig` | see below | Validates + normalizes the raw YAML object. |
| `load` | `() => import('./Component')` | Lazy-loads `TextLayerComponent`. |
| `readinessProfile` | `'instant'` | The component calls `noteReady()` on mount (no async work), so PDF/share capture never waits on a text panel. |
| `regionPreferences` | `['body', 'lead']` | Authoring hint only — surfaced in the admin form to suggest where to drop the module. Not enforced at runtime (the layout region's `accepts` allowlist is the authoritative gate). |
| `defaultStyle` | card chrome + `pointerEvents: 'none'` | See [defaultStyle](#defaultstyle-panel-chrome--pointer-events). |
| `adminForm` | 5 fields | See [adminForm fields](#adminform-fields). |

Fields the module deliberately **does not** set:

- **`mountingMode`** — unset, so it defaults to `'per-unit'` (only meaningful for background modules anyway; foreground layers always mount per-unit).
- **`stableIdentity`** — intentionally absent. The comment in `index.ts` explains: "text remounts cheaply, and distinct text layers in different regions of the same unit should NOT share a single instance." Because of this, `ForegroundVizSlot` keys each text layer as `` `${unitKey}:${index}:${layer.type}` `` (`packages/viz-engine/src/ForegroundVizSlot.tsx`), so two text layers in the same unit stay separate instances and remount cleanly on unit change.
- **`collectAssetKeys`** — absent. The text module references no uploaded assets, so it contributes nothing to the story's asset-key set.
- **`introspect`** / **`loadPersistent`** — absent.

### Config shape (parseConfig)

`TextLayerConfig` (`packages/viz-engine/src/modules/text/index.ts`). Every field is optional except the `type` discriminator. `parseConfig(raw, ctx)` throws if `raw` is not an object (`"<label>: text layer must be an object"`).

| Option | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `type` | `'text'` | — | Yes | Module discriminator. Always `text`. |
| `kind` | `'text' \| 'stat'` | `'text'` | No | Visual variant. `text` = heading + paragraph stack; `stat` = giant number panel. Any other value throws `"<label>: text 'kind' must be 'text' or 'stat'"`. |
| `heading` | `string` | falls back to `unit.heading` | No | Inline heading override. In `text` kind it is the eyebrow above the prose; in `stat` kind it is the **giant number itself** (the value). Non-string values are coerced to `undefined`. |
| `subheading` | `string` | falls back to `unit.subheading` | No | Inline subheading override. In `text` kind it is currently unused by the renderer; in `stat` kind it is the small uppercased label beneath the number. Non-string values are coerced to `undefined`. |
| `content` | `string \| string[]` | falls back to `unit.paragraphs` | No | Content override. A string becomes a single paragraph; an array becomes multiple paragraphs. Anything else throws `"<label>: text 'content' must be a string or array of strings"`. In `stat` kind the paragraphs are joined with a space and rendered as the description line. |
| `color` | `StatColor` | `'accent2'` (applied in the component) | No | **Stat kind only.** Theme palette token for the giant number's color. Ignored in `text` kind. See [color tokens](#stat-color-tokens). Not validated by `parseConfig` — passed through verbatim. |

`parseConfig` normalizes to:

```ts
{
  type: 'text',
  kind: r.kind ?? 'text',
  heading: typeof r.heading === 'string' ? r.heading : undefined,
  subheading: typeof r.subheading === 'string' ? r.subheading : undefined,
  content: r.content,                 // string | string[] | undefined, passed through
  color: r.color,                     // StatColor | undefined, passed through
}
```

Note the asymmetry: `heading` and `subheading` are type-guarded (a non-string becomes `undefined`, so the unit fallback kicks in), whereas `content` and `color` are passed through after their validation/null check.

#### Stat color tokens

`StatColor` (`packages/viz-engine/src/lib/storyConfig.types.ts`, line 298) is one of:

`'accent'` · `'accent2'` · `'red'` · `'positive'` · `'amber'` · `'teal'` · `'muted'`

In the component the token is resolved to `var(--color-<token>)`; an omitted/unknown token defaults to `var(--color-accent2)` (`statColorVar` in `Component.tsx`). So the effective default stat number color is the theme's `accent2`.

### Render behavior

From `packages/viz-engine/src/modules/text/Component.tsx`:

1. Resolves `heading = config.heading ?? unit?.heading`, `subheading = config.subheading ?? unit?.subheading`, `paragraphs = config.content (as array) ?? unit?.paragraphs ?? []`. The active unit comes from `useForegroundContent()` (`packages/viz-engine/src/lib/foregroundContent.tsx`), which exposes the page resolver's `ResolvedUnit` (`heading`, `subheading`, `paragraphs`). Outside a `<ForegroundContentProvider>` the context is `null`, so only the inline config fields are used.
2. **Stat branch** — taken only when `kind === 'stat'` **and** a resolved `heading` exists. Renders `<StatPanel>`: centered giant serif number (`clamp(3.5rem, 11vw, 7.5rem)`) using the resolved `heading` as the value, optional uppercased mono `subheading` in accent color, and a description = `paragraphs.join(' ')` in `--color-muted`. If `kind === 'stat'` but there is no heading (neither config nor unit supplies one), it falls through to the text panel.
3. **Text branch** (default) — renders `<TextPanel>`: an optional uppercased mono eyebrow `heading` (accent color, `0.15em` tracking), then each paragraph as serif body text (`1.4rem` mobile / `1rem` desktop, `1.7` line-height). When a paragraph is a list block it renders as a `<ul>` instead (see below). When `paragraphs` is empty, it renders the placeholder `[text layer: no content]` in dim mono — a visible authoring cue that the layer resolved to nothing.

#### Inline markdown + lists

Paragraph strings pass through the engine's shared inline-markdown helpers (`packages/viz-engine/src/lib/inlineMarkdown.tsx`):

- `formatInlineMarkdown` — `**bold**` renders in the accent color with the mono font; `*italic*` renders as `<em>`.
- `isListBlock(p)` — a paragraph whose every non-empty line begins with `"- "` is treated as a bulleted `<ul>` (the content splitter joins consecutive `- a\n- b` lines into one paragraph string). `getListItems` strips the leading `"- "`.

So an author can put a markdown bullet list in a single `content` array element (newline-separated `- ` lines) and it renders as a real list.

### defaultStyle (panel chrome + pointer events)

The module ships a default card frame so a bare `- type: text` looks framed out of the box — it mirrors the legacy `MapStorySection` text card. From `index.ts`:

```ts
defaultStyle: {
  pointerEvents: 'none',
  panel: {
    background: 'rgb(var(--color-panel-rgb) / 0.2)',
    border: '0.5px solid var(--color-line)',
    borderRadius: '8px',
    padding: '1.5rem 1.75rem',
    backdropBlur: '20px',
  },
}
```

| `defaultStyle` field | Default | Effect |
| --- | --- | --- |
| `pointerEvents` | `'none'` | Text is non-interactive so scroll/wheel events pass through to the snap-scroll container. Opt back in with `style.pointerEvents: 'auto'` (to allow text selection or click handlers). |
| `panel.background` | `rgb(var(--color-panel-rgb) / 0.2)` | Translucent panel fill from the theme. |
| `panel.border` | `0.5px solid var(--color-line)` | Hairline theme border. |
| `panel.borderRadius` | `8px` | Card corner radius. |
| `panel.padding` | `1.5rem 1.75rem` | Inner padding. |
| `panel.backdropBlur` | `20px` | Frosted-glass blur (applied as `backdrop-filter: blur(20px)`, with the `-webkit-` prefix for Safari). |

**How merging works** (`resolveLayerStyle` in `packages/viz-engine/src/ForegroundVizSlot.tsx`): the module's `defaultStyle` is shallow-merged *under* the layer's authored `style`, and `panel` is merged **sub-field**. So overriding `style.panel.background` alone keeps the default border, radius, padding, and blur. To get **bare text with no card**, override the panel fields to remove them (set `style.panel.background: 'transparent'`, `border: 'none'`, etc.) — there is no single "panel off" switch; you null out the chrome you don't want. `pointerEvents`, `opacity`, `blendMode`, `zIndex` merge as flat top-level fields.

The resolved panel is applied to the layer's wrapper `<div>` by `applyPanel` in `ForegroundVizSlot.tsx` (it maps `panel.shadow` → `box-shadow`, `panel.backdropBlur` → `backdrop-filter`, etc.).

### Layer style options (host slot)

Beyond `defaultStyle`, a text layer accepts the full `VizLayerStyle` (`packages/viz-engine/src/types.ts`) under `style:` — these are resolved by the host `ForegroundVizSlot`, not by the module itself:

| `style` field | Type | Description |
| --- | --- | --- |
| `position` | `{ x?, y? }` | `x`/`y` each `left`/`center`/`right` (or `top`/`bottom`) or a CSS length. Setting `position` or `size` switches the wrapper from `inset: 0` (fill) to absolute placement. |
| `size` | `{ width?, height? }` | CSS lengths (e.g. `"320px"`, `"40vw"`). |
| `opacity` | `number` | 0–1. |
| `blendMode` | `'normal' \| 'multiply' \| 'screen' \| 'overlay' \| 'soft-light' \| 'difference'` | Maps to `mix-blend-mode`. |
| `pointerEvents` | `'auto' \| 'none'` | Overrides the module default `'none'`. |
| `zIndex` | `number` | Defaults to the layer's array index. |
| `panel` | `VizLayerPanel` | `background` / `border` / `borderRadius` / `padding` / `backdropBlur` / `shadow`. Sub-field merged over the module default panel. |
| `portrait` | `VizLayerStyle` | Partial style applied only when `useIsMobile()` is true; shallow-merged over the base (a nested `portrait` is ignored). |

#### Portrait / mobile nuances

- Text is **not** in `STACK_VISUAL_TYPES` (`ForegroundVizSlot.tsx`), so in `portraitStack` mode it sizes to its own content (auto height) rather than getting a forced `40vh` block. Visual siblings (chart, image, map, embed, rive) get the fixed stacked height.
- Body paragraphs are larger on portrait (`text-[1.4rem]`) than desktop (`md:text-[1rem]`) — long paragraphs that fit on desktop can overflow a portrait snap. (See the project note on isolating long paragraphs via `mobileParagraphs`.)
- Use `style.portrait` to tune or drop the panel on mobile (e.g. `portrait: { opacity: 0 }` to hide, or `portrait: { panel: { padding: '1rem' } }` to tighten).

### adminForm fields

`adminForm()` (`index.ts`) returns these editor fields (typed by `AdminFormField` in `types.ts`):

| Field key | Kind | Label | Notes |
| --- | --- | --- | --- |
| `kind` | `select` | Variant | Options: `text` → "Paragraphs", `stat` → "Big-number stat". |
| `heading` | `text` | Heading override | Placeholder: "Falls back to the section heading". |
| `subheading` | `text` | Subheading override | — |
| `content` | `json` | Content override (string \| string[]) | Raw JSON so the author can type either a string or an array. |
| `color` | `theme-token` | Stat color token (stat-kind only) | Theme-token picker; only meaningful in `stat` kind. |

### YAML examples

The text module is authored inside a section's `foreground:`. The foreground is shape-polymorphic — a flat layer stack, named regions (layout-driven), or a single layer (`apps/admin/components/vizmaya/canvas/canvasEditing.ts`, the `FOREGROUND_PLACEHOLDER`).

**1. Bare text layer, relying entirely on the section's resolved content** (the common case — the panel inherits the section heading + paragraphs, and the default card chrome):

```yaml
foreground:
  - type: text
```

**2. Flat stack — a chart with an inline-overridden text panel beside it:**

```yaml
foreground:
  - type: chart
    id: oil-share
  - type: text
    heading: "What the curve shows"
    content:
      - "Production **doubled** in a decade, then flattened."
      - |
        - Field A: 1.2 Mbpd
        - Field B: 0.9 Mbpd
        - Field C: 0.4 Mbpd
    style:
      position: { x: right, y: center }
      size: { width: "34vw" }
```

**3. Named regions (layout-driven)** — a `text` layer per region; `lead` is in the module's `regionPreferences`:

```yaml
foreground:
  layout: lead-charts-body
  regions:
    lead:
      type: text
      content: "Section lead text"
    body:
      type: text
      heading: "Why it matters"
      # content omitted → falls back to this section's paragraphs
```

**4. `stat` variant** — giant number + label + supporting copy, accent-tinted, with the card chrome stripped to a bare number:

```yaml
foreground:
  - type: text
    kind: stat
    heading: "51"
    subheading: "matches unbeaten — a European record"
    content: "Bayer Leverkusen's 2023-24 season set the Bundesliga record."
    color: accent
    style:
      panel:
        background: transparent
        border: none
        backdropBlur: "0px"
```

> Note: the legacy *map-format* `sections:` syntax (e.g. `kind: stat` / `text: "51"` directly on a section, as seen in `apps/vizmaya-fyi/content/stories/xabi-alonso-chelsea-2026.config.yaml` and `housing-trends-europe.config.yaml`) is the older `MapStorySection` rendering path, **not** this viz module. The `text` viz module is the `type: text` layer inside a `foreground:` stack or region. The two share the `stat` look and `StatColor` palette by design, but are distinct code paths.

---

## Module: bigStat

The `bigStat` module is the deck format's composable giant-number vizslot — a
single oversized serif number with an optional unit, a small uppercase label,
and a delta/qualifier line beneath. Unlike the legacy `text` module's
`kind: stat` treatment (which centres the number in the whole section), a
`bigStat` lives inside one **region** of a deck layout and respects that
region's box. Reach for it when a stat sits side-by-side with a chart, image,
or prose body (e.g. `stat-left-chart-right`, `free`).

Source: `packages/viz-engine/src/modules/bigStat/index.ts`,
`packages/viz-engine/src/modules/bigStat/Component.tsx`. There is no
`sample.ts` for this module.

### Registration

| Field | Value | Source |
| --- | --- | --- |
| `type` | `'bigStat'` | `index.ts:76` |
| `label` | `'Big stat'` (admin display name) | `index.ts:77` |
| `slots` | `['foreground']` — foreground-only; it is **not** a valid `background:` layer | `index.ts:78` |
| `readinessProfile` | `'instant'` — the slot reports ready immediately (the component calls `noteReady()` in a mount effect; no async assets) | `index.ts:81`, `Component.tsx:23-25` |
| `mountingMode` | *(unset)* → defaults to `'per-unit'`; but mounting mode only governs **background** slots, so it is irrelevant for this foreground module | `types.ts:167-168` |
| `loadPersistent` | *(unset)* | — |
| `introspect` | *(unset)* | — |
| `collectAssetKeys` | *(unset)* — `bigStat` references no assets, so it contributes no keys to the story's asset manifest | `index.ts` |
| `load` | `() => import('./Component')` (lazy) | `index.ts:80` |

> Note on `SectionKind` vs vizslot type. `bigStat` is both a `SectionKind`
> alias (`kind: bigStat`, ≈ legacy `stat`) **and** a foreground vizslot `type`.
> They are independent: setting `kind: bigStat` on a section only sets the
> editorial archetype and suppresses the section text card — it does **not**
> auto-create a `bigStat` foreground layer. You still declare the
> `- type: bigStat` layer explicitly under `foreground:`. See
> `packages/viz-engine/src/lib/storyConfig.types.ts:278-290` for the full
> `SectionKind` union and the alias comments.

### Config shape (`parseConfig`)

Every field below is parsed by `parseConfig` in
`packages/viz-engine/src/modules/bigStat/index.ts:43-64`. The interface is
`BigStatLayerConfig` (`index.ts:18-41`). `parseConfig` throws if `raw` is not
an object, if `value` is missing/empty, or if `align` is present but not one of
the three allowed strings.

| Option | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `type` | `'bigStat'` (literal) | — | yes | The vizslot discriminator. Always `bigStat`. |
| `value` | `string` | — | **yes** | The big number itself, e.g. `"$18.7B"`, `"10.3M"`, `"22,000%"`. Must be a **non-empty** string after trimming or `parseConfig` throws `"… bigStat 'value' is required and must be a non-empty string"`. Rendered as the giant serif headline. |
| `unit` | `string` | `undefined` | no | Optional unit/suffix rendered adjacent to the value at a smaller weight (~half the value size, `opacity: 0.8`). Useful when the value is purely numeric (`"18.7"`) and the unit (`"B"`) is styled separately. Any non-string value is coerced to `undefined`. An empty string (`unit: ""`) is a valid no-op suffix and is used in the wild as a placeholder. |
| `label` | `string` | `undefined` | no (the JSDoc calls it "required for readability", but it is **not** enforced) | Short uppercase, letter-spaced, monospace caption beneath the number. Capped at `36ch` width. Non-string → `undefined`. |
| `delta` | `string` | `undefined` | no | Secondary line below the label — typically a year-over-year delta or date qualifier (e.g. `"+33% YoY · run-rate $18.8B in Q1 2026"`). Sans-serif, capped at `36ch`. Non-string → `undefined`. |
| `deltaColor` | `DeltaColor` (theme token) | `undefined` → renders `var(--color-muted)` | no | Theme token applied to the delta line, set independently of the big number. `DeltaColor = StatColor \| 'positive'`. **Not validated** by `parseConfig` — passed straight through (`r.deltaColor as DeltaColor`), so a bad token silently resolves to a nonexistent CSS var. |
| `color` | `StatColor` (theme token) | `undefined` → renders `var(--color-accent2)` | no | Theme token applied to the big number (and the `unit`). **Not validated** by `parseConfig` — passed straight through. |
| `align` | `'left' \| 'center' \| 'right'` | `'left'` | no | Horizontal alignment inside the region's box. Validated: any other value throws. `parseConfig` defaults a missing value to `'left'`. |

#### Theme tokens (`color` / `deltaColor`)

`color` is typed `StatColor` and `deltaColor` is `DeltaColor` (= `StatColor`
plus the semantic `'positive'`). Both resolve to a CSS variable
`var(--color-<token>)` at render (`Component.tsx:8-11`). `StatColor` is defined
in `packages/viz-engine/src/lib/storyConfig.types.ts:298-306`:

| Token | Notes |
| --- | --- |
| `accent` | — |
| `accent2` | **default for `color`** (the big number) |
| `red` | — |
| `positive` | also the typical green delta token |
| `amber` | used for cautionary stats (R&D spend, dark money) |
| `teal` | — |
| `muted` | **default for `deltaColor`** |

Background/surface/text tokens are intentionally **not** part of `StatColor`
(they don't read as a foreground accent). The label line is hard-coded to
`var(--color-text)` regardless of `color` (`Component.tsx:61`).

### Rendering & typography (Component.tsx)

`packages/viz-engine/src/modules/bigStat/Component.tsx` renders a full-box flex
column, vertically centred, horizontally aligned per `align`:

- Container: `w-full h-full flex flex-col justify-center` plus the align
  classes from `ALIGN_TO_FLEX` (`Component.tsx:13-17`):
  - `left` → `items-start text-left`
  - `center` → `items-center text-center`
  - `right` → `items-end text-right`
- **Value**: `font-serif font-bold leading-none`, `fontSize: clamp(3.5rem, 11vw, 7.5rem)`, color = `color` token (default `accent2`). (`Component.tsx:34-43`)
- **Unit** (only if `unit` set): same serif weight, `fontSize: clamp(1.75rem, 5vw, 3rem)`, `opacity: 0.8`, baseline-aligned next to the value with `gap-2`. (`Component.tsx:44-55`)
- **Label** (only if `label` set): `font-mono uppercase tracking-[0.15em] mt-3`, `fontSize: 0.75rem`, color `var(--color-text)`, `maxWidth: 36ch`. (`Component.tsx:57-68`)
- **Delta** (only if `delta` set): `font-sans mt-2`, `fontSize: 0.85rem`, color = `deltaColor` token (default `muted`), `maxWidth: 36ch`. (`Component.tsx:69-80`)

The value/unit font sizes are fluid (`clamp` against `vw`), so the number
scales with the viewport rather than the region box — keep an eye on narrow
regions where `11vw` can still overflow a `42%`-wide column on wide screens.

### adminForm

`adminForm` (`index.ts:90-107`) returns the field list the admin UI renders.
Field kinds come from `AdminFormField` in
`packages/viz-engine/src/types.ts:135-142`.

| Form field | `kind` | `key` | Label | Notes |
| --- | --- | --- | --- | --- |
| Big number | `text` | `value` | "Big number" | `placeholder: '$18.7B'`, `required: true` |
| Unit suffix | `text` | `unit` | "Unit suffix" | — |
| Label beneath number | `text` | `label` | "Label beneath number" | — |
| Delta line | `text` | `delta` | "Delta line (optional)" | — |
| Number color | `theme-token` | `color` | "Number color" | theme-token picker |
| Delta color | `theme-token` | `deltaColor` | "Delta color" | theme-token picker |
| Alignment | `select` | `align` | "Alignment" | options: `left` ("Left"), `center` ("Centre"), `right` ("Right") |

The admin form is a static list (ignores its `config` argument).

### defaultStyle, panel chrome, regionPreferences

| Field | Value | Source | Meaning |
| --- | --- | --- | --- |
| `defaultStyle` | `{ pointerEvents: 'none' }` | `index.ts:86-88` | A `bigStat` is non-interactive by default, so it never eats clicks/scroll from a chart or link layered nearby. Shallow-merged **under** any author `style` per-field (so setting `style.position`/`style.size` leaves `pointerEvents` intact unless explicitly overridden). |
| `defaultStyle.panel` | *(none)* | `index.ts:84-88` | **No default panel chrome.** A bare `bigStat` sits borderless on whatever surface it lands. In the deck format the frosted-glass card frame comes from the story-wide `defaults.panel` (`StoryDefaults.panel`), merged over the (empty) module default and then over any per-section `panel` / per-layer `style.panel`. So to give a `bigStat` a card, set `defaults.panel`, the section `panel`, or `style.panel` — the module won't. |
| `regionPreferences` | `['lead', 'stat']` | `index.ts:89` | Authoring hint (admin form / preview) for which layout regions suit this module. **Not** enforced at runtime — the layout's per-region `accepts` allowlist is the authoritative gate (`types.ts:185-189`, `ForegroundLayoutRegion.accepts`). |

Panel cascade (most-specific wins, per `StorySectionConfig.panel` /
`StoryDefaults.panel` docs in `storyConfig.types.ts`):

```
layer style.panel  →  section panel  →  defaults.panel  →  module defaultStyle.panel (empty for bigStat)
```

### stableIdentity

`stableIdentity` (`index.ts:71-73`) returns:

```
`bigStat:${config.value}`
```

This deterministic key keeps multiple `bigStat` layers on the same unit from
collapsing into one instance: distinct `value` strings render as distinct
components; two `bigStat`s with the **same** `value` reuse the same instance.
Note the identity keys only on `value` — two stats sharing a value but
differing in `label`/`delta`/`color` would share identity. (In practice this is
the `BackgroundVizSlot` dedupe path; for a foreground-only module it mainly
guarantees stable React keys.)

### Portrait / style nuances

- `bigStat` has no portrait-specific behavior of its own. Portrait restacking
  is controlled by the **layout** (`ForegroundLayoutDef.stackOnPortrait`,
  `types.ts:40-48`) and by per-layer `style.portrait` overrides
  (`VizLayerStyle.portrait`, `types.ts:88-95`). In the `free` and
  `stat-left-chart-right` deck layouts the stat self-positions via `style`, so
  on portrait its authored side-by-side width collapses to full-width vertical
  flow.
- The value/unit use viewport-relative `clamp()` sizing, so on small portrait
  viewports the number shrinks toward `3.5rem` / `1.75rem` automatically.
- `label` and `delta` are width-capped at `36ch`; long qualifiers wrap rather
  than overflow. Keep delta copy tight.
- To make a `bigStat` sit on the right or centre of its region, set both the
  layer `align` (controls in-box text alignment) **and** `style.position`
  (controls where the wrapper box sits) — they are independent.

### Complete realistic YAML examples

#### Stat + prose row (money-in-politics, `free` layout)

Section with `kind: bigStat`, a `free` layout, the stat pinned left and a
`bodyText` slot fed from the markdown on the right. From
`apps/vizmaya-fyi/content/stories/money-in-politics-2026.config.yaml`:

```yaml
- id: lobbying-record
  kind: bigStat
  text: "$4.4 billion"
  paragraphs: [0, 2]
  layout: free
  foreground:
    - type: bigStat
      value: "$4.4B"
      label: "Federal lobbying spending · calendar year 2024 (record)"
      delta: "+$150M over 2023, which itself set a record"
      deltaColor: positive
      color: accent2
      align: left
      style:
        position: { x: left, y: center }
        size: { width: "42%" }
    - type: bodyText
      from: text
      style:
        position: { x: right, y: center }
        size: { width: "44%" }
```

#### Stat + chart row (spacex-ipo, `stat-left-chart-right` layout)

A `kind: data` section pairing the stat with a chart. The stat takes the left
column, the chart the right. From
`apps/vizmaya-fyi/content/stories/spacex-ipo-2026.config.yaml`:

```yaml
- id: subscribers
  kind: data
  text: "10.3M subscribers"
  paragraphs: [0, 2]
  layout: stat-left-chart-right
  foreground:
    - type: bigStat
      value: "10.3M"
      label: "Starlink subscribers · March 31, 2026"
      delta: "164 countries · +106% YoY"
      deltaColor: positive
      color: accent2
      align: left
      style:
        position: { x: left, y: center }
        size: { width: "44%" }
    - type: chart
      id: starlink-subscribers
      caption: "Subscribers doubled in each of the last two years · S-1 disclosure"
      style:
        position: { x: right, y: center }
        size: { width: "50%", height: "62vh" }
```

#### Headline stat with explicit `unit` placeholder + per-section logo tint

The `$18.7B` headline slide. Note `unit: ""` (a deliberate empty suffix) and
the `deltaColor: positive`. From
`apps/vizmaya-fyi/content/stories/spacex-ipo-2026.config.yaml`:

```yaml
- id: revenue-headline
  kind: bigStat
  text: "$18.7B headline"
  paragraphs: [0, 2]
  logoPalette:
    accent: "$teal"        # tint the persistent logo accent teal on this slide
  foreground:
    - type: bigStat
      value: "$18.7B"
      unit: ""
      label: "SpaceX consolidated revenue, full year 2025"
      delta: "+33% YoY · run-rate $18.8B in Q1 2026"
      deltaColor: positive
      color: accent2
      align: left
      style:
        position: { x: left, y: center }
        size: { width: "44%" }
```

#### Cautionary stat using the amber token

A stat where both number and delta share the `amber` token to signal caution.
From `apps/vizmaya-fyi/content/stories/money-in-politics-2026.config.yaml`:

```yaml
- type: bigStat
  value: "$1.9B"
  label: "Dark money · 2024 cycle alone (record)"
  delta: "$4.3B+ since Citizens United"
  deltaColor: amber
  color: amber
  align: left
  style:
    position: { x: left, y: center }
    size: { width: "42%" }
```

---

## Module: bodyText

The `bodyText` module is the deck format's **prose body slot**. It renders the
section's paragraphs (and, optionally, a heading) as serif body copy with inline
`**bold**` / `*italic*` markdown and bulleted-list support. It is the workhorse
foreground layer for "text + chart" and "text + stat" slides, and for
prose-only slides over an aura/image background.

Source: `packages/viz-engine/src/modules/bodyText/index.ts`,
`packages/viz-engine/src/modules/bodyText/Component.tsx`.

There is **no `sample.ts`** for this module (the registry/catalog has no
standalone sample for `bodyText`; it is exercised only inside real deck story
configs because it depends on resolved unit content). Examples below are mined
from `apps/vizmaya-fyi/content/stories/*.config.yaml`.

### Identity & slots

| Field | Value | Source |
| --- | --- | --- |
| `type` | `'bodyText'` | `index.ts` line 65 |
| `label` | `'Body text'` | `index.ts` line 66 |
| `slots` | `['foreground']` only | `index.ts` line 67 |
| `mountingMode` | _unset_ → defaults to `'per-unit'` | `types.ts` line 157 |
| `readinessProfile` | `'instant'` | `index.ts` line 71 |
| `regionPreferences` | `['body', 'text']` | `index.ts` line 72 |
| `stableIdentity` | _unset_ — "bodyText layers remount cheaply per region" | `index.ts` line 71 comment |
| `collectAssetKeys` | _unset_ — module references no assets | — |
| `introspect` | _unset_ | — |
| `loadPersistent` | _unset_ (not a persistent module) | — |

Because `slots` is `['foreground']`, `bodyText` can only be placed inside a
section's `foreground:` array (a foreground-layout region) — never in
`background:`. `regionPreferences: ['body', 'text']` is an authoring hint only;
the layout's per-region `accepts` allowlist is the authoritative runtime gate
(`types.ts` lines 22, 188).

`readinessProfile: 'instant'` means the module is treated as ready immediately;
the component also calls `noteReady()` on mount in an effect
(`Component.tsx` lines 38-40).

### Config shape

The TypeScript interface (`BodyTextLayerConfig`, `index.ts` lines 18-37):

```ts
interface BodyTextLayerConfig {
  type: 'bodyText'
  from?: 'text'
  content?: string | string[]
  heading?: string
  showHeading?: boolean
  textStyle?: { size?: BodyTextSize; color?: BodyTextColor }
}
```

Every field is parsed by `parseConfig` (`index.ts` lines 39-62). The table
documents what `parseConfig` actually emits, including normalization:

| Option | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `type` | `'bodyText'` | — | yes | Module discriminator; selects this module in a `foreground:` layer. Always re-emitted as `'bodyText'`. |
| `from` | `'text'` | `'text'` | no | Content source mode. **Only `'text'` is supported** — any other value throws `bodyText 'from' must be 'text'` (`index.ts` lines 44-46). `'text'` reads the active unit's resolved paragraphs via `ForegroundContentContext`. The interface comment notes a future `'section-id'` mode, but it is **not implemented**. `parseConfig` always normalizes the emitted value to `'text'` (line 53). |
| `content` | `string \| string[]` | `undefined` | no | Literal paragraph(s). When set, **overrides** the unit's resolved paragraphs (precedence in `Component.tsx` line 45: `inline ?? unit?.paragraphs ?? []`). A bare string becomes a single paragraph; an array is one paragraph per element (`toParagraphs`, `Component.tsx` lines 28-32). Must be a string or array of strings, else `parseConfig` throws `bodyText 'content' must be a string or array of strings` (lines 47-49). Use for ad-hoc prose that does not live in the markdown. |
| `heading` | `string` | `undefined` | no | Heading text rendered above the paragraphs **when `showHeading` is true**. Only kept if it is a string (line 55). When `showHeading` is true but `heading` is unset, the component falls back to the unit's heading (`Component.tsx` line 46: `config.heading ?? unit?.heading`). |
| `showHeading` | `boolean` | `false` | no | Whether to render the heading at all. Parsed strictly: only the literal `true` enables it (`showHeading: r.showHeading === true`, line 56) — any other value (including truthy strings) yields `false`. Deck slides typically suppress the heading because the section's own markdown heading already anchors the slide. |
| `textStyle` | object | `{}` (always emitted, with `size`/`color` possibly `undefined`) | no | Text styling container. `parseConfig` always emits a `textStyle` object even when the YAML omits it (`r.textStyle ?? {}`, line 50). See sub-keys below. |
| `textStyle.size` | `'small' \| 'normal' \| 'large'` | `'normal'` (applied at render) | no | Font size + line-height token. The default is applied in the component, not in `parseConfig` (`config.textStyle?.size ?? 'normal'`, `Component.tsx` line 48). Not validated by `parseConfig` — an out-of-range value is passed through and would index `undefined` in the size maps. See the size table below. |
| `textStyle.color` | `'text' \| 'muted' \| 'accent' \| 'accent2'` | `'text'` (applied at render) | no | Text color token, resolved to a CSS theme variable. Default applied in the component (`config.textStyle?.color ?? 'text'`, `Component.tsx` line 49). See the color table below. |

Note `parseConfig` does **not** validate `textStyle.size` / `textStyle.color`
against the enums — they are cast through as-is (`index.ts` lines 58-59). The
admin form (below) constrains them, but a hand-authored YAML with an unknown
size would render with `undefined` font metrics.

### Text size tokens

`textStyle.size` maps to `font-size` and `line-height`
(`Component.tsx` lines 9-19):

| `size` | `font-size` | `line-height` |
| --- | --- | --- |
| `small` | `0.9rem` | `1.55` |
| `normal` (default) | `1.15rem` | `1.65` |
| `large` | `1.4rem` | `1.7` |

### Text color tokens

`textStyle.color` maps to a CSS theme variable (`Component.tsx` lines 21-26):

| `color` | CSS variable |
| --- | --- |
| `text` (default) | `var(--color-text)` |
| `muted` | `var(--color-muted)` |
| `accent` | `var(--color-accent)` |
| `accent2` | `var(--color-accent2)` |

### Rendering behavior

From `Component.tsx`:

- **Content resolution** (lines 42-45): reads `useForegroundContent()` →
  `ctx.unit`. Effective paragraphs = `config.content` (as paragraphs) if set,
  else `unit.paragraphs`, else `[]`. When the module is mounted **outside** a
  `<ForegroundContentProvider>` (`useForegroundContent()` returns `null`) and no
  literal `content` is supplied, paragraphs are empty.
- **Empty state** (lines 89-96): when no paragraphs resolve, renders a mono,
  60%-opacity placeholder `[bodyText: no content resolved]` in
  `var(--color-muted)` at `0.7rem` — a visible authoring breadcrumb, not a
  silent blank.
- **Outer box** (line 55): `w-full h-full flex flex-col justify-center` — fills
  its region wrapper and vertically centers the prose block.
- **Heading** (lines 56-66): rendered only when `showHeading` resolves a
  heading. Styled `font-mono uppercase tracking-[0.15em] mb-4`, color
  `var(--color-accent)`, `0.85rem` — i.e. an accent eyebrow/kicker, regardless
  of `textStyle.color`.
- **Paragraphs** (lines 67-88): each paragraph is `font-serif mb-3 last:mb-0`
  with the resolved `color` / `fontSize` / `lineHeight`. Inline markdown is run
  through `formatInlineMarkdown` (`packages/viz-engine/src/lib/inlineMarkdown.tsx`):
  `**bold**` renders as a mono, bold `var(--color-accent)` `<strong>`; `*italic*`
  renders as `<em>`.
- **List blocks** (lines 69-78): a paragraph whose every non-empty line begins
  with `- ` is detected by `isListBlock` and rendered as a `<ul class="list-disc pl-5">`
  with the leading `- ` stripped per item (`getListItems`). Each `<li>` is still
  run through inline-markdown formatting. The content splitter splits on blank
  lines, so a `- a\n- b\n- c` run arrives as a single paragraph and renders as
  one list.

#### defaultStyle (panel chrome)

`bodyText.defaultStyle` (`index.ts` lines 73-75) sets only:

| `defaultStyle` field | Value | Effect |
| --- | --- | --- |
| `pointerEvents` | `'none'` | Body prose is non-interactive — clicks/scroll pass through to whatever is behind (background, page scroller). |

Notably, **`bodyText` ships no `panel` chrome by default** (unlike card-style
text/image layers). It is intended to read as type-on-page, so there is no card
frame, border, blur, or background. `defaultStyle` is shallow-merged per-field
under any author `style` (`types.ts` lines 175-182), so setting
`style.pointerEvents: auto` or adding a `style.panel` in YAML overrides only
those fields and leaves the rest of the default intact.

### adminForm fields

`adminForm()` returns these fields (`index.ts` lines 76-101); it ignores the
passed config and always returns the same shape:

| Field key | `kind` | Label | Options / notes |
| --- | --- | --- | --- |
| `showHeading` | `boolean` | Show heading above paragraphs | — |
| `heading` | `text` | Heading override | Free text |
| `content` | `json` | Content override (string \| string[]) | JSON editor for the literal-content override |
| `textStyle.size` | `select` | Size | `small` / `normal` / `large` |
| `textStyle.color` | `select` | Color | `text` / `muted` / `accent` / `accent2` |

There is no admin field for `from` (locked to `'text'`).

### Portrait / mobile nuances

`bodyText` itself has **no `style.portrait` defaults** and no portrait-specific
component branch. Portrait behavior is driven entirely by the surrounding deck
machinery:

- The deck "free" / `text-left-chart-right` / `stat-left-chart-right` layouts
  set `stackOnPortrait` (`types.ts` lines 40-48), so a `bodyText` slot authored
  at e.g. `size.width: 44%` flows full-width and stacks vertically above/below
  the chart on portrait rather than staying side-by-side.
- Long prose is split across portrait scroll-snaps at the **section** level via
  the section's `mobileParagraphs:` field (see the SpaceX and money-in-politics
  examples below), not by the module. Portrait snaps clip rather than scroll, so
  isolating dense paragraphs into separate `mobileParagraphs` slices is the way
  to keep `bodyText` readable on mobile.
- You can still attach a per-layer `style.portrait` (e.g. to drop or resize the
  slot on mobile) — it is shallow-merged by the generic `VizLayerStyle.portrait`
  mechanism (`types.ts` lines 88-95); the module imposes no constraints.

### YAML examples

#### Text-left / chart-right slide (most common pattern)

The default `from: text` pulls the section's resolved paragraphs; the slot is
positioned and width-constrained via `style`. From
`apps/vizmaya-fyi/content/stories/money-in-politics-2026.config.yaml`:

```yaml
- id: outside-spending
  kind: data
  text: "Outside spending doubled"        # markdown anchor → resolves paragraphs
  paragraphs: [0, 2]                       # slice fed to bodyText via the unit
  mobileParagraphs:                        # portrait: split into 2 snaps
    - [0, 1]
    - [1, 2]
  layout: text-left-chart-right
  foreground:
    - type: bodyText
      from: text
      style:
        position: { x: left, y: center }
        size: { width: "44%" }
    - type: chart
      id: outside-spending-trend
      caption: "Super PAC outside spending · USD billions"
      style:
        position: { x: right, y: center }
        size: { width: "50%", height: "60vh" }
```

#### Prose-only slide over an aura background

From `apps/vizmaya-fyi/content/stories/spacex-ipo-2026.config.yaml` — a
text-only section with dense paragraphs split for portrait:

```yaml
- id: starlink-machine
  kind: bodyText
  text: "Starlink: the machine behind the curtain"
  paragraphs: [0, 4]
  mobileParagraphs:                        # 4 dense paragraphs → 2 portrait snaps
    - [0, 2]
    - [2, 4]
  foreground:
    - type: bodyText
      from: text
      style:
        position: { x: left, y: center }
        size: { width: "44%" }
```

#### bodyText beside a domain viz module

From `apps/vizmaya-fyi/content/stories/paris-road-to-budapest.config.yaml`,
where `bodyText` pairs with a football module on a `free` layout:

```yaml
layout: free
foreground:
  - type: bodyText
    from: text
    style:
      position: { x: left, y: center }
      size: { width: "38%" }
  - type: fs:match-card
    layout: horizontal
    home: psg
    away: chelsea
    score: 5 – 2
```

#### Literal content + styled heading (override pattern)

Not seen verbatim in the sampled configs, but supported by `parseConfig` /
`adminForm`. Use `content` to inject ad-hoc prose that does not live in the
markdown, and `showHeading` + `heading` for an accent eyebrow:

```yaml
- type: bodyText
  showHeading: true
  heading: "WHAT CHANGED"
  content:
    - "First override paragraph with **bold accent** words."
    - "- bullet one\n- bullet two\n- bullet three"   # one list block
  textStyle:
    size: large
    color: muted
  style:
    position: { x: left, y: center }
    size: { width: "44%" }
    pointerEvents: auto          # override the module default if links are needed
```

---

## Module: quote

A pull-quote layer for the deck format. It renders large italic serif text with an optional, mono-cased attribution line. The deck layout typically pairs it with a prose body in a `text-left-quote-right` split, with the quote occupying the right region.

Source: `packages/viz-engine/src/modules/quote/index.ts`, `packages/viz-engine/src/modules/quote/Component.tsx`.

### Identity

| Property | Value | Notes |
| --- | --- | --- |
| `type` | `quote` | The string authors put under `foreground:` `- type: quote`. Also returned hard-coded by `parseConfig` (`packages/viz-engine/src/modules/quote/index.ts:32`). |
| `label` | `Quote` | Human label shown in the admin module picker (`index.ts:49`). |

### Slots

`slots: ['foreground']` (`index.ts:50`). The quote module is **foreground only** — it does not list `background`, so it can never be placed in a unit's `background:` stack. A layout region must include `foreground` (and, where the layout enforces an `accepts` allowlist, must accept `quote`) for the layer to mount.

There is no `loadPersistent`, and `mountingMode` is **not set**, so the slot uses the default `per-unit` mounting strategy (`packages/viz-engine/src/types.ts:157`, `:167`) — one component instance per unique `stableIdentity` (see below).

### Config shape

The full parsed config interface is `QuoteLayerConfig` (`index.ts:10`):

```ts
interface QuoteLayerConfig {
  type: 'quote'
  text: string
  attribution?: string
  align?: 'left' | 'center' | 'right'
}
```

Every field parsed by `parseConfig` (`index.ts:20`):

| Option | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `type` | `'quote'` | — | yes | Layer discriminator. Set by authors as `type: quote`. `parseConfig` always emits `type: 'quote'`. |
| `text` | `string` | — | **yes** | The quoted text. Must be a non-empty string after trimming, or `parseConfig` throws `quote 'text' is required and must be a non-empty string` (`index.ts:25`). The value is `.trim()`-ed before storage. May contain inline markdown for emphasis (rendered via `formatInlineMarkdown`). May also be a markdown **bullet list** — see the list-block nuance below. |
| `attribution` | `string` | `undefined` | no | Optional attribution / source line, rendered below the quote as `— <attribution>` in mono caps. Only stored if it is a string; it is `.trim()`-ed. Any non-string value becomes `undefined` (`index.ts:34`). When omitted/empty the `<cite>` element is not rendered at all. |
| `align` | `'left' \| 'center' \| 'right'` | `'left'` | no | Horizontal alignment of the quote (and attribution) inside the region. Validated: any non-null value other than the three literals throws `quote 'align' must be 'left' | 'center' | 'right'` (`index.ts:28`). Defaults to `'left'` when absent (`index.ts:35`). |

Note: `parseConfig` is strict — passing a non-object `raw` throws `quote layer must be an object` (`index.ts:21`). Unknown extra keys on the YAML object are silently ignored (only the four fields above are read).

### Admin form

`adminForm` (`index.ts:57`) is a static function (it ignores the current config) returning three fields. These map onto the `AdminFormField` union in `packages/viz-engine/src/types.ts:135`:

| Field key | `kind` | Label | Required | Notes |
| --- | --- | --- | --- | --- |
| `text` | `text` | `Quote text` | yes | Maps to `config.text`. Marked `required: true`. |
| `attribution` | `text` | `Attribution` | no | Maps to `config.attribution`. |
| `align` | `select` | `Alignment` | no | Options: `Left` → `left`, `Centre` → `center`, `Right` → `right`. Note the `Centre` label spells the value `center`. |

There is no admin field for `style` / panel chrome — that is authored directly in YAML (see Styling).

### Readiness

`readinessProfile: 'instant'` (`index.ts:53`). The component is text-only with no async assets, so it reports ready on first mount: its `Component.tsx` calls `noteReady()` in a `useEffect` keyed on `noteReady` (`Component.tsx:18`). It does not block scene readiness on tiles or first-paint.

### Stable identity

`stableIdentity` returns `quote:<first 64 chars of text>` (`index.ts:43`):

```ts
function stableIdentity(config: QuoteLayerConfig): string {
  return `quote:${config.text.slice(0, 64)}`
}
```

This keys instances by quote-text prefix so that two **distinct** quotes get separate component instances. The doc comment (`index.ts:39`) explains the intent: if distinct quotes shared one instance, the text would visibly morph between scrolls. Two layers whose first 64 characters of `text` are identical will collide on identity — keep leading text distinct if you need separate instances.

### Default style and chrome

`defaultStyle: { pointerEvents: 'none' }` (`index.ts:55`). This is the only module-level style default. It is shallow-merged per-field under any `style` the author sets on the layer (`packages/viz-engine/src/types.ts:175`), so a YAML `style.pointerEvents: auto` would override it while leaving everything else intact.

Notably the quote module ships **no `panel` default** — unlike text-card modules that get a card frame by default, a quote renders with no background, border, radius, padding, or shadow unless the author adds `style.panel` in YAML. The quote sits as bare italic serif text over whatever the unit's background is.

The full set of style keys an author can attach to the layer (from `VizLayerStyle` / `VizLayerPanel`, `types.ts:65`–`:96`):

| `style.*` key | Type | Notes |
| --- | --- | --- |
| `position.x` | `'left' \| 'center' \| 'right' \| string` | Horizontal placement of the layer box in its region. |
| `position.y` | `'top' \| 'center' \| 'bottom' \| string` | Vertical placement. |
| `size.width` | `string` | e.g. `"46%"`. |
| `size.height` | `string` | e.g. `"60vh"`. |
| `opacity` | `number` | Layer opacity. |
| `blendMode` | `'normal' \| 'multiply' \| 'screen' \| 'overlay' \| 'soft-light' \| 'difference'` | Compositing mode. |
| `pointerEvents` | `'auto' \| 'none'` | Default `none` for quote (see above). |
| `zIndex` | `number` | Stacking order within the slot. |
| `panel` | `VizLayerPanel` | `background`, `border`, `borderRadius`, `padding`, `backdropBlur`, `shadow` — all CSS shorthands. None set by default for quote. |
| `portrait` | `VizLayerStyle` | Per-field overrides applied when `useIsMobile()` is true (one level deep; a nested `portrait` is ignored). |

### Region preferences

`regionPreferences: ['body', 'quote']` (`index.ts:56`). This is advisory metadata used by the admin form to suggest where to drop the module; it is **not enforced at runtime** (the layout's per-region `accepts` allowlist is the authoritative gate — `types.ts:183`). It signals the module is best suited to a layout's `body` or `quote` region, e.g. the right-hand `quote` region of `text-left-quote-right`.

### Assets

`collectAssetKeys` is **not defined**. The quote module references no images, video, or chart JSON, so it contributes no asset keys to the bundle/upload manifest. There is no `introspect` either.

### Rendering details and nuances

Rendered as a `<blockquote>` filling its box, flex-column, vertically centered, with alignment classes driven by `align` (`Component.tsx:8`, `:26`):

- `left` → `items-start text-left`
- `center` → `items-center text-center`
- `right` → `items-end text-right`

Type is `font-serif italic leading-snug`, color `var(--color-text)`, fluid size `clamp(1.4rem, 2.2vw, 1.85rem)`, capped at `max-width: 32ch` (`Component.tsx:47`). The quote body is wrapped in decorative curly quotation marks (`“ … ”`) rendered as `aria-hidden` spans at 50% opacity (`Component.tsx:55`–`:77`).

**List-block nuance** (`Component.tsx:30`): if `text` is entirely bullet lines (every non-empty line starts with `- `, per `isListBlock` in `packages/viz-engine/src/lib/inlineMarkdown.tsx:62`), the module renders a `<ul class="list-disc">` instead of a single paragraph, and **drops the curly-quote ornaments** — wrapping a bulleted list in “…” would read as a typo. The `<blockquote>` element still carries the semantic "quotation" meaning. Each item is passed through `formatInlineMarkdown`, with the leading `- ` stripped by `getListItems` (`inlineMarkdown.tsx:69`).

**Attribution** renders only when truthy, as a `<cite>` with `font-mono mt-4 not-italic uppercase tracking-[0.15em]`, color `var(--color-muted)`, size `0.75rem`, prefixed with `— ` (`Component.tsx:80`).

No quote-specific portrait handling exists in the component itself; portrait tuning is done via `style.portrait` on the layer (e.g. widening the box on mobile). Because the text is capped at `32ch` and vertically centered, long quotes wrap rather than scroll — keep pull quotes short for portrait snaps.

### Complete YAML example

Real usage from `apps/vizmaya-fyi/content/stories/money-in-politics-2026.config.yaml` (the Gilens & Page unit), where the quote is paired with a `bodyText` body in a `text-left-quote-right` layout:

```yaml
- id: research-found
  kind: quote
  text: "What the research found"
  paragraphs: [0, 1]
  layout: text-left-quote-right
  foreground:
    - type: bodyText
      from: text
      style:
        position: { x: left, y: center }
        size: { width: "42%" }
    - type: quote
      text: "Economic elites and organized groups representing business interests have substantial independent impacts on U.S. government policy, while mass-based interest groups and average citizens have little or no independent influence."
      attribution: "Gilens & Page, Perspectives on Politics (Cambridge University Press), 2014 — influential, but contested"
      style:
        position: { x: right, y: center }
        size: { width: "46%" }
```

A minimal centered quote with no attribution and a panel frame:

```yaml
foreground:
  - type: quote
    text: "Move fast and *fix* things."
    align: center
    style:
      position: { x: center, y: center }
      size: { width: "60%" }
      panel:
        background: "color-mix(in oklch, var(--color-surface) 70%, transparent)"
        borderRadius: "0.75rem"
        padding: "2rem"
        backdropBlur: "8px"
```

A list-shaped quote (renders a bulleted `<ul>`, no curly quotes), placed in the right region:

```yaml
foreground:
  - type: quote
    text: |-
      - Donor concentration up 3x since 2010
      - Small-dollar share flat
      - Dark-money disclosure still optional
    attribution: "FEC filings, 2010–2024"
    align: right
    style:
      position: { x: right, y: center }
      size: { width: "46%" }
```

---

## Module: keyValue

The `keyValue` module renders a two-column definition list — a stack of key/value pairs, each with an optional themed value color and an optional list title. It is the deck-format definition list, typically used for closing summaries ("three theses, one ticker") or sidebar fact panels paired with a `bigStat` or `bodyText` layer.

Source: `packages/viz-engine/src/modules/keyValue/index.ts`, `packages/viz-engine/src/modules/keyValue/Component.tsx`.

### Identity

| Property | Value | Source |
| --- | --- | --- |
| `type` | `keyValue` | `index.ts` line 62 |
| `label` | `Key/value list` | `index.ts` line 63 |
| `slots` | `['foreground']` | `index.ts` line 64 |

The module lists only the `foreground` slot — it can never be placed in a `background:` stack. The slot type is `VizSlot = 'foreground' | 'background'` (`packages/viz-engine/src/types.ts` line 3). Any region whose `accepts` allowlist omits `keyValue`, or any background placement, is rejected by the layout's per-region gate (not by the module itself).

### Config shape

The full parsed config (`KeyValueLayerConfig`, `index.ts` lines 18-24) is produced by `parseConfig` (`index.ts` lines 26-59). The shape after parsing:

| Option | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `type` | `'keyValue'` | — | yes (set by layer dispatch) | Module discriminator. Always emitted as `'keyValue'` on the parsed object. |
| `title` | `string` | `undefined` (no title rendered) | no | Optional label rendered above the list, in mono/uppercase accent styling. Trimmed; a non-string value is dropped to `undefined`. |
| `items` | `KeyValueItem[]` | — | **yes** | The key/value rows. Must be a non-empty array of **1–12** entries. |

#### `items[]` entry (`KeyValueItem`, `index.ts` lines 4-9)

Each item is parsed and trimmed individually (`index.ts` lines 37-53):

| Option | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `key` | `string` | — | **yes** | The left-column term (`<dt>`). Must be a non-empty string after trimming; rendered mono/uppercase in the muted color. |
| `value` | `string` | — | **yes** | The right-column definition (`<dd>`). Must be a non-empty string after trimming. Rendered serif. Supports inline markdown and bullet-list syntax (see below). |
| `color` | `StatColor` | `undefined` → falls back to `var(--color-text)` | no | Theme token applied to the value's text color. Not validated by `parseConfig` — passed through as-is (`obj.color as StatColor | undefined`). An unknown token resolves to a missing CSS variable and falls back to the browser default rather than throwing. |

#### `StatColor` tokens

`color` is typed as `StatColor` (`packages/viz-engine/src/lib/storyConfig.types.ts` lines 298-305). The accepted accent tokens are:

`accent` · `accent2` · `red` · `positive` · `amber` · `teal` · `muted`

The component maps a token to `var(--color-<token>)`, and `undefined` to `var(--color-text)` (`Component.tsx` lines 9-11). Note that the base palette tokens `background` / `surface` / `text` are intentionally excluded from `StatColor` — they don't read as a foreground accent — though `text` is what an omitted `color` falls back to anyway.

#### Validation errors

`parseConfig` throws (with the layer's `ctx.label` prefix) when:

- the layer config is not an object — `keyValue layer must be an object` (line 28).
- `items` is missing, not an array, or empty — `keyValue 'items' must be a non-empty array` (line 32).
- `items` has more than 12 entries — `keyValue 'items' may contain at most 12 entries` (line 35).
- any item is not an object — `keyValue item <i> must be an object` (line 39).
- any item's `key` is missing/blank — `keyValue item <i> 'key' is required` (line 43).
- any item's `value` is missing/blank — `keyValue item <i> 'value' is required` (line 46).

### Value markdown and list rendering

The `value` string is not plain text. `Component.tsx` (lines 66-74) routes it through the shared engine helpers in `packages/viz-engine/src/lib/inlineMarkdown.tsx`:

- **Inline markdown** — `formatInlineMarkdown` (lines 11-51) supports `**bold**` (rendered in mono/bold with the accent color) and `*italic*` (rendered as `<em>`). All other text passes through verbatim.
- **Bullet lists** — if the value `isListBlock` (every non-empty line begins with `- `, lines 62-66), it is rendered as a `<ul class="list-disc">` and each line's leading `- ` is stripped via `getListItems` (lines 69-74), with inline markdown applied per item. Because YAML scalars are single strings, a multi-line list value must use a block scalar (`|`) so the newlines survive.

The `key` (`<dt>`) is rendered as a plain string — no markdown processing.

### defaultStyle (panel chrome)

```ts
defaultStyle: { pointerEvents: 'none' }
```

(`index.ts` line 69.) The module ships a single style default: `pointerEvents: 'none'`, so the list never intercepts clicks/scroll meant for the layer behind it. It deliberately ships **no `panel`** — unlike the text module, a keyValue layer is frameless (no card background, border, radius, padding, blur, or shadow) by default and reads as bare typography over the section background.

`defaultStyle` is merged shallowly **per field** under any `style` the author sets on the layer (`VizModule.defaultStyle` docs, `types.ts` lines 175-182): setting `style.position` or `style.panel` in YAML overrides only those fields while leaving `pointerEvents: 'none'` intact unless the author explicitly sets `style.pointerEvents: auto`. To give the list a card frame, set `style.panel` (a `VizLayerPanel`: `background`, `border`, `borderRadius`, `padding`, `backdropBlur`, `shadow` — `types.ts` lines 65-78).

The full layer `style` vocabulary (`VizLayerStyle`, `types.ts` lines 80-96) applies: `position.{x,y}`, `size.{width,height}`, `opacity`, `blendMode`, `pointerEvents`, `zIndex`, `panel`, and a `portrait` override block.

### Lifecycle metadata

| Module field | Value | Notes |
| --- | --- | --- |
| `readinessProfile` | `'instant'` | `index.ts` line 67. The component calls `noteReady()` immediately in a mount-effect (`Component.tsx` lines 17-19) — there are no async tiles to settle. |
| `mountingMode` | *(unset)* | Defaults to `'per-unit'` (`types.ts` lines 157, 167-168). Foreground layers always mount per-unit; the comment at `index.ts` line 68 notes keyValue layers "remount cheaply per region." |
| `stableIdentity` | *(unset)* | None defined. With no stable identity the slot remounts the component cheaply per region/unit (`index.ts` line 68) rather than persisting one instance. |
| `collectAssetKeys` | *(unset)* | The module references no assets (no images/video/charts), so it contributes nothing to the story's asset manifest. |
| `loadPersistent` / `introspect` | *(unset)* | Not used; relevant only to `persistent-aggregated` background modules (e.g. map). |
| `regionPreferences` | `['body', 'sidebar']` | `index.ts` line 70. Authoring hint surfaced by the admin form / preview to steer the layer into a `body` or `sidebar` region — **not enforced at runtime** (`types.ts` lines 183-189). The authoritative gate is the layout region's `accepts` allowlist. |

### adminForm fields

`adminForm` (`index.ts` lines 71-74) exposes two fields:

| Field key | `kind` | Label | Required | Notes |
| --- | --- | --- | --- | --- |
| `title` | `text` | `Optional title` | no | Free-text title above the list. |
| `items` | `json` | `Items ([{ key, value, color? }])` | yes | Raw JSON array of `{ key, value, color? }`. The `json` admin-form kind has no per-item form; authors edit the array as JSON. |

The admin form does not expose `color` per item as its own control — it is edited inline within the `items` JSON. (`AdminFormField` kinds are defined at `types.ts` lines 135-142.)

### Layout / portrait nuances

- The component fills its wrapper: `w-full h-full flex flex-col justify-center` (`Component.tsx` line 22) — the list is vertically centered within whatever box the layer's `style.position` / `style.size` (or the region) defines.
- The list grid uses `grid-template-columns: auto 1fr` (`Component.tsx` line 34) with a `gap: 0.75rem` (`gap-3`): the key column sizes to its content, the value column takes the remaining width.
- Type scale is fixed in the component: title `0.75rem` mono/uppercase accent; key `0.75rem` mono/uppercase muted; value `1rem` serif at `line-height: 1.45`. There is no `textStyle` option — size/color of the body text are not author-tunable beyond the per-item `color` token.
- For portrait, tune placement via `style.portrait` (e.g. drop a sidebar list on mobile with `portrait: { opacity: 0 }`, or restack it). In the real stories below, the keyValue layer is paired side-by-side with another layer on landscape; on portrait the deck "free" layout's `stackOnPortrait` flow restacks slots vertically (`types.ts` lines 40-48).

### Complete YAML examples

A sidebar summary list paired with a `bodyText` layer, from `apps/vizmaya-fyi/content/stories/spacex-ipo-2026.config.yaml` (around line 440):

```yaml
foreground:
  - type: bodyText
    from: text
    style:
      position: { x: left, y: center }
      size: { width: "50%" }
  - type: keyValue
    title: "Three theses, one ticker"
    items:
      - { key: "Connectivity", value: "Profitable broadband near-monopoly", color: accent2 }
      - { key: "Space",        value: "Option premium on Starship & the lunar economy", color: amber }
      - { key: "AI",           value: "Belief that Grok + X + orbital compute compounds", color: red }
    style:
      position: { x: right, y: center }
      size: { width: "32%" }
```

A closing section pairing a `bigStat` with a four-row corrections list, from `apps/vizmaya-fyi/content/stories/money-in-politics-2026.config.yaml` (around line 292):

```yaml
- id: maine-vote
  kind: closing
  text: "When the people get a vote"
  layout: free
  foreground:
    - type: bigStat
      value: "74.9%"
      label: "Voted to ban super PACs · Maine ballot initiative, 2024"
      color: accent2
      style:
        position: { x: left, y: center }
        size: { width: "40%" }
    - type: keyValue
      title: "Four figures, corrected"
      items:
        - { key: "Lobbying", value: "$4.4B in 2024 — not $5.24B in 2025", color: accent2 }
        - { key: "Trump self-funding", value: "~$66M — not $56M", color: amber }
        - { key: "Dark money", value: "~$1.9B in 2024 / $4.3B+ since 2010", color: red }
        - { key: "Revolving door", value: "866 is LegiStorm's — members + staffers", color: teal }
      style:
        position: { x: right, y: center }
        size: { width: "46%" }
```

A list using inline markdown and a bulleted value (illustrative — uses the value-parsing path in `Component.tsx` lines 66-74; the bullet value must be a YAML block scalar so newlines survive):

```yaml
- type: keyValue
  title: "What changed"
  items:
    - key: "Verdict"
      value: "Reversed on appeal — **narrowly**"
      color: positive
    - key: "Open questions"
      value: |
        - Standing for *future* plaintiffs
        - Whether the rule survives en banc review
      color: muted
```

---

## Module: imageGrid

The `imageGrid` module renders a responsive 2-to-6 image mosaic — the deck-format gallery layer. It is a **foreground-only** layer: a count-driven CSS grid of `<img>` cells with an optional grid caption and optional per-image `alt`/`caption` metadata. Source: `packages/viz-engine/src/modules/imageGrid/index.ts` and `packages/viz-engine/src/modules/imageGrid/Component.tsx`.

There is **no `sample.ts`** for this module, and it is not exercised by any real layer block in `apps/vizmaya-fyi/content/stories` (it appears only in the viz-type menu comment of `spacex-ipo-2026.config.yaml`). The YAML examples below are derived directly from the parsed schema and follow the same layer/`style` conventions as the `image`/`bigStat` layers in that file.

### Identity & registration

| Property | Value | Source |
| --- | --- | --- |
| `type` | `imageGrid` | `index.ts` line 62 |
| `label` | `Image grid` | `index.ts` line 63 |
| `slots` | `['foreground']` | `index.ts` line 64 |
| `mountingMode` | *(unset)* — inherits the registry default `per-unit` | not set in `index.ts`; default per `VizMountingMode` in `packages/viz-engine/src/types.ts` |
| `readinessProfile` | `first-paint` | `index.ts` line 69 |
| `regionPreferences` | *(unset)* | not set |
| `introspect` | *(unset)* | not set |
| `collectAssetKeys` | *(unset)* | not set — see [Asset resolution](#asset-resolution) |
| `loadPersistent` | *(unset)* | not set (only relevant to `persistent-aggregated` modules) |

Because it lists only `foreground` in `slots`, `imageGrid` can be dropped into any foreground region whose layout does not restrict `accepts`, but it **cannot** be used in a `background:` stack. The lazy component is loaded via `load: () => import('./Component')` (`index.ts` line 66).

### Config shape (parseConfig)

The parser is `parseConfig(raw, ctx)` (`index.ts` lines 28–59). It throws on a non-object root, validates the `items` array length (2–6 inclusive), and validates each item's `src`. The fully parsed `ImageGridLayerConfig` is:

| Option | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `type` | `'imageGrid'` literal | — | Yes | Discriminator selecting this module. Always emitted as `'imageGrid'` by the parser (`index.ts` line 54). |
| `items` | `ImageGridItem[]` (2–6 entries) | — | **Yes** | The images. Must be an array with **at least 2** and **at most 6** entries, or `parseConfig` throws `imageGrid 'items' must contain at least 2 entries` / `… may contain at most 6 entries` (`index.ts` lines 33–38). |
| `caption` | `string` | `undefined` | No | Caption rendered in a `<figcaption>` below the whole grid. Non-string values are coerced to `undefined` (`index.ts` line 56). |
| `fit` | `'cover' \| 'contain'` | `'cover'` | No | CSS `object-fit` applied to **every** image. Only the exact string `'contain'` selects contain; **any other value (including invalid strings) falls back to `'cover'`** (`index.ts` line 57). |

#### `ImageGridItem` (each entry of `items`)

Parsed per-item at `index.ts` lines 39–52. A non-object item throws `imageGrid item <i> must be an object`.

| Option | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `src` | `string` (non-empty after trim) | — | **Yes** | Image reference. Must be a non-empty string or `parseConfig` throws `imageGrid item <i> 'src' is required` (`index.ts` lines 44–46). The value is trimmed (`index.ts` line 48) and then passed through `resolveAssetUrl` at render time. |
| `alt` | `string` | `undefined` | No | Alt text for the `<img>`. Non-string values become `undefined` (`index.ts` line 49). Rendered as `alt=""` when absent (`Component.tsx` line 153). |
| `caption` | `string` | `undefined` | No | **Parsed and retained but currently not rendered** — the per-item `caption` is read by `parseConfig` (`index.ts` line 50) but `Component.tsx`'s `ImageCell` never displays it. Only the top-level grid `caption` is rendered. |

### Layout: count-driven grid template

The grid template is chosen purely by `items.length` in `gridTemplate(count)` (`Component.tsx` lines 12–43). The wrapper is a `<figure>` (flex column, `gap: 0.75rem`, `margin: 0`) holding a flex-grow `grid` and the optional caption.

| Item count | `grid-template-columns` | `grid-template-rows` | Notes |
| --- | --- | --- | --- |
| 2 | `1fr 1fr` | `1fr` | 2×1 row. |
| 3 | `1fr 1fr 1fr` | `1fr` | 3×1 row. |
| 4 | `1fr 1fr` | `1fr 1fr` | 2×2. |
| 5 | `1fr 1fr 1fr` | `1fr 1fr` | 3-on-top, 2-on-bottom. Explicit per-cell `grid-area` placements `['1/1/2/2','1/2/2/3','1/3/2/4','2/1/3/3','2/3/3/4']` place the bottom two cells, the 4th spanning two columns for a centred feel (`Component.tsx` lines 25–37). |
| 6 | `1fr 1fr 1fr` | `1fr 1fr` | 3×2. |
| other (0/1/>6 — unreachable post-parse) | `1fr` | `1fr` | Defensive fallback (`Component.tsx` lines 40–41). |

Each cell is a `div.relative.overflow-hidden` with `border-radius: 6px` and a tinted placeholder background `rgb(var(--color-panel-rgb) / 0.2)` (visible while the image loads). The grid gap is `0.5rem`. The `<img>` fills the cell (`width/height: 100%`), uses the configured `objectFit`, and is `draggable={false}` (`Component.tsx` lines 140–164).

### Caption rendering

When the top-level `caption` is set, it renders as a `<figcaption>` styled with `font-mono`, centred, `color: var(--color-muted)`, `font-size: 0.7rem`, `letter-spacing: 0.05em` (`Component.tsx` lines 98–109). The caption uses theme CSS variables, so its color tracks the active vertical/story theme.

### Readiness behavior

`readinessProfile: 'first-paint'` (`index.ts` line 69) means the slot does not signal ready until the component calls `noteReady()`. The component counts image settles: each `<img>` fires on either `onLoad` or `onError`, and once **every** image has settled (`settled.current >= total`) it calls `noteReady()` exactly once (`Component.tsx` lines 54–60). Cached images that complete before React attaches handlers are caught by an effect checking `img.complete` (`Component.tsx` lines 135–138). A defensive effect signals immediately if `total === 0` (`Component.tsx` lines 65–70), though `parseConfig` already guarantees ≥2. This makes the module safe for headless PDF/capture: capture waits for the full mosaic to settle.

### Stable identity

`stableIdentity` derives a key from the joined image `src` list, truncated to 96 chars (`index.ts` line 71):

```
imageGrid:<src1>|<src2>|…  (first 96 chars)
```

Two foreground layers with the same first-96-chars `src` list share a rendered instance. (Note: `stableIdentity` is primarily used by the background slot to dedupe `persistent-aggregated` instances; for a per-unit foreground layer it acts as a stable React/identity key.)

### Default style & panel chrome

| Field | Value | Source |
| --- | --- | --- |
| `defaultStyle` | `{ pointerEvents: 'none' }` | `index.ts` line 72 |

The only module default is `pointerEvents: 'none'` — the grid is non-interactive by default (images aren't clickable/draggable). It ships **no default `panel`** chrome: unlike the text module, an `imageGrid` layer has a transparent, frameless wrapper unless the author sets `style.panel`. Module `defaultStyle` is shallow-merged per-field under any author `style` (see `VizModule.defaultStyle` docs in `packages/viz-engine/src/types.ts`), so setting `style.pointerEvents: auto` in YAML re-enables pointer events while leaving everything else default.

All standard `VizLayerStyle` fields apply to an `imageGrid` layer (`packages/viz-engine/src/types.ts` lines 80–96): `position`, `size`, `opacity`, `blendMode`, `pointerEvents`, `zIndex`, `panel` (`background`/`border`/`borderRadius`/`padding`/`backdropBlur`/`shadow`), and a `portrait` override block.

#### Portrait / style nuances

- The grid layout is **fixed by item count regardless of orientation** — there is no built-in portrait restack of the mosaic itself. A 3-across grid stays 3-across on mobile and will compress each cell narrow. To adapt on portrait, use the layer-level `style.portrait` override (e.g. set a taller `size.height`) rather than expecting the module to relayout. For mobile readability, prefer 2- or 4-item grids on tall sections.
- Cell background and caption color use theme vars (`--color-panel-rgb`, `--color-muted`), so the grid auto-adapts to dark/light verticals.
- Because there is no panel chrome by default, the grid sits directly on the section background. Add `style.panel` if you want a card frame.

### Admin form

`adminForm()` returns three fields (`index.ts` lines 73–85), shapes per `AdminFormField` in `packages/viz-engine/src/types.ts`:

| Field key | Kind | Label | Required | Notes |
| --- | --- | --- | --- | --- |
| `items` | `json` | `Items ([{ src, alt?, caption? }])` | **Yes** | Raw JSON array of `{ src, alt?, caption? }`. |
| `caption` | `text` | `Caption` | No | Grid caption. |
| `fit` | `select` | `Fit` | No | Options: `cover` → "Cover (crop to fill)", `contain` → "Contain (no crop)". |

The admin form does **not** surface a dedicated picker for per-item `alt`/`caption`; those are authored inside the `items` JSON.

### Asset resolution

Each item `src` is passed through `resolveAssetUrl(item.src)` at render (`Component.tsx` line 152; helper at `packages/viz-engine/src/lib/assetUrl.ts`). Supported `src` shapes:

- `assets://<key>` → resolved to `<NEXT_PUBLIC_SUPABASE_URL>/storage/v1/object/public/story-assets/<key>` (requires `NEXT_PUBLIC_SUPABASE_URL`).
- `https://…` / `http://…` → passed through unchanged.
- `/anything` → passed through unchanged (same-origin public path, e.g. `/content/stories/<slug>/images/foo.webp`).

The module does **not** define `collectAssetKeys`, so its images are not enumerated by the asset-key collector used for pre-warming/manifest purposes — only render-time resolution applies.

### Example YAML

A 4-image mosaic as a foreground layer (modeled on the foreground-layer conventions in `apps/vizmaya-fyi/content/stories/spacex-ipo-2026.config.yaml`):

```yaml
foreground:
  - type: imageGrid
    fit: cover                       # default; 'contain' to avoid cropping
    caption: "Falcon 9 booster recoveries, 2024"
    items:
      - src: /content/stories/spacex-ipo-2026/images/recovery-01.webp
        alt: "Booster touchdown on droneship at dusk"
      - src: /content/stories/spacex-ipo-2026/images/recovery-02.webp
        alt: "Static fire on the pad"
      - src: assets://spacex-ipo-2026/recovery-03.webp
        alt: "Fairing catch net"
      - src: https://cdn.example.com/spacex/recovery-04.webp
        alt: "Stacked Starlink payload"
    style:
      position: { x: center, y: center }
      size: { width: "100%", height: "70vh" }
      portrait:
        size: { height: "48vh" }     # shrink the mosaic on mobile
```

A 2-up contain grid with a card frame and pointer events re-enabled:

```yaml
foreground:
  - type: imageGrid
    fit: contain
    items:
      - { src: assets://demo/before.png, alt: "Before" }
      - { src: assets://demo/after.png, alt: "After" }
    style:
      pointerEvents: auto            # override defaultStyle pointerEvents:none
      panel:
        background: "rgb(var(--color-panel-rgb) / 0.4)"
        border: "1px solid var(--color-line)"
        borderRadius: "8px"
        padding: "1rem"
        backdropBlur: "12px"
```

### Validation errors (authoring reference)

`parseConfig` throws (prefixed with the layer's `ctx.label`) in these cases:

- Root is not an object → `imageGrid layer must be an object`.
- `items` missing/not an array or fewer than 2 → `imageGrid 'items' must contain at least 2 entries`.
- `items` has more than 6 → `imageGrid 'items' may contain at most 6 entries`.
- An item is not an object → `imageGrid item <i> must be an object`.
- An item's `src` is missing/empty/non-string → `imageGrid item <i> 'src' is required`.

---

## Module: `table`

The `table` module is the deck-format **data table** layer. It renders a plain HTML `<table>` (header row + body rows) from an array of row objects plus a column schema, with per-column number / currency / percent formatting so authors write **raw numbers** in YAML and let the module format them at render time. An optional caption renders beneath the table.

Source: `packages/viz-engine/src/modules/table/index.ts` (config + module descriptor) and `packages/viz-engine/src/modules/table/Component.tsx` (the renderer). The module is registered in the core registry at `packages/viz-engine/src/modules/../registry.ts` (`packages/viz-engine/src/registry.ts`, imported as `tableModule` and added to the default registry array).

> There is **no** `sample.ts` for this module (`packages/viz-engine/src/modules/table/sample.ts` does not exist), and no shipped story under `apps/vizmaya-fyi/content/stories/*.config.yaml` currently uses `type: table`. It is, however, an officially supported foreground viz-type — the deck schema header comments in `apps/vizmaya-fyi/content/stories/spacex-ipo-2026.config.yaml` list `table` among the valid `foreground:` layers (`chart | image | imageGrid | bigStat | quote | bodyText | mapbox | embed | keyValue | table`). The YAML examples below are constructed from the parser source and modeled on the sibling `keyValue` layer usage in real configs.

### Module descriptor

Defined as `const tableModule: VizModule<TableLayerConfig>` in `packages/viz-engine/src/modules/table/index.ts`.

| Field | Value | Notes |
| --- | --- | --- |
| `type` | `'table'` | The string authors write as `type: table` in a layer. |
| `label` | `'Table'` | Human label (used by the admin form / module picker). |
| `slots` | `['foreground']` | **Foreground only.** It is *not* a valid background layer — drop it into a section's `foreground:` slot (or a foreground layout region). |
| `mountingMode` | *(unset)* | Defaults to `'per-unit'` per `VizMountingMode` in `packages/viz-engine/src/types.ts`. No persistent/aggregated behavior. |
| `readinessProfile` | `'first-paint'` | Tables paint synchronously but can carry many rows, so they are profiled as `first-paint` to let the readiness coordinator give them a frame before being marked ready. |
| `loadPersistent` | *(unset)* | Not a persistent-aggregated module. |
| `introspect` | *(unset)* | No introspection. |
| `collectAssetKeys` | *(unset)* | Table references **no external assets** (all data is inline), so it contributes nothing to asset collection. |
| `stableIdentity` | *(unset)* | Not used (only relevant to persistent-aggregated background modules). |
| `regionPreferences` | *(unset)* | No region hints; the layout's per-region `accepts` allowlist is the authoritative gate (see `ForegroundLayoutRegion.accepts` in `packages/viz-engine/src/types.ts`). |
| `load` | `() => import('./Component')` | Lazy-loads `packages/viz-engine/src/modules/table/Component.tsx`. |

#### `defaultStyle`

```ts
defaultStyle: { pointerEvents: 'none' }
```

The module ships a single default-style field: `pointerEvents: 'none'`. The table is treated as a **non-interactive display element** — it does not capture clicks/scroll, so pointer events fall through to the section beneath (e.g. for scroll-driven decks). This default is merged shallowly, **per-field**, under any `style` the author writes (see `VizModule.defaultStyle` docs in `packages/viz-engine/src/types.ts`): setting `style.pointerEvents: auto` in YAML overrides it, while everything else in `defaultStyle` is left intact.

Note: unlike the `text` module, the table module ships **no** `defaultStyle.panel` — there is no built-in card frame. Any panel chrome (background, border, radius, padding, blur, shadow) must come from the deck/section-level `panel:` default or a per-layer `style.panel` override. See [Panel chrome & styling](#panel-chrome--styling).

### Config shape (`TableLayerConfig`)

The TypeScript interface (`packages/viz-engine/src/modules/table/index.ts`):

```ts
interface TableLayerConfig {
  type: 'table'
  columns: TableColumn[]
  rows: Record<string, unknown>[]
  caption?: string
}
```

Parsing is done by `parseConfig(raw, ctx)` in the same file. It is strict: the raw layer must be an object, `columns` must be a **non-empty array**, and `rows` must be an array (it may be empty). Each column is validated individually.

#### Top-level fields

| Option | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `type` | `'table'` | — | **Yes** | Selects this module. Written as `type: table`. |
| `columns` | `TableColumn[]` | — | **Yes** | Column schema (header + per-cell formatting). Must be a **non-empty array**; an empty or non-array value throws `"<label>: table 'columns' must be a non-empty array"`. Each entry is validated (see below). |
| `rows` | `Record<string, unknown>[]` | — | **Yes** | Array of row objects. Each object's keys are matched against `columns[].key` to pull cell values. A non-array throws `"<label>: table 'rows' must be an array"`. **May be empty** (renders header only). Rows are **not** otherwise validated or coerced — any object shape is accepted; missing keys render as empty cells. |
| `caption` | `string` | `undefined` | No | Optional caption text rendered in a monospace, centered `<figcaption>` below the table. A non-string value is dropped (coerced to `undefined`). |

#### Column fields (`TableColumn`)

Each entry in `columns` is validated by `parseConfig`. A non-object column throws `"<label>: table column <i> must be an object"`; a missing/blank `key` throws `"<label>: table column <i> 'key' is required"`. `key` is `.trim()`-ed during parse.

| Option | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `key` | `string` | — | **Yes** | The property name read from each row object for this column's cells. Must be a non-empty string (trimmed). |
| `label` | `string` | falls back to `key` | No | Header label. If omitted (or non-string), the column header renders the raw `key` (`col.label ?? col.key` in `Component.tsx`). |
| `align` | `'left' \| 'center' \| 'right'` | derived from `format` | No | Cell + header text alignment. If omitted, alignment is **inferred**: numeric formats (`number`, `currency`, `percent`) align `right`; everything else aligns `left` (`resolveAlign()` in `Component.tsx`). Note: the parser does not validate the enum — any string is passed through to CSS `text-align`. |
| `format` | `'text' \| 'number' \| 'currency' \| 'percent'` | `'text'` | No | How each cell value is formatted. `parseConfig` defaults this to `'text'` when omitted. See formatting semantics below. |
| `decimals` | `number` | `0` (applied at render) | No | Decimal places for `number` / `currency` / `percent`. Parsed only if a `number`; otherwise stored as `undefined` and the renderer falls back to `0` (`col.decimals ?? 0`). Sets both `minimumFractionDigits` and `maximumFractionDigits`. |
| `currency` | `string` | `'USD'` (applied at render) | No | ISO currency code used when `format: currency`. Parsed only if a `string`; otherwise `undefined`, and the renderer falls back to `'USD'` (`col.currency ?? 'USD'`). |

##### Cell formatting semantics (`formatCell` in `Component.tsx`)

- `null` / `undefined` cell values render as an **empty string**.
- `format: text` renders `String(value)` verbatim (no number coercion).
- For `number` / `currency` / `percent`, the value is coerced via `Number(raw)`. If the result is **not finite** (`NaN`, `Infinity`), the cell falls back to `String(raw)` (the raw value is shown unformatted).
- `number` → `Intl.NumberFormat('en-US')` with `minimumFractionDigits = maximumFractionDigits = decimals`.
- `currency` → `Intl.NumberFormat('en-US', { style: 'currency', currency, … })`.
- `percent` → `Intl.NumberFormat('en-US', { style: 'percent', … })`. **Note:** `Intl` percent multiplies by 100, so a raw value of `0.42` renders as `42%`. Author the underlying fraction, not the percentage.
- Locale is hard-coded to **`'en-US'`** for all numeric formats — there is no locale option.
- Non-text cells get CSS `font-variant-numeric: tabular-nums` for aligned digits; `text` columns do not.

### `adminForm` fields

`adminForm()` (in `index.ts`) returns three fields for the admin authoring UI (field kinds are defined by `AdminFormField` in `packages/viz-engine/src/types.ts`):

| Field key | Kind | Label | Required | Notes |
| --- | --- | --- | --- | --- |
| `columns` | `json` | `Columns ([{key,label,align,format,decimals,currency}])` | **Yes** | Raw JSON array of column descriptors. |
| `rows` | `json` | `Rows (array of objects)` | **Yes** | Raw JSON array of row objects. |
| `caption` | `text` | `Caption` | No | Plain text caption. |

The admin form does not expose per-column sub-fields individually — `columns` and `rows` are authored as raw JSON blobs. It receives no `config` argument it depends on (the closure ignores its `config | null` parameter), so the field list is static.

### Rendering & style notes

The component (`Component.tsx`) renders a `<figure>` (`w-full h-full flex flex-col`, vertically centered, `gap: 0.5rem`) containing a scroll-capable wrapper (`overflow: auto`) around a full-width `<table>` (`border-collapse`, `font-size: 0.85rem`, sans-serif). Header cells are uppercase, letter-spaced, `0.7rem`, weight 600. It calls `noteReady()` once on mount (via `useEffect`) — readiness fires immediately on first paint.

#### Theming & print mode

Colors are driven by theme CSS variables in normal modes and overridden in print:

| Element | Normal (`scroll`/`autoplay`/`capture`) | `mode: 'print'` |
| --- | --- | --- |
| Body text color | `var(--color-text)` | `#111` (black-on-white) |
| Header / caption / muted | `var(--color-muted)` | `#555` |
| Row/header borders | `rgba(255,255,255,0.10)` | `#ddd` |

The print overrides force legible black-on-white for PDF/print capture. There are no other per-mode behaviors; `activeStep`, `isActive`, `unitKey`, and `captureRef` are accepted but unused by this module.

#### Panel chrome & styling

Because the module ships no `defaultStyle.panel`, the table sits directly on whatever is behind it. To give it a card frame, set `style.panel` on the layer (fields forwarded straight to CSS — see `VizLayerPanel` in `packages/viz-engine/src/types.ts`: `background`, `border`, `borderRadius`, `padding`, `backdropBlur`, `shadow`). A deck-level `panel:` default (as in `apps/vizmaya-fyi/content/stories/money-in-politics-2026.config.yaml`) is shared by all foreground slots, so the table inherits any frosted-glass default unless you override per-layer.

The full `VizLayerStyle` vocabulary applies (`position`, `size`, `opacity`, `blendMode`, `pointerEvents`, `zIndex`, `panel`, plus a `portrait` override block). Since `defaultStyle.pointerEvents` is `'none'`, set `style.pointerEvents: auto` if you want the inner `overflow: auto` wrapper to be scrollable by the reader on a long table.

#### Portrait / mobile nuances

- The table has **no internal portrait variant** — there is no `portrait` config field on `TableLayerConfig`. Mobile adaptation is purely via `style.portrait` (shallow-merged when `useIsMobile()` is true; see `VizLayerStyle.portrait` in `packages/viz-engine/src/types.ts`), e.g. `portrait: { size: { width: "92%" } }`.
- Wide tables can overflow horizontally on portrait. The renderer wraps the table in `overflow: auto`, but with the module default `pointerEvents: 'none'` that scroll is not user-driven — prefer fewer columns on mobile (or a `style.portrait` width/opacity tweak), since portrait deck snaps clip rather than scroll within a slot.

### Complete YAML example

A realistic foreground layer (a section with a no-op background and a single table foreground), positioned and given a panel frame, modeled on the sibling `keyValue` usage in `apps/vizmaya-fyi/content/stories/money-in-politics-2026.config.yaml`:

```yaml
- id: launch-economics
  text: "The unit economics"
  layout: free
  background:
    type: none
  foreground:
    - type: table
      caption: "Source: company filings, 2026"
      columns:
        - { key: vehicle, label: "Vehicle" }                              # text → left-aligned
        - { key: flights, label: "Flights", format: number }              # numeric → right-aligned, 0 dp
        - { key: cost,    label: "Cost / kg", format: currency, currency: USD, decimals: 0 }
        - { key: reuse,   label: "Reuse rate", format: percent, decimals: 1 }  # 0.92 → "92.0%"
      rows:
        - { vehicle: "Falcon 9",   flights: 96, cost: 2720, reuse: 0.92 }
        - { vehicle: "Falcon Heavy", flights: 11, cost: 1500, reuse: 0.83 }
        - { vehicle: "Starship",   flights: 4,  cost: 200,  reuse: 0.50 }
      style:
        position: { x: center, y: center }
        size: { width: "60%" }
        pointerEvents: auto          # opt back in so a long table can scroll
        panel:
          background: "rgba(10,14,24,0.62)"
          border: "1px solid rgba(120,140,180,0.20)"
          borderRadius: "20px"
          padding: "24px"
          backdropBlur: "14px"
        portrait:
          size: { width: "94%" }     # widen the card on mobile
```

Minimal form (single column required, default `text` format, no caption, header falls back to `key`):

```yaml
foreground:
  - type: table
    columns:
      - { key: metric }       # no label → header reads "metric"
      - { key: value }
    rows:
      - { metric: "Revenue", value: "$1.2B" }
      - { metric: "Margin", value: "31%" }
```

---

## Share-card render mode

Share mode is a fourth render target for a story (alongside the interactive scroll story, the video render, and the PDF/report render). It turns each section of a story into one or more downloadable PNG **social cards** sized for a chosen aspect ratio. The page lives at `apps/vizmaya-fyi/app/story/[slug]/share/page.tsx` (`/story/<slug>/share`), and every card is composed client-side and rasterized with `html-to-image` (`toPng`) inside `apps/vizmaya-fyi/components/share/ShareCard.tsx`.

Two layers feed a share card:

1. **The story's own config** — the resolved units from `<slug>.config.yaml` (sections, headings, paragraphs, map cameras, pins, regions, foreground viz). This is the base; share mode reuses the *same* viz-engine slot resolution (`resolveSlotsFlat`) so any registered viz module shows up on a card, not just the legacy `chart:` field.
2. **An optional `<slug>.share.yaml`** — a thin per-section / per-subsection / per-aspect override file, parsed into a `ShareConfig` (`packages/viz-engine/src/lib/storyConfig.types.ts`). Everything in it is optional; unset fields fall through to the story config. When no `.share.yaml` exists, share mode still renders cards straight from the story config.

The loader `loadShareConfig(slug)` (`packages/content-source/src/storyConfig.ts`) is lenient: it parses the YAML, keeps `logo` only if it is a string, and defaults `sections` to `{}` when absent. A missing file returns `null` and the page renders the un-overridden units.

### How a story becomes cards

`resolveUnits(slug, story.sections, config)` returns three things consumed by the page (`app/story/[slug]/share/page.tsx`): `units` (desktop units), `shareUnits` (units pre-split by `shareParagraphs`), and `hasShareOverrides`. The page feeds `shareUnits` to the shell when share overrides exist, otherwise the plain `units`.

`buildCardList()` in `apps/vizmaya-fyi/components/share/ShareShell.tsx` then walks the units in order and emits an ordered list of cards. Per parent section:

- A **map-title** card is emitted for the *first* unit of each parent section, and additionally for any later subsection that declares its own `map` override (so a zoomed-in subsection gets its own framed map card). The `seenParentsForMap` set guards the once-per-parent rule.
- A **graph** card is emitted per unit when the section's resolved foreground stack contains a non-`text` viz layer (chart, image, video, embed, rive, or a vertical module like `fs:match-card` / `f1:race-row`). Text foreground layers are deliberately skipped — share mode already renders section copy via the text/hero/stat variants, so a `- type: text` layer would duplicate the copy.
- A **content** card (or several). `kind: hero` and `kind: stat` sections render as a single `auto` card unless a split override (`paragraphsOverride` / `shareParagraphs`) is present. `kind: text` sections split one card per paragraph by default; the heading is kept only on the first text card so later cards read as continuations, whereas hero/stat keep their heading (big number / title) on every split card.

`?section=<id>` on the URL scopes the page to a single section (`filterBySection` matches `parentConfig.id` or the synthesized `section-<parentIndex>` slug). The shell also exposes a headless capture API on `window` (`__shareCards__`, `__captureByIndex__`, `__shareReady__`) so the demo/share-render pipeline can drive captures without user input.

### Aspect ratios

The aspect ratio is a global toggle (top-right of the share page) plus a `?ratio=` seed read server-side so first paint and the Playwright capture get the right dimensions. `ShareAspectRatio` (`packages/viz-engine/src/lib/storyConfig.types.ts`) and `AspectRatio` (`apps/vizmaya-fyi/components/share/AspectRatioToggle.tsx`) are the same string union.

| Ratio | Label | DOM render size (px) | Exported PNG (px) | Default zoom delta |
| --- | --- | --- | --- | --- |
| `1:1` | Square | 390 × 390 | 1080 × 1080 | −0.5 |
| `4:5` | Portrait (Instagram) | 390 × 487.5 | 1080 × 1350 | −0.3 |
| `3:4` | Portrait | 390 × 520 | 1080 × 1440 | −0.1 |
| `4:3` | Landscape | 520 × 390 | 1440 × 1080 | −0.5 |

Notes (`ShareCard.tsx`):

- `BASE = 390` drives the DOM size; the card is rasterized at a `pixelRatio` of `output.w / render.w` (≈ 2.77 for the portrait ratios) so text stays crisp at export size.
- The default ratio when `?ratio=` is missing or unrecognized is **`3:4`** (the page accepts `1:1` / `4:5` / `4:3` explicitly and otherwise falls back to `3:4`).
- **Default zoom delta** (`SHARE_ZOOM_DELTA`) is added to the resolved base map zoom for that aspect *unless* a per-aspect `map.ratios.<ratio>.zoom` override is supplied (a per-aspect zoom wins outright, no delta). Cards are much smaller than the live viewport, so pulling the camera back keeps the subject clear of the title overlay.
- Each aspect also has a **focus area** (`SHARE_FOCUS_AREA` in `apps/vizmaya-fyi/components/share/ShareMapBg.tsx`) — Mapbox padding shifts the geographic center into the unobscured part of the card. Portrait/square push the focal point down (below the top caption panel); `4:3` shifts it right because the `4:3` map-title card uses a left-column caption occupying ~1/3 of the width.

### `<slug>.share.yaml` top-level shape (`ShareConfig`)

```yaml
logo: /vizmaya-logo-04.svg   # optional; defaults to /vizmaya-logo-01.svg
sections:
  <section-id>: { ... ShareSectionOverride ... }
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `logo` | `string` | `/vizmaya-logo-01.svg` (`DEFAULT_SHARE_LOGO` in `BrandingFooter.tsx`) | Path under `/public` or absolute URL for the mark in every card's branding footer. The page themes it via `themedLogoDataUrl(shareConfig?.logo, theme)` before passing it to `ShareCard`. Non-string values are dropped by the loader. |
| `sections` | `Record<string, ShareSectionOverride>` | `{}` | Per-section overrides keyed by the section's `id` from the main `.config.yaml`. Sections without an entry render straight from the story config. |

The key of each `sections` entry is the section **`id`** in the main config (not its index). Sections without an `id` in the config can never be overridden via `share.yaml` (the shell's `buildCardList` looks them up by `parentConfig.id`).

### `ShareSectionOverride`

Defined in `packages/viz-engine/src/lib/storyConfig.types.ts`. Every field is optional; an absent field inherits from the story config. Each value is keyed under `sections.<id>`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `heading` | `string` | inherits unit heading | Override the section's bare heading (map-title eyebrow, stat big value, text card eyebrow). Used as a fallback for the per-variant headings below. |
| `subheading` | `string` | inherits unit subheading | Override the section's bare subheading (stat label / map-title sublabel / text subheading). |
| `hide` | `boolean` | `false` | When `true`, the section is skipped entirely in share mode — no cards emitted. |
| `layers` | `ShareLayerVisibility` | inherit | Per-card map-layer toggles (see table). A `false` value suppresses that layer on this section's cards. |
| `chart` | `ShareChartOverride` | inherit | Heading / subheading shown on this section's **graph** card(s). Falls back to a per-subsection `chart` override. |
| `mapTitle` | `ShareHeroOverride` | falls back to `heading`/`subheading`/`hero.dek` | Heading / subheading / dek shown on the **map-title** overlay card(s). `dek` only renders on `kind: hero` sections. |
| `hero` | `ShareHeroOverride` | falls back to `heading`/`subheading` + extracted dek | Title / subheading / dek shown on the standalone **hero** card(s). Falls back to a per-subsection `hero` override. |
| `stat` | `ShareStatOverride` | falls back to joined paragraphs | Description body on the standalone **stat** card(s). Falls back to a per-subsection `stat` override, then to the joined paragraphs. |
| `hidePretext` | `boolean` | `false` | Hide the body `PretextBlock` paragraphs on this section's **text** card(s) — keeps heading/subheading, drops prose. |
| `shareParagraphs` | `Array<number \| [number, number]>` | unset | Slice indices into the section's source paragraphs; each entry becomes one card. `[start, end]` is `Array.slice` semantics (end exclusive); a bare `number n` means `slice(n, n+1)`. |
| `paragraphsOverride` | `Array<string \| string[]>` | unset | Literal replacement paragraphs; each entry is one card (a `string` = one paragraph, a `string[]` = stacked paragraphs). **Takes precedence over `shareParagraphs`** when both are set. Does NOT target subsections — use `subsections` for those. |
| `subsections` | `Record<number, ShareSubsectionOverride>` | unset | Per-subsection overrides keyed by the subsection's 0-based index in the parent's `subsections` array. A present subsection override **takes precedence** over the section-level `paragraphsOverride` / `shareParagraphs` for that unit. |
| `regionLabelCodes` | `string[]` | inherit parent `regions.labels.codes` | Thin patch over the choropleth label allowlist for this section's cards. When defined (even `[]`) it **replaces** the parent's `labels.codes`; the rest of the regions config is inherited. |
| `pinOverrides` | `Record<string, MapPinOverride>` | inherit | Per-pin patches keyed by the pin's `label` text. Each value is merged onto the resolved pin; unmatched pins inherit unchanged. |
| `map` | section map override (see below) | inherit | Per-card camera + layer replacement for this section's map cards, including per-aspect `ratios`. |

#### Section-level `map`

The `map` block on a `ShareSectionOverride` (and on a subsection override) is its own shape — note it differs from the story config's `map` (`center`/`zoom` are optional here, and it gains `ratios`).

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `center` | `[number, number]` | inherit | Base camera center `[lng, lat]` for this section's map cards. |
| `zoom` | `number` | inherit (+ `SHARE_ZOOM_DELTA`) | Base zoom. Unless a per-aspect `ratios.<r>.zoom` is set, the aspect's `SHARE_ZOOM_DELTA` is added on top. |
| `pitch` | `number` | inherit | Camera pitch. |
| `bearing` | `number` | inherit | Camera bearing. |
| `pins` | `MapPinConfig[]` | inherit (union of parent + subsection pins) | Full replacement of the pin set for this card (replaces, does not merge). |
| `regions` | `MapRegionLayer` | inherit | Full choropleth replacement. |
| `heatmap` | `HeatmapLayer` | inherit | Full heatmap replacement. |
| `textLabels` | `MapTextLabel[]` | inherit | Free-floating text labels (not gated by the pins layer toggle). |
| `ratios` | `Partial<Record<ShareAspectRatio, ShareMapAspectOverride>>` | unset | Per-aspect camera framing; see `ShareMapAspectOverride`. |

### `ShareSubsectionOverride`

Keyed under `sections.<id>.subsections.<index>` where `<index>` is the 0-based position in the parent's `subsections` array. Sits between the section-level override and the story config in every cascade. Same field meanings as the section-level override, scoped to one subsection.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `paragraphsOverride` | `Array<string \| string[]>` | unset | Literal replacement paragraphs for this subsection's card(s); one card per entry. Takes precedence over this subsection's `shareParagraphs`. |
| `shareParagraphs` | `Array<number \| [number, number]>` | unset | Slice indices into this subsection's paragraphs; one card per entry. |
| `heading` | `string` | inherit | Heading for this subsection's cards. |
| `subheading` | `string` | inherit | Subheading (stat label / map-title sublabel) for this subsection's cards. |
| `layers` | `ShareLayerVisibility` | inherit (then section, then resolved) | Per-card layer toggles; falsy entries suppress that layer. Resolved as subsection → section. |
| `chart` | `ShareChartOverride` | inherit | Heading / subheading on this subsection's **graph** card. |
| `mapTitle` | `ShareHeroOverride` | falls back to `heading`/`subheading`/`hero.dek` | Heading / subheading / dek on this subsection's **map-title** overlay. `dek` only on `kind: hero`; falls back to `hero.dek`. |
| `hero` | `ShareHeroOverride` | inherit | Title / subheading / dek on this subsection's standalone **hero** card. |
| `stat` | `ShareStatOverride` | inherit | Description body on this subsection's standalone **stat** card; falls back to the joined paragraphs. |
| `hidePretext` | `boolean` | `false` | Hide the body `PretextBlock` on this subsection's **text** card(s). |
| `regionLabelCodes` | `string[]` | inherit | Replace the parent's `regions.labels.codes` allowlist for this card. |
| `pinOverrides` | `Record<string, MapPinOverride>` | inherit | Per-pin patches by label for this card; merged on top of the section-level `pinOverrides`. |
| `map` | subsection map override | inherit | Per-card camera + layers + `ratios` for this subsection (same shape as the section-level `map`). |

### Supporting override types

#### `ShareLayerVisibility`

```yaml
layers:
  pins: true
  regions: true
  heatmap: false
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `pins` | `boolean` | inherit | `false` suppresses the entire pin set on this card. `true`/unset shows it. |
| `regions` | `boolean` | inherit | `false` suppresses the choropleth on this card. |
| `heatmap` | `boolean` | inherit | `false` suppresses the heatmap on this card. |

In `ShareCard.tsx` the effective value is `shareSubOverride?.layers?.<k> ?? shareOverride?.layers?.<k>`; only an explicit `false` suppresses (`undefined`/`true` both show).

#### `ShareChartOverride` (alias `ShareTextOverride`)

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `heading` | `string` | falls back to section/unit heading | Title on the graph card (rendered centered in accent color). |
| `subheading` | `string` | falls back to section/unit subheading | Sub-line under the graph card title. |

#### `ShareHeroOverride` (used by `mapTitle` and `hero`)

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `heading` | `string` | falls back to resolved heading (then story `title` on map-title) | Big title / overlay heading. |
| `subheading` | `string` | falls back to resolved subheading | Supporting line below the heading. |
| `dek` | `string` | falls back to `extractHeroBits(paragraphs).dek` | Paragraph below the title. Only renders on `kind: hero`. On the map-title overlay, `mapTitle.dek` is independent but falls back to `hero.dek`, so one `hero.dek` controls both surfaces. |

#### `ShareStatOverride`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `description` | `string` | falls back to `paragraphs.join(' ')` | Body copy under the stat's big number + label. (The big value and small label come from the section's `heading` / `subheading`, keeping simple stat YAML short.) |

#### `MapPinOverride`

A thin patch over one resolved pin, keyed by the pin's `label` text. Coordinates and label text stay inherited.

```yaml
pinOverrides:
  "Florida · +$21B":
    labelAnchor: bottom
  "Arizona · +$3B":
    labelAnchor: top
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `color` | `string` | inherit | Pin fill / ring color. |
| `radius` | `number` | inherit (scaled ×1.6 for share) | Pin radius before the share-card scale factor. |
| `pulse` | `boolean` | inherit | Pulse animation toggle. |
| `labelAnchor` | `'top' \| 'bottom' \| 'left' \| 'right'` | inherit | Which side of the pin the label sits on — the most common per-aspect tweak to keep labels from clipping. |
| `hidden` | `boolean` | `false` | When `true`, suppress this pin entirely (marker + label) on this card. |

Section-level and subsection-level `pinOverrides` are merged (`{...section, ...subsection}`), so a subsection patch wins per label.

#### `ShareMapAspectOverride` (per-aspect camera under `map.ratios`)

Only framing fields are aspect-specific; pins / regions / heatmap / textLabels are shared across all aspects of a card.

```yaml
map:
  center: [-98.5, 57]
  zoom: 1.8
  pitch: 28
  ratios:
    "4:3":
      center: [-111.1, 57]
      zoom: 2.02
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `center` | `[number, number]` | base `map.center` → story cascade | Aspect-specific center `[lng, lat]`. |
| `zoom` | `number` | base zoom (+ delta) | Aspect-specific zoom. A value here wins outright (the `SHARE_ZOOM_DELTA` is NOT applied on top). |
| `pitch` | `number` | base pitch | Aspect-specific pitch. |
| `bearing` | `number` | base bearing | Aspect-specific bearing. |

### Card variants emitted

`CardVariant` is `'auto' | 'map-title' | 'graph'` (`ShareCard.tsx`); the visual it renders inside `auto` further branches on section `kind`. The five distinct card surfaces:

| Variant rendered | Source kind / condition | Component | Notes |
| --- | --- | --- | --- |
| **map-title** | first unit of each parent (+ any subsection with its own `map`) and a resolved `map.center` | inline overlay in `ShareCard.tsx` + `ShareMapBg` + `MapLegend` | Map background with a heading/subheading/dek caption panel. Portrait/square: top translucent panel. `4:3`: left-column panel (~1/3 width), map fills the right 2/3, legend in the left column. Falls back to story `title` if no heading. |
| **graph** (chart) | section has a non-`text` foreground viz layer | `ForegroundVizSlot` (mode `capture`) inside `ShareCard.tsx` | Renders the resolved foreground stack through the slot dispatcher (any viz module), with optional `chart.heading`/`chart.subheading` above. `activeStep` is the unit's `subIndex` so chart steps animate per card. |
| **hero** | `kind: hero` and a hero heading | `apps/vizmaya-fyi/components/share/ShareHeroCard.tsx` | Large serif title (white) + optional serif dek. |
| **stat** | `kind: stat` and a heading | `apps/vizmaya-fyi/components/share/ShareStatCard.tsx` | Centered giant serif number, optional mono uppercase label (`subheading`), description body. Number color from the section's `color` `StatColor` token. |
| **content** (text) | default fallback (`kind: text`, or hero/stat without their headings) | `apps/vizmaya-fyi/components/share/ShareTextCard.tsx` | Mono uppercase eyebrow (`heading`), serif subheading, body paragraphs laid out with `PretextBlock` (typographic line-breaking via `@chenglou/pretext`). `hidePretext` drops the body. |

Every card also carries the **branding footer** (`apps/vizmaya-fyi/components/share/BrandingFooter.tsx`, exported as `BrandingHeader`) — the logo + "vizmaya" wordmark bottom-left and the story `title` centered. The map background (`ShareMapBg`) is mounted lazily via `IntersectionObserver` to stay under the browser WebGL-context cap, renders with `interactive={false}` + `staticCapture` + `hideAllLabels`, scales pin radii ×1.6 for legibility at 390px, and fires `onReady` so capture waits for the map to go idle before `toPng`.

### Override cascade (resolution order)

`ShareCard.tsx` resolves each field with a fixed precedence. The base map values are read from the resolved background `type: 'map'` layer (`resolveSlotsFlat`), so both legacy `map:` and new `background: [{ type: 'map' }]` syntaxes flow through the same fallback.

- **Heading / subheading**: `shareSubOverride.heading` → `shareOverride.heading` → `unit.heading` (same for subheading).
- **Per-variant text** (`mapTitle`/`hero`/`chart`/`stat`): subsection slot → section slot → the resolved heading/subheading cascade above (or, for `stat.description`, the joined paragraphs; for `hero.dek`, the extracted dek). `??` is used (not `||`) so an explicit `""` renders blank.
- **Camera center**: `sub.map.ratios[ratio].center` → `sub.map.center` → `section.map.ratios[ratio].center` → `section.map.center` → story-subsection `map.center` → resolved base map center.
- **Camera zoom**: a per-ratio `ratios[ratio].zoom` (sub then section) wins outright; otherwise `sub.map.zoom` → `section.map.zoom` → story-subsection zoom → resolved zoom, then `+ SHARE_ZOOM_DELTA[ratio]`.
- **Pitch / bearing**: same chain as center (per-aspect → base sub → per-aspect section → base section → story-subsection → resolved).
- **Regions / heatmap**: `sub.map.*` → `section.map.*` → story-subsection → resolved; then `regionLabelCodes` (sub → section) patches `regions.labels.codes`; then `layers.regions/heatmap === false` nulls the layer.
- **Pins**: first set of `sub.map.pins` → `section.map.pins` → story-subsection pins → (else) the union of parent pins + every subsection's pins, deduped by coordinate. Then `layers.pins === false` empties it, and `pinOverrides` (section then subsection, with `hidden` dropping a pin) patch the survivors.
- **textLabels**: `sub.map.textLabels` → `section.map.textLabels` → story-subsection textLabels → resolved (independent of the pins toggle).
- **hidePretext**: `sub.hidePretext` → `section.hidePretext` → `false`.

### Authoring & editing tooling

The share page ships an in-browser editor (`ShareShell.tsx` + `ShareEditDrawer.tsx`):

- **Visual mode** edits a draft `Record<id, ShareSectionOverride>` per card via a drawer; the preview re-renders live.
- **YAML mode** edits the raw `<slug>.share.yaml` text (comments + `logo` + ordering round-trip). "Insert sample" drops in a fully-populated template built by `buildShareSampleYaml(units)` (`apps/vizmaya-fyi/lib/shareSampleYaml.ts`) — one entry per section with an `id`, pre-filled with the current copy, plus stubbed `layers`, `regionLabelCodes`, `pinOverrides`, `chart`/`mapTitle`/`hero`/`stat`, and `subsections.<index>` slots so authors can see every available knob. "Download" saves the file; "Save" `PUT`s `{ share_yaml }` to admin's `/api/vizmaya/stories/<slug>` with the `edit-story-content` action token.
- **Download All** zips a PNG per card at the active ratio (`<slug>-<n>-<WxH>.png`).

### Realistic `.share.yaml`

Pulled from `apps/vizmaya-fyi/content/stories/american-cost-divide.share.yaml`, showing per-aspect camera framing, a region-label patch, per-pin anchor tweaks, and a blanked map-title heading. (YAML keys like `4:3` parse as strings; quote them to be safe.)

```yaml
sections:
  hero:
    mapTitle:
      heading: ""            # blank the overlay heading on the hero card

  gap-stat:
    map:
      center: [-98.5, 57]
      pitch: 28
      zoom: 1.8
      ratios:
        "4:3":               # landscape re-frames slightly west + tighter
          center: [-111.1, 57]
          zoom: 2.02
    regionLabelCodes:        # replace the inherited choropleth label allowlist
      - Oklahoma

  where-money-going:
    pinOverrides:            # keyed by each pin's label text
      "Florida · +$21B": { labelAnchor: bottom }
      "Arizona · +$3B":  { labelAnchor: top }
      "Tennessee · +$3B": { labelAnchor: bottom }
    map:
      center: [-92.8, 49.8]
      zoom: 2.16
      pitch: 24
      bearing: 17
```

A simpler example (per-subsection literal text rewrite) from `apps/vizmaya-fyi/content/stories/american-economic-divide.share.yaml`:

```yaml
sections:
  cost-gap-stat:
    subsections:
      0:
        paragraphsOverride:
          - "Where you live in 2026 determines your financial reality. Hawaii costs $141,127 annually. Oklahoma costs $66,284. That $75K gap rivals the median household income."
```

A `logo` line at the top level, plus `hide` / `shareParagraphs` for splitting, complete the common toolkit:

```yaml
logo: /vizmaya-logo-04.svg
sections:
  methodology:
    hide: true               # drop this section from share entirely
  long-narrative:
    shareParagraphs:         # one source section → two cards
      - [0, 3]               # card 1: paragraphs 0..2
      - [3, 6]               # card 2: paragraphs 3..5
```

---

## Report (PDF) & slides render modes

Beyond the live scroll-driven story page and the autoplay video, the engine has two **headless PDF capture** render modes: a portrait **Report** booklet and a 16:9 **Slides** deck. Both reuse the same resolved units, theme, map/chart modules, and per-story override config; they differ only in page geometry and per-page layout template. A headless Playwright Chromium navigates a dedicated Next.js route in print mode, waits for an in-page readiness flag, and calls `page.pdf()`.

This section documents what each mode produces, the entry routes and API, the two render shells, the `<slug>.report.yaml` override config that controls per-page layout, how a story's sections map to pages/slides, the print/readiness gating, and the author-facing options.

> Maturity note: these modes are real and wired end-to-end (route → shell → Playwright → Supabase Storage), but they are deliberately scoped. The shells are bespoke, fixed layouts — there is no rich per-page layout DSL like the live page has, no page reorder, and no chart-data override (both called out as out-of-scope in `apps/vizmaya-fyi/lib/storyReportConfig.ts`). Author control is limited to the per-page override keys documented below.

### What each mode produces

| Mode | Format value | Page geometry | Per-page template | Source shell |
| --- | --- | --- | --- | --- |
| Report | `report` | A4 portrait, 794×1123 px @ 96 dpi (`page.pdf({ format: 'A4' })`) | Cover page, then one unit per page: eyebrow + heading + subheading, optional map (full-width, 3.5in tall), paragraphs, then chart/foreground viz | `apps/vizmaya-fyi/components/pdf/ReportShell.tsx` |
| Slides | `slides` | 16:9 landscape, 1920×1080 px (`page.pdf({ width:'1920px', height:'1080px', landscape:true })`) | One unit per slide: 50/50 split — map left, eyebrow + heading + subheading + paragraphs + chart right; header (title + logo) and footer (slug + page count) chrome | `apps/vizmaya-fyi/components/pdf/SlidesShell.tsx` |

Both modes produce a single multi-page PDF plus a first-page PNG thumbnail (for the demo gallery), uploaded to the `story-pdf` Supabase Storage bucket and recorded in the `story_pdfs` table. See `apps/vizmaya-fyi/lib/storyPdfRender.ts`.

The page-geometry constants are duplicated in three places that must stay in lockstep: the shell (`PAGE_W/PAGE_H = 794/1123` in `ReportShell.tsx`; `SLIDE_W/SLIDE_H = 1920/1080` in `SlidesShell.tsx`), the `@page` CSS rule the shell emits, and `RENDER_CONFIG` in `storyPdfRender.ts` (viewport + `pdfArgs`). The `@page` rule is honored only because `page.pdf()` is called with `preferCSSPageSize: true`; without it Chromium falls back to default Letter portrait.

### Story format split: map vs deck

Both shells branch on the story's frontmatter `format` (`StoryFormat = 'map' | 'deck'`, defined in `packages/viz-engine/src/types/story.ts`; missing → `'map'`, the legacy default — see `frontmatter.format`).

- **`format: map`** (default) — the legacy templates described in the table above. Map stories render heading + paragraphs + map + chart booklet (report) or the 50/50 map-left template (slides).
- **`format: deck`** — each unit renders full-canvas via `ForegroundLayoutSlot`, so deck layouts and slot positions render identically to the live page. Report deck pages and slide deck slides drop the booklet/50-50 chrome. Hero/cover units (`kind: cover` or `kind: hero`) overlay the section eyebrow + heading in the bottom-left over the foreground (matching the live cover treatment). Non-hero deck kinds suppress the section text entirely — content lives in the viz slots.

The page passes `format={story.frontmatter.format ?? 'map'}` into both shells (`report/page.tsx`, `slides/page.tsx`).

#### Slides unit source: shareUnits vs units

The slides route (`slides/page.tsx`) prefers **share-mode units** when the story defines share overrides: `const baseSlideUnits = hasShareOverrides ? shareUnits : units`. Share slicing tends to be tighter and more presentation-shaped. The report route always uses the base `units`.

### Entry points

#### Render API route

`GET /api/story-pdf/[slug]?format=report|slides[&force=1]` — implemented by `createStoryPdfHandler` in `packages/content-source/src/handlers/storyPdf.ts`, wired in `apps/vizmaya-fyi/app/api/story-pdf/[slug]/route.ts` (`runtime = 'nodejs'`, `maxDuration = 300`).

| Query param | Type | Default | Description |
| --- | --- | --- | --- |
| `format` | `'report' \| 'slides'` | — (required) | Which PDF to produce. Anything else → `400 { error: 'format must be report or slides' }`. Validated by `isPdfFormat` in `packages/content-source/src/storyPdf.ts`. |
| `force` | `'1'` | unset | Bypass the cache and re-render. Any value other than `'1'` is treated as unset. |

The `slug` path segment must match `/^[a-zA-Z0-9_-]+$/` (`SAFE_SLUG`) or the handler returns `400 { error: 'bad slug' }`.

Response shapes (all JSON):

| Status | Body | Meaning |
| --- | --- | --- |
| `200` | `{ status: 'ready', public_url, cached, content_revision_hash }` | Cached PDF for the current content hash exists (or sync render just completed). |
| `202` | `{ status: 'rendering' }` | A render was dispatched (or one is already in flight); poll again later. |
| `400` | `{ error }` | Bad slug or missing/invalid `format`. |
| `500` | `{ error }` | Hash compute, render, or dispatch failed (readable message, never an opaque Next 500). |

#### Render dispatch vs sync (where the work runs)

The handler has the same dispatch-or-sync split as the video pipeline (cheaper — Chromium only, no ffmpeg/audio):

- **Dispatch (production)** — when `GITHUB_DISPATCH_TOKEN` + `GITHUB_DISPATCH_REPO` are set (`isPdfDispatchConfigured` in `packages/content-source/src/storyPdfDispatch.ts`), the handler writes an in-flight stub row (`markPdfDispatched`) and fires a `workflow_dispatch` to `.github/workflows/render-pdf.yml` with inputs `{ slug, format, base_url }`, then returns `202`. `GITHUB_DISPATCH_REF` selects the branch (default `main`).
- **Sync (local dev)** — when dispatch is not configured, the handler calls `renderStoryPdf` (dynamically imported in the route so Playwright doesn't break Vercel cold-starts). Needs Playwright Chromium installed (`npx playwright install chromium`).

#### Render preview / authoring routes

The capture routes are also directly navigable for dev preview:

| Route | Renders | Notes |
| --- | --- | --- |
| `GET /story/[slug]/report` | `ReportShell` via `app/story/[slug]/report/page.tsx` | Portrait booklet. |
| `GET /story/[slug]/slides` | `SlidesShell` via `app/story/[slug]/slides/page.tsx` | 16:9 deck. |

Both routes are `dynamic = 'force-dynamic'` and gated by signed-URL middleware (Playwright/the builder mint short-lived HMAC tokens). They accept these search params:

| Search param | Type | Default | Description |
| --- | --- | --- | --- |
| `print` | `'1'` | unset (`false`) | Print path: native-size pages with `break-before: page` / `break-after: page`, no preview chrome, eager (non-lazy) maps. Playwright always passes this. |
| `embed` | `'1'` | unset (`false`) | Hides the preview-chrome banner ("Report/Slides preview · Edit overrides →"). Used when the route is embedded in the `/reports` builder. |
| `section` | string (section id or `section-<parentIndex>`) | unset (`null`) | Scopes the export to a single unit's page/slide. Used by the builder canvas to preview one section. Applied via `filterBySection` **after** report overrides so `include: false` units are correctly excluded first. |

The authoring UI lives at `/reports` (story list) and `/reports/[slug]` (the `ReportsBuilder`, `apps/vizmaya-fyi/components/reports/ReportsBuilder.tsx`). The builder embeds the report/slides preview routes (with builder-minted signed URLs, 24h TTL) and writes the override YAML back through `POST /api/story-report-config/[slug]`.

### Caching & content revision hash

Cache key is `(slug, format, content_revision_hash)`. The hash (`computeContentRevisionHash` in `packages/content-source/src/storyPdf.ts`) is sha256 over: markdown + `config.yaml` + `share.yaml` + `report.yaml` + every chart JSON for the slug (sorted by id). Code-only redeploys don't invalidate; any content edit does. Cache lookup is `getCachedPdf`; state classification (`ready` / `rendering` / `stale` / `missing`) is `classifyPdfState`, with a 30-minute `DISPATCH_STALE_MS` window after which an in-flight stub is treated as a dead render and re-dispatched. Bucket is `PDF_BUCKET = 'story-pdf'`; storage paths are `<slug>/<format>.pdf` and `<slug>/<format>__thumb.png`.

### The shells

#### ReportShell

`apps/vizmaya-fyi/components/pdf/ReportShell.tsx` — A4 portrait booklet. Props:

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `slug` | `string` | — (required) | Story slug; used as the footer caption and as the readiness/viz `unitKey` prefix. |
| `title` | `string` | — (required) | Cover-page title (from `frontmatter.title`). |
| `units` | `ResolvedUnit[]` | — (required) | Resolved + report-overridden units, one per page. |
| `config` | `StoryConfig` | — (required) | Story config; map defaults (`mapStyle`, `mapPalette`, `mapFontstack`, `highlightCountry`, `highlightColor`, `mapOpacity`, `pinColor`, `pinRadius`) feed `PdfMapBg`. |
| `format` | `StoryFormat` | `'map'` | `'map'` → booklet template; `'deck'` → full-page `ForegroundLayoutSlot` per unit. |
| `aura` | `string` | — | Frontmatter aura slug. Currently unused (reserved for a future per-page backdrop). |
| `accessToken` | `string` | — (required) | Mapbox token (`NEXT_PUBLIC_MAPBOX_TOKEN`); empty string if unset. |
| `logo` | `string` | — | Themed logo data URL, drawn on the cover at 48px tall. |
| `print` | `boolean` | `false` | Print path (native pages + `@page` rule) vs preview path (fit-scaled framed cards via `PreviewFlowFrame`). |
| `embed` | `boolean` | `false` | Hides the preview-chrome banner. |

Layout details: cover page renders logo + the literal "Report" eyebrow + serif title + byline (extracted by `extractByline` — the first paragraph of the hero unit that starts with `**`). Each unit page is `794×1123 px` min-height (grows if content overflows), `56px 56px 48px` padding, with `break-before: page` in print. Map block is full-width × `3.5in`. Markdown bold/italic/link markers are stripped to plain text (`stripMarkdown`). Footer shows `<slug>` and `<page> / <total>`.

#### SlidesShell

`apps/vizmaya-fyi/components/pdf/SlidesShell.tsx` — 1920×1080 deck. Same prop list as ReportShell (with `format` controlling map-50/50 vs deck full-canvas, and `aura` similarly reserved/unused — deck slides paint the theme background as backdrop). Preview path uses fixed-aspect `PreviewFrame` (not the growable `PreviewFlowFrame`) because each slide is exactly 16:9.

Map-format slide layout: 64px header (title left, logo right), 50% map column on the left + 50% text column on the right (eyebrow + heading + subheading + paragraphs + chart), 48px footer (`<slug>` and `<page> / <total>`). There is **no cover slide** — every unit becomes one content slide.

#### Shared helpers (`apps/vizmaya-fyi/components/pdf`)

| File | Role |
| --- | --- |
| `PdfMapBg.tsx` | Static Mapbox background for a single camera. Renders `MapboxBackground` with `staticCapture`, `interactive=false`, `hideAllLabels`. `lazy` is `false` on the print path (all maps eager so a single `page.pdf()` rasterizes them) and `true` on preview (IntersectionObserver-mounted to stay under the browser WebGL context cap). Calls `onReady` → readiness `noteReady`. |
| `PreviewFrame.tsx` | Fixed-aspect, fit-scaled framed preview card (uses `transform: scale`, not `zoom`, so Mapbox sizes its canvas at native dimensions). Slides preview. |
| `PreviewFlowFrame.tsx` | Like `PreviewFrame` but the card grows past native height when content overflows (uses CSS `zoom`). Report preview, since a section can spill onto a second physical page. |

### How sections map to pages / slides

Both routes resolve the story the same way (`report/page.tsx`, `slides/page.tsx`):

1. `getStoryContent(slug)` + `loadStoryConfig(slug)` (404 if no config).
2. `resolveUnits(slug, story.sections, config)` → flat `ResolvedUnit[]` (one per section/subsection unit). Slides may swap to `shareUnits` when `hasShareOverrides`.
3. `getContentSource().readReportYaml(slug)` → the raw `<slug>.report.yaml` blob (fs file or `stories.report_yaml` DB column — `packages/content-source/src/contentSource.ts`).
4. `parseReportConfig(raw, 'report' | 'slides')` → the per-format `ReportConfig`.
5. `applyReportOverrides(units, reportConfig)` → drops `include:false` units, applies heading/paragraph/chart/map overrides.
6. If `?section=` is set, `filterBySection` narrows to that one unit (after overrides).

So **one resolved unit = one report page (after the cover) = one slide**. Unit identity for overrides is the pair `(parentIndex, subIndex)`, which survives markdown reorders as long as the section/subsection layout is stable.

#### Map camera precedence (per unit)

Both shells resolve each unit's map camera with the same precedence (per-page report override **beats** subsection `map:` block **beats** parent section `map:` block), so the same `/reports` edit applies to both formats:

```
center/zoom/pitch/bearing/pins  =  reportOverride  ??  subsection.map  ??  parent.map
```

A map renders only when `center` is set, `zoom` is a number, and the unit's map is not hidden (`isReportMapHidden`). Deck-format sections have no `map:` block, so map overrides have nothing to merge into and are silently ignored.

### Print mode & readiness gating (freeze/capture)

The capture contract lives in `packages/viz-engine/src/lib/storyReadiness.ts` (the `pdfReadiness.ts` file is a back-compat shim re-exporting `useStoryReadiness` under the old `usePdfReadiness({ noteMapReady })` name).

How it works:

- Each shell computes `expectedSignals`: one per **visible map** + one per **registered foreground viz layer** (chart / image / video / rive / embed). Unknown layer types render `null` in `ForegroundVizSlot` and never fire `noteReady`, so they are deliberately **not counted** — counting them would prevent the ready flag from ever flipping. The check is `getVizModule(layer.type)` exists and includes the `'foreground'` slot.
- `useStoryReadiness(expectedSignals)` returns `{ noteReady }`. Each map (`PdfMapBg.onReady`) and each viz layer (`noteLayerReady`) calls it once when first paintable.
- When all expected signals are in, the hook waits `POST_SETTLE_MS = 2000` ms (lets ECharts entrances / Rive intros finish), then sets `window.__pdfReady__ = true`.
- A `FALLBACK_TIMEOUT_MS = 120_000` ms guard flips the flag regardless, so one broken signal can't hang the render. A pure-prose page (`expectedSignals === 0`) just settles and flips.

On the capture side (`storyPdfRender.ts`):

- Launches Chromium with `--max-active-webgl-contexts=64` (default cap of 16 would silently evict maps on a 17+-page story, leaving slides with no tile imagery).
- Mints a signed-URL token (14-min TTL) for `/story/<slug>/<format>?print=1` and `page.goto(url, { waitUntil: 'domcontentloaded' })` — not `load`, which never settles under Mapbox tile streaming.
- `page.waitForFunction(() => window.__pdfReady__ === true, undefined, { timeout: READY_TIMEOUT_MS })` where `READY_TIMEOUT_MS = 300_000` (5 min — must outlast hydration + the 120s in-page fallback so the render rides the in-page fallback, not Playwright's).
- `page.pdf({ ...pdfArgs, printBackground: true, preferCSSPageSize: true, margin: 0 })`. Shells own all padding inside their page sections.
- Captures a first-page PNG thumbnail (top-of-document screenshot, no scroll).

### Author-facing config: `<slug>.report.yaml`

Per-story override config for the `/reports` builder, parsed by `apps/vizmaya-fyi/lib/storyReportConfig.ts`. Stored as `content/stories/<slug>.report.yaml` (fs) or `stories.report_yaml` (DB after migration 010). **Optional** — absent/empty config means the story renders straight from `resolveUnits` with no overrides. There are no `.report.yaml` files checked into the repo at the time of writing; the builder writes them on first save.

The schema is **nested per format** — `report:` and `slides:` each carry their own `pages:` array, so you can give slides a tighter camera or different heading than the report:

```yaml
report:
  pages:
    - unit: { parentIndex: 0, subIndex: 0 }
      include: false                     # skip this unit in the report
    - unit: { parentIndex: 1, subIndex: 0 }
      heading: "Custom heading"          # overrides the unit heading
      subheading: "Custom subheading"
      paragraphs: ["Replacement body copy."]  # replaces unit.paragraphs entirely
      chartOverride: { id: "alt-chart" } # swap chart id (must exist for the slug)
      mapOverride:
        style: "mapbox://styles/..."
        palette: { land: "#101010" }     # MapPalette subset
        center: [-0.1276, 51.5072]
        zoom: 9.2
        pitch: 30
        bearing: 12
slides:
  pages:
    - unit: { parentIndex: 0, subIndex: 0 }
      heading: "Different heading for slides"
      mapOverride:
        zoom: 7.5                         # slides-specific camera
```

A **legacy flat shape** (top-level `pages:` with no `report:`/`slides:` keys) is still read and mirrored into both formats; the builder always writes the nested shape on save.

#### Top-level shape

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `report.pages` | `ReportPageOverride[]` | `[]` | Per-page overrides applied to the Report PDF. |
| `slides.pages` | `ReportPageOverride[]` | `[]` | Per-page overrides applied to the Slides PDF. |
| `pages` (legacy) | `ReportPageOverride[]` | `[]` | Flat array applied to **both** formats. Only relevant until the story is re-saved once. |

#### `ReportPageOverride` (one entry in a `pages` array)

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `unit.parentIndex` | `number` | — (required) | Section index. Entry is dropped if missing/non-number. |
| `unit.subIndex` | `number` | — (required) | Subsection (unit) index within the section. Dropped if missing/non-number. |
| `include` | `boolean` | `true` (implied) | `false` drops this unit from the export. Applied before `?section=` filtering. |
| `heading` | `string` | unit's heading | Replaces the unit heading. |
| `subheading` | `string` | unit's subheading | Replaces the unit subheading. |
| `paragraphs` | `string[]` | unit's paragraphs | Replaces the unit body copy **entirely** (only applied if every element is a string). |
| `hideChart` | `boolean` | `false` | Drops the chart for this unit (overrides any `chartOverride`). |
| `hideMap` | `boolean` | `false` | Drops the map for this unit (overrides any `mapOverride`; sets a `__hideMap` side-channel flag the shells read via `isReportMapHidden`). |
| `chartOverride.id` | `string` | unit's chart | Swaps the chart id for this unit only (per-unit clone of parentConfig, so sibling units of the same parent are untouched). Must resolve to an existing chart for the slug. |
| `mapOverride` | object | — | Per-page map overrides. See below. Ignored on deck-format sections (no `map:` block to merge into). |

#### `mapOverride` sub-object

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `style` | `string` | `config.defaults.mapStyle` | Mapbox style URL. Lives on `defaults`, so it's stashed on a `__reportMapOverride` side channel for shells to consume. |
| `palette` | `MapPalette` (subset) | `config.defaults.mapPalette` | Map palette override (also via side channel). |
| `center` | `[number, number]` | section camera | `[lng, lat]`. Only accepted if a 2-element numeric array. |
| `zoom` | `number` | section camera | Zoom level. |
| `pitch` | `number` | section camera (`0`) | Map pitch. |
| `bearing` | `number` | section camera (`0`) | Map bearing. |
| `pinOverrides` | `PinOverride[]` | — | Per-pin patches matched against the section's pins by `coordinates` (rounded to 6 decimals). Listed fields are shallow-merged; unlisted pins pass through unchanged. |

`center`/`zoom`/`pitch`/`bearing` are merged directly into `parent.map` so the existing shells pick them up; the full override is also stashed on `__reportMapOverride` for `style`/`palette`/pins.

#### `PinOverride` (one entry in `mapOverride.pinOverrides`)

A patch matched against an existing section pin by `coordinates` — use it to nudge a single pin's label without re-listing every pin.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `coordinates` | `[number, number]` | — (required) | `[lng, lat]` matched (6-decimal rounded) against the section's pins. Entry skipped if not a 2-element numeric array. |
| `label` | `string` | pin's label | New label text. |
| `labelAnchor` | `'top' \| 'bottom' \| 'left' \| 'right'` | pin's anchor | Label placement; invalid values ignored. |
| `color` | `string` | pin's color | Pin color. |
| `radius` | `number` | pin's radius | Pin radius. |
| `pulse` | `boolean` | pin's pulse | Toggle the pulse animation. |

Patched pins are resolved against `subsection.map.pins ?? parent.map.pins` and stashed on `__reportPins` (read by shells via `getReportPins`).

#### Out of scope (deliberate)

Per `storyReportConfig.ts`: **page reorder** and **chart-data overrides** are intentionally unsupported — neither was selected when scoping the `/reports` builder. There is also no per-page free-form layout control; the shells' templates are fixed.

---

## Embed render mode (web & native)

The **embed render mode** lets any host application — a consumer site like `vizf1`/`footshorts`, or a React Native app — drop a fully-rendered Vizmaya story into its own UI without re-implementing the scrollytelling engine. The story itself is always rendered by `vizmaya.fyi` (the canonical "general Viz story view"); the host wraps it in an `<iframe>` (web) or a `react-native-webview` `WebView` (native) and overlays its own chrome (back button, branding) on top.

The mode lives in the `@vismay/story-embed` package (`packages/story-embed/`). It has three source modules, each its own subpath export (see `packages/story-embed/package.json`):

| Subpath import | Source file | Purpose |
| --- | --- | --- |
| `@vismay/story-embed` / `@vismay/story-embed/url` | `packages/story-embed/src/url.ts` | URL builder + origin constant (no React, safe everywhere) |
| `@vismay/story-embed/web` | `packages/story-embed/src/web.tsx` | Web `<StoryEmbed>` (`<iframe>`) |
| `@vismay/story-embed/native` | `packages/story-embed/src/native.tsx` | Native `<StoryEmbed>` (`react-native-webview`) |

`react-native`, `react-native-webview`, and `nativewind` are **optional** peer dependencies (`peerDependenciesMeta` in `package.json`), so a web-only host can import `/web` and `/url` without pulling in the native stack. `react` `^19` is a required peer.

> The package ships raw TypeScript/TSX (the `main`/`exports` point at `.ts`/`.tsx`), so a consuming Next.js app must list it in `transpilePackages` — e.g. `transpilePackages: ['…', '@vismay/story-embed']` in `apps/footshorts/web/next.config.ts` and `apps/vizf1/web/next.config.ts`.

### How embedding works end to end

1. The host calls `storyUrl(slug)` (or passes a `slug`/`url` prop) to get the render URL.
2. `storyUrl` returns `https://vizmaya.fyi/story/<slug>?embed=1` — the trailing **`?embed=1`** flag is the entire chrome-less contract.
3. The host renders `<StoryEmbed>`, which loads that URL in an iframe/WebView and shows a loading spinner until the frame loads (or a timeout fires).
4. Inside the frame, `@vismay/story-reader`'s `StoryMapShell` reads `?embed=1` client-side and **suppresses the persistent Vizmaya brand logo / home-link**, leaving a clean canvas.
5. The host overlays its own chrome via the `children` prop (back button, etc.), absolutely positioned over the frame.

The flag is read in `packages/story-reader/src/components/story/StoryMapShell.tsx`:

```tsx
const [isEmbed, setIsEmbed] = useState(false)
useEffect(() => {
  const params = new URLSearchParams(window.location.search)
  setIsEmbed(params.get('embed') === '1')
}, [])
```

and gates the logo render (`StoryMapShell.tsx`):

```tsx
{logoPalettes && LogoComponent && !isEmbed && (
  <LinkComponent href="/" aria-label="Home" /* persistent brand logo */ >
    <LogoComponent palette={…} />
  </LinkComponent>
)}
```

Direct `vizmaya.fyi/story/<slug>` readers never set `embed`, so they keep the logo. The same shell also reads sibling flags `?autoplay=1` and `?capture=1` (Playwright video capture) — those are independent of embed mode and not set by `storyUrl`.

### The URL builder — `url.ts`

Source: `packages/story-embed/src/url.ts`. This is the single source of truth for the embed origin and path shape, so the URL is constructed in exactly one place.

#### Exports

| Export | Type | Value / default | Description |
| --- | --- | --- | --- |
| `VIZMAYA_ORIGIN` | `string` (const) | `'https://vizmaya.fyi'` | The default render origin. Re-exported by hosts (e.g. `EditorialWebView` re-exports it) for fallback URLs. |
| `storyUrl(slug, origin?)` | `(slug: string, origin?: string) => string` | — | Builds the chrome-less embed URL. |

#### `storyUrl(slug, origin)` parameters

| Param | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `slug` | `string` | — | Yes | Story slug. Passed through `encodeURIComponent`, so callers pass the raw slug. |
| `origin` | `string` | `VIZMAYA_ORIGIN` (`https://vizmaya.fyi`) | No | Render origin (scheme + host, no trailing slash). Override to point at a staging/preview deploy. |

Output shape:

```
<origin>/story/<encodeURIComponent(slug)>?embed=1
```

Note the builder only covers the **story** path. Epic readers build their own path (e.g. `${VIZMAYA_ORIGIN}/${slug}`) and pass it to the native embed's `url` prop directly — see the native usage below.

### Web embed — `web.tsx`

Source: `packages/story-embed/src/web.tsx`. Import: `import { StoryEmbed } from '@vismay/story-embed/web'`. Marked `'use client'`.

`StoryEmbed` renders a fixed full-viewport (`position: fixed; inset: 0`) container holding an `<iframe src={storyUrl(slug, origin)}>` (`allow="fullscreen"`, no border, 100% × 100%), a loading spinner overlay, and the host's `children` on top.

It is styled entirely with **inline CSS variables** (`--color-bg`, `--color-accent`) rather than Tailwind utilities, so it themes itself from whatever app embeds it and needs no Tailwind `@source`/content wiring. The spinner keyframes are injected via an inline `<style>` tag (`vismay-story-embed-spin`).

#### `StoryEmbedProps` (web)

| Option | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `slug` | `string` | — | **Yes** | Story slug rendered by the Vizmaya story view; passed to `storyUrl(slug, origin)`. |
| `origin` | `string` | `VIZMAYA_ORIGIN` (`https://vizmaya.fyi`) | No | Render origin; forwarded to `storyUrl`. |
| `title` | `string` | `'Editorial story'` | No | `<iframe>` `title` attribute (accessibility). |
| `timeoutMs` | `number` | `6000` | No | Safety-net timeout. Cross-origin frames can stay silent about load/error, so the loading overlay is force-hidden after this many ms even if `onLoad` never fires. |
| `spinnerColor` | `string` | `'var(--color-accent, #888)'` | No | Spinner border colour. Defaults to the host theme's accent CSS variable, falling back to `#888`. |
| `backgroundColor` | `string` | `'var(--color-bg, #000)'` | No | Backdrop behind/over the frame while it loads. Defaults to the host bg variable, falling back to `#000`. |
| `children` | `ReactNode` | — | No | Branding/chrome overlaid on top of the frame (back button, logo, …). Rendered after the iframe and spinner, so position it absolutely. |

Loading behaviour: `loaded` starts `false`; it flips `true` on the iframe `onLoad` **or** after `timeoutMs`. While `false`, a centered spinner overlay (`pointerEvents: 'none'`) covers the frame on `backgroundColor`.

#### Web usage

Real consumer (`apps/footshorts/web/app/editorial/[slug]/EditorialReader.tsx`) — the host supplies only `slug` and overlays a back button:

```tsx
'use client';
import Link from 'next/link';
import { StoryEmbed } from '@vismay/story-embed/web';

export default function EditorialReader({ slug }: { slug: string }) {
  return (
    <StoryEmbed slug={slug}>
      <Link
        href="/feed"
        aria-label="Back to feed"
        className="absolute left-4 top-4 z-20 flex h-10 w-10 items-center
                   justify-center rounded-full border border-border
                   bg-surface/80 text-text backdrop-blur"
      >
        {/* back chevron svg */}
      </Link>
    </StoryEmbed>
  );
}
```

### Native embed — `native.tsx`

Source: `packages/story-embed/src/native.tsx`. Import: `import { StoryEmbed } from '@vismay/story-embed/native'`. Same component name as web but a distinct prop type (`StoryEmbedNativeProps`).

It renders a `flex: 1` `View` holding a `react-native-webview` `WebView` (`StyleSheet.absoluteFill`, `javaScriptEnabled`, `domStorageEnabled`, `allowsInlineMediaPlayback`, `opaque={false}`), an `ActivityIndicator` loading overlay, and the host's `children` on top. On web (via `react-native-web`) the `WebView` renders as an `<iframe>`, so the same component works in a react-native-web build.

The key difference from web: the native embed accepts **either** a `slug` (combined with `origin` via `storyUrl`) **or** a full `url` override. The resolved URI is:

```ts
const uri = url ?? (slug ? storyUrl(slug, origin) : VIZMAYA_ORIGIN)
```

So `url` wins; if absent, `slug` is built into an embed URL; if both are absent it falls back to `VIZMAYA_ORIGIN` (no `?embed=1`, so the logo would show — always pass `slug` or an embed `url`). The `url` override exists for readers that build a non-`/story/` path (e.g. epic readers building `${VIZMAYA_ORIGIN}/<epicSlug>`); those should append `?embed=1` themselves if they want chrome-less mode.

#### `StoryEmbedNativeProps`

| Option | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| `slug` | `string` | — | No¹ | Story slug; combined with `origin` via `storyUrl`. **Ignored when `url` is provided.** |
| `url` | `string` | — | No¹ | Full URL override (used as-is). For readers that build their own path (e.g. epics). Takes precedence over `slug`. |
| `origin` | `string` | `VIZMAYA_ORIGIN` (`https://vizmaya.fyi`) | No | Render origin; forwarded to `storyUrl` when building from `slug`. |
| `timeoutMs` | `number` | `6000` | No | ms before the loading indicator is force-hidden (safety net), same role as web. |
| `spinnerColor` | `string` | `'#888'` | No | `ActivityIndicator` colour. (No CSS-variable fallback here — native has no `var()`.) |
| `backgroundColor` | `string` | `'transparent'` | No | Backdrop behind the `WebView`. Defaults to transparent so the host bg shows through (combined with `WebView` `opaque={false}`) — avoids a white flash while the story loads. |
| `children` | `ReactNode` | — | No | Branding/chrome overlaid on top of the `WebView` (back button, …). |

¹ Neither `slug` nor `url` is type-required, but you should supply one of them; with neither, the embed loads the bare `VIZMAYA_ORIGIN` home page without embed mode.

Loading behaviour: `loaded` flips `true` on the `WebView` `onLoadEnd` or after `timeoutMs`; the effect early-returns once loaded so the timer is not re-armed.

#### Native usage

The footshorts mobile reader wraps the embed in a small `EditorialWebView` component and passes a pre-built `url` (`apps/footshorts/mobile/src/components/EditorialWebView.tsx`):

```tsx
import { StoryEmbed } from '@vismay/story-embed/native'
export { VIZMAYA_ORIGIN } from '@vismay/story-embed/url'

export function EditorialWebView({ url }: { url: string }) {
  const router = useRouter()
  return (
    <View className="flex-1 bg-bg">
      <StoryEmbed url={url} spinnerColor="#00D26A">
        {/* blurred pill back button overlaid via children */}
        <Pressable onPress={() => router.back()} accessibilityLabel="Back">…</Pressable>
      </StoryEmbed>
    </View>
  )
}
```

The story route builds the embed URL with `storyUrl` (`apps/footshorts/mobile/app/editorial/[slug].tsx`):

```tsx
import { storyUrl } from '@vismay/story-embed/url'
import { EditorialWebView, VIZMAYA_ORIGIN } from '@/components/EditorialWebView'

export default function EditorialReader() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const url = slug ? storyUrl(slug) : VIZMAYA_ORIGIN
  return <EditorialWebView url={url} />
}
```

The epic route builds its own path (no `storyUrl`) — `apps/footshorts/mobile/app/editorial/epic/[slug].tsx`:

```tsx
const url = slug ? `${VIZMAYA_ORIGIN}/${encodeURIComponent(slug)}` : VIZMAYA_ORIGIN
return <EditorialWebView url={url} />
```

### Chrome-less embed mode (logo suppression)

"Chrome-less" refers to suppressing **Vizmaya's** chrome — specifically the persistent brand logo / home-link that `StoryMapShell` normally pins top-left — so the host shows only its own overlaid chrome and not the Vizmaya brand inside its app.

- The only trigger is the **`?embed=1`** query param, added by `storyUrl()` (and inherited by every consumer routed through it).
- It is read **client-side** in the rendered story (`StoryMapShell.tsx`), not in the embed package — the embed package only puts the flag on the URL.
- Suppression is gated as `logoPalettes && LogoComponent && !isEmbed`. The `logoPalettes`/`LogoComponent` gate also keeps headless consumers (canvas-frame) logo-free independently; embed mode adds the `!isEmbed` condition for consumer-app iframes/WebViews.
- The host is expected to overlay its own back button / branding via `children`. Because both web and native render `children` last (after the frame and spinner), host chrome must be absolutely positioned (`absolute`/`position: 'absolute'`) to sit over the frame.

### Dropping a story into a host app — checklist

1. Add `@vismay/story-embed` to the host's deps and (Next.js) to `transpilePackages`.
2. Pick the entry: `/web` for an iframe host, `/native` for a react-native (-web) host.
3. Render `<StoryEmbed slug={slug}>…</StoryEmbed>` (web) or `<StoryEmbed slug={slug}|url={url}>…</StoryEmbed>` (native). The `?embed=1` flag is applied automatically when you use `slug` (web/native) or `storyUrl` (native via `url`).
4. Pass your back button / branding as `children`, absolutely positioned.
5. (Optional) Theme the spinner/backdrop via `spinnerColor`/`backgroundColor`; on web these default to your `--color-accent` / `--color-bg` CSS variables.
6. To render a non-`/story/` path (e.g. an epic) on native, build the URL yourself and pass it as `url` (append `?embed=1` if you want chrome-less mode).

---

## Appendix — Coverage notes & late-binding options

This appendix is the independent completeness audit of the drafted sections (`10`–`72`)
against the source of record:

- `packages/viz-engine/src/registry.ts` — the 13 registered viz module types.
- `packages/viz-engine/src/foregroundLayouts.ts` — the 11 registered foreground layout names.
- `packages/viz-engine/src/lib/storyConfig.types.ts` — `SectionKind`, `StatColor`, `StoryDefaults`,
  `StorySectionConfig`, `StorySubsectionConfig`, `MapPalette`, `StoryBackgroundConfig`,
  `OverlayConfig`, `DeckScrollConfig`, `ChartDefaults`, `LogoPalette`, and every `Share*` interface.
- `packages/viz-engine/src/types.ts` — `VizModule`, `VizLayerStyle`, `VizLayerPanel`,
  `VizMountingMode`, `AdminFormField`, `ForegroundLayoutDef`.
- `packages/viz-engine/src/types/story.ts` — `Frontmatter`, `Theme`, `MapStep`, `MapPin`,
  `MapRegion*`, `Heatmap*`, `MapTextLabel`, and the markdown-body `BlockType` taxonomy.

**Headline finding:** the drafted sections are exhaustive on the render-config surface. Every
registered module type, every registered layout name, and every `SectionKind` is documented to
the field/default/validation level — including niche normalization caveats (e.g. `video.loop`'s
`!== false` coercion, `bodyText.from`'s single-value enum, `bigStat.deltaColor = StatColor | 'positive'`,
the runtime-only `MapPin.opacity`). The gaps below are genuinely small: one untyped markdown-body
taxonomy that sits *adjacent* to the config surface, and a handful of late-binding / cross-reference
clarifications worth pinning down so the final doc is airtight.

### Gap 1 — The markdown-body `BlockType` taxonomy is undocumented

`bodyText` (and the legacy section text card) read prose from the `.md` body, sliced by
paragraph index. The `.md` body itself is parsed into a typed block stream
(`type BlockType` and the `Block` union in `packages/viz-engine/src/types/story.ts`). No drafted
section enumerates these block types. They are *not* part of the `config.yaml` option surface —
authors never write a `type:` block kind in YAML — but they define what the markdown body may
contain and therefore what `paragraphs:` / `from: text` can slice. Worth a short cross-reference
so an author who hits, say, a `stat-block` or `exposure-grid` in the prose knows it is a recognized
construct rather than stray markup.

`BlockType` values (`packages/viz-engine/src/types/story.ts`, `type BlockType` + `type Block`):

| Block `type` | Interface | Markdown shape it parses from | Fields |
| --- | --- | --- | --- |
| `hero` | `HeroBlock` | The story's lead title block | `title`, `dek`, `byline` |
| `stat-block` | `StatBlock` | A standalone big-number callout | `value`, `description` |
| `act-header` | `ActHeaderBlock` | An "Act N · Title" section divider | `actNumber`, `title` |
| `divider` | `DividerBlock` | A horizontal rule / section break | — |
| `prose` | `ProseBlock` | One or more body paragraphs | `paragraphs: string[]` |
| `subsection-header` | `SubsectionHeaderBlock` | A sub-heading inside an act | `title` |
| `data-table` | `DataTableBlock` | A markdown pipe table | `headers`, `rows`, `scenarioLabel?` |
| `exposure-grid` | `ExposureGridBlock` | A labeled value grid | `items: { label, value, description, color? }[]` |
| `scrolly-section` | `ScrollySectionBlock` | A scroll-driven step block | `steps: { label, content }[]`, `chartId?` |
| `scenario-toggle` | `ScenarioToggleBlock` | A toggle between scenario tables | `scenarios: { label, table }[]` |
| `takeaway-grid` | `TakeawayGridBlock` | An audience→takeaway grid | `items: { audience, content }[]` |
| `methodology` | `MethodologyBlock` | A methodology note block | `content: string[]` |
| `footer` | `FooterBlock` | A closing footer line | `text` |
| `unknown` | `UnknownBlock` | Any unrecognized block (fallback) | `content` |

Authoring note: the render engine's paragraph slicing (`paragraphs` / `mobileParagraphs` /
`shareParagraphs`) operates over the **resolved paragraphs** of the markdown anchor named by
`text:`, which come from the `prose` block(s) under that heading. The other block types are
parsed but only some surface in the scrollytelling shells; the config-driven renderer is the
authoritative path documented in sections 30–62.

### Gap 2 — `MapStep` (the resolved runtime camera type) is referenced but not given its own field table

Section `20-map-shell` and `21-map-config` both name `MapStep` (`packages/viz-engine/src/types/story.ts`)
as the resolved per-unit camera shape that `buildMapTargets` produces from the authored `map:`
blocks, and `21` documents the author-facing `StorySectionConfig.map` / `MapOverrides` fields
that feed it. For completeness, `MapStep` is the **resolved** (post-cascade) shape and carries the
same fields as the authored block — but note it is the structure the persistent map component
actually consumes, with `center` + `zoom` **required** (no longer optional as on the override types):

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `center` | `[number, number]` | yes | Resolved `[lng, lat]`. |
| `zoom` | `number` | yes | Resolved zoom. |
| `pitch` | `number` | no | Camera tilt. |
| `bearing` | `number` | no | Camera rotation. |
| `flySpeed` | `number` | no | `flyTo` speed for the transition into this step. |
| `opacity` | `number` | no | Canvas opacity for this step. |
| `pins` | `MapPin[]` | no | Resolved pins (note: `MapPin`, which carries the runtime-only `opacity` field absent from the author-facing `MapPinConfig`). |
| `regions` | `MapRegionLayer` | no | Resolved choropleth. |
| `heatmap` | `HeatmapLayer` | no | Resolved heatmap. |
| `textLabels` | `MapTextLabel[]` | no | Resolved free text labels. |

This is a "resolved type, not an authoring surface" clarification — authors never write a `MapStep`
directly. The authoring fields that produce it are fully documented in `21-map-config`.

### Gap 3 — `Frontmatter` parsing-default subtleties

`40-defaults-theme` documents every `Frontmatter` field, default, and required-ness correctly
(`title`/`subtitle`/`byline`/`date`/`theme` required; `status`/`listed`/`aura`/`vertical`/`format`
optional with their missing-value defaults). One late-binding nuance worth pinning explicitly,
from the doc comments in `packages/viz-engine/src/types/story.ts`:

- `status` missing → treated as `'published'` (back-compat), so an unset `status` is **published**,
  not draft.
- `listed` missing → `true` (appears on the home grid).
- `format` missing → `'map'` (so every pre-deck story keeps rendering through the map shell unchanged).
- `vertical` referencing an unregistered slug → **ignored with a `console.warn`** (`loadVertical`
  in `packages/viz-engine/src/verticals.ts`), the story still renders with only the core 13 modules.

### Gap 4 — Vertical-registered modules / layouts are extension points, correctly scoped out

Both registries are open: `registerVizModule()` (`registry.ts`) and `registerForegroundLayout()`
(`foregroundLayouts.ts`) let a vertical bundle add types/layouts at boot via `loadVertical()`
(`verticals.ts`). The drafted sections correctly document only the **core** 13 modules and 11
layouts and note the extension mechanism. The `starship:viewer` type referenced in examples
(e.g. `50-modules-overview`, `31-layouts` `STACK_VISUAL_TYPES`) is a vertical module, not core —
this is consistent across the drafts and is not a gap, but is flagged here so a reader does not
expect a `51`–`62`-style section for it. No core module or layout is missing.

### Gap 5 — `AdminFormField` is documented; one cross-reference worth tightening

`50-modules-overview` documents all seven `AdminFormField` kinds (`asset`, `text`, `number`,
`boolean`, `select`, `theme-token`, `json`). The per-module sections (e.g. `53-module-embed`)
correctly note where a config field is deliberately **omitted** from a module's `adminForm`
(e.g. embed's `allow` / `referrerPolicy` are YAML-only). This is accurate; the only tightening
worth making is a single cross-link from each module's "adminForm fields" subsection back to the
`AdminFormField` kind table in `50` so the field-kind vocabulary is defined once. Low severity.

### Verification checklist

Legend: ✓ = covered to field/default level in the drafted sections; ✗ = absent. "Covered in"
lists the drafted section file id(s) that document it.

#### Module types (`packages/viz-engine/src/registry.ts` — 13 core)

| Module `type` | Covered | Covered in |
| --- | --- | --- |
| `chart` | ✓ | 51-module-chart (+ 50 registry table) |
| `map` | ✓ | 20-map-shell, 21-map-config (+ 50 registry table) |
| `image` | ✓ | 52-module-image |
| `embed` | ✓ | 53-module-embed |
| `video` | ✓ | 54-module-video |
| `rive` | ✓ | 55-module-rive |
| `text` | ✓ | 56-module-text |
| `bigStat` | ✓ | 57-module-bigStat |
| `bodyText` | ✓ | 58-module-bodyText |
| `quote` | ✓ | 59-module-quote |
| `keyValue` | ✓ | 60-module-keyValue |
| `imageGrid` | ✓ | 61-module-imageGrid |
| `table` | ✓ | 62-module-table |

#### Foreground layout names (`packages/viz-engine/src/foregroundLayouts.ts` — 11 core)

| Layout name | Covered | Covered in |
| --- | --- | --- |
| `single-fill` | ✓ | 31-layouts |
| `split-37-63-two-row` | ✓ | 31-layouts |
| `hero-full-bleed` | ✓ | 31-layouts (+ 20-map-shell hero special case) |
| `text-left-chart-right` | ✓ | 31-layouts (deck "free" layouts) |
| `text-left-quote-right` | ✓ | 31-layouts |
| `image-left-text-right` | ✓ | 31-layouts |
| `stat-top-chart-below` | ✓ | 31-layouts |
| `stat-left-chart-right` | ✓ | 31-layouts |
| `chart-top-text-below` | ✓ | 31-layouts |
| `centered` | ✓ | 31-layouts |
| `free` | ✓ | 31-layouts |

Plus the two module-level constants `DEFAULT_FOREGROUND_LAYOUT` (`split-37-63-two-row`) and
`FLAT_FOREGROUND_LAYOUT` (`single-fill`) — both covered in 31-layouts.

#### SectionKind values (`packages/viz-engine/src/lib/storyConfig.types.ts` — 12)

| Kind | Covered | Covered in |
| --- | --- | --- |
| `text` | ✓ | 32-sections |
| `hero` | ✓ | 32-sections |
| `stat` | ✓ | 32-sections |
| `cover` | ✓ | 32-sections |
| `bigStat` | ✓ | 32-sections |
| `bodyText` | ✓ | 32-sections |
| `split` | ✓ | 32-sections |
| `data` | ✓ | 32-sections |
| `gallery` | ✓ | 32-sections |
| `quote` | ✓ | 32-sections |
| `divider` | ✓ | 32-sections |
| `closing` | ✓ | 32-sections |

#### Render modes

| Mode | Covered | Covered in |
| --- | --- | --- |
| Interactive reader (`scroll`) | ✓ | 10-overview, 20-map-shell, 30-deck-shell |
| Autoplay (video) | ✓ | 10-overview, 20-map-shell |
| Share cards | ✓ | 70-share |
| Report (PDF) | ✓ | 71-pdf-report-slides |
| Slides | ✓ | 71-pdf-report-slides |
| Embed (web & native) | ✓ | 72-embed |

#### Supporting config interfaces

| Type | Covered | Covered in |
| --- | --- | --- |
| `StoryDefaults` (all fields) | ✓ | 40-defaults-theme |
| `Frontmatter` / `Theme` | ✓ | 40-defaults-theme |
| `MapPalette` | ✓ | 21-map-config, 40-defaults-theme |
| `basemapConfig` (Standard styles) | ✓ | 21-map-config, 40-defaults-theme |
| `StoryBackgroundConfig` (4 variants) | ✓ | 30-deck-shell, 40-defaults-theme |
| `OverlayConfig` / `DeckScrollConfig` | ✓ | 30-deck-shell, 40-defaults-theme |
| `VizLayerStyle` / `VizLayerPanel` | ✓ | 31-layouts, 50-modules-overview |
| `VizMountingMode` | ✓ | 50-modules-overview |
| `AdminFormField` (7 kinds) | ✓ | 50-modules-overview |
| `StatColor` (7 tokens) | ✓ | 32-sections, 40-defaults-theme |
| `LogoPalette` (7 slots) | ✓ | 40-defaults-theme |
| `MapRegionLayer` / `MapRegion` / labels / legend | ✓ | 21-map-config |
| `HeatmapLayer` / `HeatmapPoint` | ✓ | 21-map-config |
| `MapTextLabel` / `MapPinConfig` / `MapPin` | ✓ | 21-map-config |
| All `Share*` interfaces (`ShareConfig`, section/subsection overrides, `ShareMapAspectOverride`, `MapPinOverride`, `ShareLayerVisibility`, `Share{Chart,Hero,Stat}Override`, `ShareAspectRatio`) | ✓ | 70-share |
| `<slug>.report.yaml` (`ReportConfig` / `ReportPageOverride` / `mapOverride` / `PinOverride`) | ✓ | 71-pdf-report-slides |
| `ResolvedUnit` | ✓ | 32-sections |
| `BlockType` / `Block` (markdown body) | ✗ → documented here | Appendix Gap 1 |
| `MapStep` (resolved runtime camera) | partial (named, not tabled) → documented here | Appendix Gap 2; 20/21 reference it |

---

## Maintaining this document

This reference is hand-maintainable but was generated by reading the engine source. When you change the render engine, update the matching section here. The authoritative sources, by area:

| Area | Source of truth |
| --- | --- |
| Story formats / frontmatter | `packages/viz-engine/src/types/story.ts` |
| Render config types (defaults, sections, map, share) | `packages/viz-engine/src/lib/storyConfig.types.ts` |
| Module + layout + slot framework types | `packages/viz-engine/src/types.ts` |
| Registered modules | `packages/viz-engine/src/registry.ts` + `packages/viz-engine/src/modules/*` |
| Registered foreground layouts | `packages/viz-engine/src/foregroundLayouts.ts` |
| Map shell + deck shell | `packages/story-reader/src/components/story/StoryMapShell.tsx`, `MapStorySection.tsx` |
| Slot dispatch | `packages/viz-engine/src/{ForegroundVizSlot,ForegroundLayoutSlot,BackgroundVizSlot}.tsx` |
| Render-mode routes | `apps/vizmaya-fyi/app/story/[slug]/**` |
| Share / report / embed | `apps/vizmaya-fyi/{components/share,components/pdf,lib/storyReportConfig.ts}`, `packages/story-embed/src/*` |

A quick completeness check: every entry in `registry.ts` should have a `Module:` section, every name in `foregroundLayouts.ts` should appear under *Foreground layouts*, and every `SectionKind` value should appear under *Section kinds* — see the Verification checklist in the appendix.
