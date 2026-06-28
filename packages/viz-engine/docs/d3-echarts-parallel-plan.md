# Plan: support D3 and ECharts in parallel

Companion to `d3-vs-echarts.md`. This is the implementation plan to let both
engines coexist in `@vismay/viz-engine` without one's conventions leaking into
the other.

The goal is **not** a unified "chart abstraction" — that's an anti-pattern that
loses the strengths of both libs. The goal is a shared **chart contract**
(theme, sizing, readiness, mobile, export) that each engine implements on its
own terms, plus a registry that can dispatch to either.

---

## Implementation status

**Phases 0 and 1 are implemented** — D3 and ECharts now run in parallel.

Landed:
- `charts/_shared/types.ts` — the renderer-agnostic contract (`ChartRenderProps`,
  `ChartEngine`, `RegisteredChart`).
- `charts/registry.ts` + a rewritten `charts/ChartPanel.tsx` that lazily
  `import()`s each chart, so engines code-split per chart (verified: a route
  using only the D3 chart does not load the `echarts-for-react` chunk).
- ECharts charts moved to `charts/echarts/`; `chartTooltip` moved to
  `charts/echarts/_kit/tooltip.ts` so `lib/chartTheme.ts` is engine-agnostic.
- `charts/d3/BeeswarmChart.tsx` — first D3 chart (`beeswarm-example`), wired
  through the same theme/mobile contract; deterministic SVG (no force sim) so
  capture rasterises identically each run.
- D3 submodule deps added to `package.json`; ESLint cross-engine guardrails in
  `eslint.config.mjs`; a package `tsconfig.json` + `typecheck`/`lint` scripts.
- Demo route at `apps/catalog/app/d3-demo/`.

Deliberate deviations from the original plan below:
- **A third `engine: 'svg'` category** was added for hand-built charts that use
  no charting library (`QatarPlantMap`, `FeedbackLoopDiagram`). They stay at the
  `charts/` root rather than being forced into `echarts/` or `d3/`.
- **Readiness stays in the chart module wrapper.** `noteReady` increments a
  shared counter, so signalling it from both the wrapper and the chart would
  flip `__pdfReady__` early. The wrapper keeps owning the single rAF signal;
  the ECharts `finished`-event rewire (§3.5) is deferred until the wrapper's
  signal is removed per-chart. `noteReady` is therefore not in `ChartRenderProps`.
- **Observable Plot is deferred to Phase 2.** Phase 1 uses raw `d3-*` modules;
  `@observablehq/plot` and the `plot:<id>` path are not yet added.

The sections below are the original plan, kept for the Phase 2–4 roadmap.

---

## 1. Guiding principles

1. **ECharts stays the default** for dashboard staples and JSON-driven
   ingest. Don't migrate working charts.
2. **D3 is opt-in per chart**, picked by the author when the chart type is
   bespoke, editorial, or needs SVG-first output.
3. **One renderer per chart instance.** No mixing within a single chart.
4. **Shared contract, separate implementations.** Theme, readiness, mobile,
   tooltip styling, and export formats are shared concerns. The rendering
   path is not.
5. **Code-split aggressively.** A story that uses only ECharts must not
   download D3, and vice versa.

---

## 2. Today's contract (what charts must honor)

From reading `packages/viz-engine/src/charts/ChartPanel.tsx`,
`src/charts/GenericChart.tsx`, `src/lib/chartTheme.ts`,
`src/lib/storyReadiness.ts`, and `src/modules/chart/Component.tsx`, a chart
today owes the engine:

| Concern        | Current ECharts shape                                                                 | Where it lives                              |
|----------------|---------------------------------------------------------------------------------------|---------------------------------------------|
| Registry id    | String key in `ChartPanel`'s switch; `data:<id>` routes to `GenericChart`              | `charts/ChartPanel.tsx`                     |
| Theming        | `useChartColors()` → `ChartColors` object; story-driven via `ChartColorsProvider`      | `lib/chartTheme.ts`                         |
| Mobile         | `useIsMobile()` (matchMedia, `useSyncExternalStore`)                                   | `lib/chartTheme.ts`                         |
| Tooltip        | `chartTooltip(colors, mobile)` returns ECharts-shaped option                           | `lib/chartTheme.ts`                         |
| Sizing         | Component fills 100% width/height of slot; respects `minHeight` mobile/desktop         | per-chart, e.g. `GenericChart.tsx:176`      |
| Readiness      | `noteReady()` once first-paintable; module wrapper calls it via `requestAnimationFrame` (TODO: ECharts `finished` event) | `modules/chart/Component.tsx`               |
| Export bg      | Paint canvas with theme `--color-bg` to dodge landscape-PDF alpha bug                  | `GenericChart.tsx:142-148`                  |
| JSON authoring | `data:<id>` → `/api/chart-data/<slug>/<id>.json` → ECharts option with `$token` colors | `GenericChart.tsx`                          |

The plan extracts a **renderer-agnostic** version of the first six concerns,
keeps ECharts as one implementation, and adds a D3 implementation alongside.

---

## 3. Proposed shape

### 3.1 Folder layout

```
packages/viz-engine/src/
├── charts/
│   ├── ChartPanel.tsx                      # registry + dispatcher (unchanged role)
│   ├── _shared/                            # renderer-agnostic primitives (new)
│   │   ├── ChartFrame.tsx                  # sizing, ref, bg paint, readiness hooks
│   │   └── types.ts                        # ChartRenderProps, ChartEngine
│   ├── echarts/                            # ECharts charts (moved)
│   │   ├── PolarExposureChart.tsx
│   │   ├── HBMDRAMTreemap.tsx
│   │   ├── GenericChart.tsx                # JSON-driven, data:* prefix
│   │   └── ...
│   └── d3/                                 # D3 / Observable Plot charts (new)
│       ├── _kit/                           # shared D3 helpers
│       │   ├── ssr.ts                      # jsdom-backed serializer
│       │   └── motion.ts                   # GSAP/d3-transition helpers
│       ├── GenericPlot.tsx                 # JSON-driven Observable Plot (parallel to GenericChart)
│       └── BeesWarmExample.tsx             # first bespoke chart
├── lib/
│   ├── chartTheme.ts                       # split: keep useChartColors, useIsMobile;
│   │                                       #        move ECharts-shaped chartTooltip → echarts/
│   └── chartTheme.echarts.ts               # ECharts-flavored helpers (chartTooltip, tokenizers)
└── modules/chart/
    ├── Component.tsx                       # unchanged module entry
    └── index.ts                            # config schema gains `engine?: 'echarts' | 'd3'` (optional, inferred from id)
```

Rules:
- `charts/_shared/` is **renderer-agnostic** and may not import `echarts` or
  `d3-*`.
- `charts/echarts/` may import `echarts` / `echarts-for-react` but not `d3-*`.
- `charts/d3/` may import `d3-*` / `@observablehq/plot` but not `echarts`.
- The dispatcher (`ChartPanel.tsx`) imports lazily so a story only pulls in
  the engine(s) it uses.

### 3.2 The chart contract

```ts
// packages/viz-engine/src/charts/_shared/types.ts
export interface ChartRenderProps {
  slug: string
  activeStep: number
  /** Call once on first paintable frame so capture pipelines unblock. */
  noteReady: () => void
}

export type ChartEngine = 'echarts' | 'd3'

/** Every registered chart is one of these. */
export interface RegisteredChart {
  id: string
  engine: ChartEngine
  /** Dynamic import so the engine bundle splits cleanly. */
  load: () => Promise<{ default: React.ComponentType<ChartRenderProps> }>
}
```

The contract is intentionally tiny: a chart is a component that takes
`{ slug, activeStep, noteReady }` and renders something. Theming, mobile,
tooltip styling are pulled from hooks (`useChartColors`, `useIsMobile`) the
chart imports itself — no contract change needed.

### 3.3 The registry

Replace today's switch in `ChartPanel.tsx` with a map:

```ts
// packages/viz-engine/src/charts/registry.ts
import type { RegisteredChart } from './_shared/types'

export const CHART_REGISTRY: Record<string, RegisteredChart> = {
  'polar-exposure':    { id: 'polar-exposure',    engine: 'echarts', load: () => import('./echarts/PolarExposureChart') },
  'hbm-treemap':       { id: 'hbm-treemap',       engine: 'echarts', load: () => import('./echarts/HBMDRAMTreemap') },
  // ... rest of the existing ECharts charts ...
  'beeswarm-example':  { id: 'beeswarm-example',  engine: 'd3',      load: () => import('./d3/BeesWarmExample') },
}
```

`ChartPanel` becomes:

```tsx
export default function ChartPanel({ chartId, activeStep = 0, slug }: Props) {
  if (chartId?.startsWith('data:'))  return <GenericChart   slug={slug!} id={chartId.slice(5)} activeStep={activeStep} />
  if (chartId?.startsWith('plot:'))  return <GenericPlot    slug={slug!} id={chartId.slice(5)} activeStep={activeStep} />
  const entry = chartId ? CHART_REGISTRY[chartId] : undefined
  if (!entry) return null
  const LazyChart = useMemo(() => lazy(entry.load), [entry])
  return <Suspense fallback={null}><LazyChart slug={slug ?? ''} activeStep={activeStep} noteReady={...} /></Suspense>
}
```

Two id-prefix conventions stay parallel:
- `data:<id>` → ECharts JSON (existing, unchanged)
- `plot:<id>` → Observable Plot JSON (new)

Authors who write hand-built charts register a bare id and the engine is
declared in the registry.

### 3.4 Theming split

`lib/chartTheme.ts` today mixes:
- `useChartColors`, `useIsMobile`, `ChartColors`, `themeToChartColors` — **engine-agnostic**
- `chartTooltip(colors, mobile)` returning an ECharts option — **engine-specific**

Refactor:
- Keep the agnostic exports in `lib/chartTheme.ts`.
- Move `chartTooltip` to `charts/echarts/_kit/tooltip.ts`.
- Add `charts/d3/_kit/tooltip.tsx` — a React component that renders the
  tooltip surface to match ECharts' visual (same `chromeBg`, `chromeText`,
  borders, mono font) so the two engines look the same on the page.

### 3.5 Readiness

Today `modules/chart/Component.tsx` signals readiness on the next animation
frame. That's a TODO comment; the real signal for ECharts is the `finished`
event. Both engines need a clean implementation:

- ECharts: pass an `onChartReady` (or listen for `finished` event) and call
  `noteReady`. Update the existing wrapper.
- D3: chart calls `noteReady()` itself after its draw pass / transition's
  `.on('end', ...)`. For Observable Plot, after the first
  `useEffect`-driven render.

Add to `_shared/types.ts`:

```ts
export interface ChartReadyHelpers {
  noteReady: () => void
}
```

…and pass it through `ChartPanel` to every chart, not just JSON-driven ones.
This unblocks PDF/share/video capture for D3 charts on day one.

### 3.6 Export & SSR

D3 unlocks a real SVG-SSR path for share cards. Plan:

1. **Phase A**: client-only D3 charts. They render in the browser like
   ECharts charts; the capture pipeline screenshots them via the same
   `__pdfReady__` flag.
2. **Phase B**: opt-in SSR for D3 charts. Add a sibling
   `renderToStaticSvg({ slug, id, activeStep }): Promise<string>` to D3
   chart modules that need it. The share-card pipeline can prefer the SSR
   path when it exists and skip the headless browser entirely.
3. **Phase C**: ECharts SSR via the official `ssr: true` flag for stories
   whose chart is the share-card subject. Out of scope for the first cut.

Concrete change for Phase A only:

```ts
// charts/d3/_kit/ssr.ts (Phase B; document the export shape now even if unused)
export interface D3SsrModule {
  /** Optional. Present means "I can render server-side to static SVG." */
  renderToStaticSvg?: (props: { slug: string; activeStep: number; colors: ChartColors }) => Promise<string>
}
```

### 3.7 PDF alpha workaround

Today `GenericChart.tsx:142-148` paints the canvas with the theme `--color-bg`
to dodge a Chromium landscape-PDF alpha bug. The workaround is **canvas-only**:
D3-SVG charts don't need it. Document this in `_shared/ChartFrame.tsx`:

```ts
// ChartFrame paints the theme bg only when wrapping a canvas-based chart.
// SVG-based charts skip this — the PDF compositor handles SVG alpha correctly.
```

Pass a `renderer: 'svg' | 'canvas'` hint from each chart wrapper so
`ChartFrame` knows whether to paint.

### 3.8 Bundle / code-splitting

The registry uses `() => import(...)` per chart. Pair with two import hygiene
rules enforced by ESLint:

- `no-restricted-imports`: forbid `echarts*` in `charts/d3/**` and `d3*` /
  `@observablehq/plot` in `charts/echarts/**`.
- Forbid both engines in `charts/_shared/**` and `lib/chartTheme.ts`.

This guarantees a story that only uses one engine ships only one engine's
JS — no manual `dynamic()` calls needed at the call site.

---

## 4. Dependency changes

Add to `packages/viz-engine/package.json`:

```json
{
  "dependencies": {
    "d3-array":         "^3.2.4",
    "d3-axis":          "^3.0.0",
    "d3-color":         "^3.1.0",
    "d3-format":        "^3.1.0",
    "d3-geo":           "^3.1.1",
    "d3-hierarchy":     "^3.1.2",
    "d3-interpolate":   "^3.0.1",
    "d3-scale":         "^4.0.2",
    "d3-selection":     "^3.0.0",
    "d3-shape":         "^3.2.0",
    "d3-time-format":   "^4.1.0",
    "d3-transition":    "^3.0.1",
    "@observablehq/plot": "^0.6.16"
  },
  "devDependencies": {
    "@types/d3-array":      "^3",
    "@types/d3-axis":       "^3",
    "@types/d3-color":      "^3",
    "@types/d3-format":     "^3",
    "@types/d3-geo":        "^3",
    "@types/d3-hierarchy":  "^3",
    "@types/d3-interpolate":"^3",
    "@types/d3-scale":      "^4",
    "@types/d3-selection":  "^3",
    "@types/d3-shape":      "^3",
    "@types/d3-time-format":"^4",
    "@types/d3-transition": "^3"
  }
}
```

Do **not** add `d3` (the umbrella). Submodule imports tree-shake; the
umbrella defeats it.

Defer until Phase B SSR: `jsdom` (or `linkedom`) as a peer of the export
pipeline only — not of `viz-engine` itself.

---

## 5. Phased rollout

### Phase 0 — refactor without behavior change (1 PR, ~1 day)

Goal: pure refactor, all existing tests pass, no new deps.

- Move existing ECharts charts to `charts/echarts/` (filename-preserving).
- Convert `ChartPanel.tsx`'s switch into the registry map.
- Extract `_shared/types.ts` (`ChartRenderProps`, `ChartEngine`).
- Split `chartTheme.ts`: leave palette/mobile hooks; move ECharts-shaped
  `chartTooltip` to `charts/echarts/_kit/tooltip.ts`.
- Wire ECharts charts to call `noteReady` via the `finished` event
  (replaces the current `requestAnimationFrame` TODO).
- Add ESLint rules forbidding cross-engine imports.

Acceptance: all existing stories render byte-identical screenshots; no
behavioral change.

### Phase 1 — first D3 chart end-to-end (1 PR, ~1–2 days)

Goal: prove the parallel path works.

- Add D3 submodule deps + `@observablehq/plot`.
- Add `charts/d3/BeesWarmExample.tsx` — a real D3 chart wired through the
  same theme/readiness/mobile/tooltip contracts as ECharts charts.
- Add a story (or a `catalog` app entry) that uses it.
- Verify: bundle analyzer shows the story pulls D3 + Plot but not ECharts;
  a story without `beeswarm-example` doesn't pull D3 at all.
- Verify: capture pipeline produces a clean PDF (no alpha workaround needed
  because it's SVG).

### Phase 2 — JSON-driven D3 ("plot:" prefix) (1 PR, ~2–3 days)

Goal: ingest-style content authoring for D3, parallel to `data:` for
ECharts.

- Add `charts/d3/GenericPlot.tsx`:
  - reads `/api/chart-data/<slug>/<id>.json`
  - JSON shape mirrors Observable Plot's options (marks, scales, etc.)
  - same `$token` color replacement
  - same mobile tooltip suppression
- Document the JSON schema in
  `packages/viz-engine/docs/generic-plot-schema.md`.
- Wire `plot:<id>` in `ChartPanel.tsx`.
- Update `apps/vizmaya-fyi`'s ingest pipeline so authors can emit either
  format (one story per format in the first PR).

### Phase 3 — D3-SSR for share cards (1 PR, ~2 days)

Goal: SVG-first export path for the share-card-doctor pipeline.

- Add `renderToStaticSvg` to one D3 chart.
- Update `apps/vizmaya-fyi/docs/share-card-doctor-plan.md`-related code
  to prefer SSR output when present.
- Compare share-card output: D3-SSR vs ECharts-canvas-screenshot.
  Document the visual diff and any blocker.

### Phase 4 — opportunistic migration (ongoing)

Goal: move bespoke ECharts charts that fight the schema over to D3 when
they get touched anyway.

Candidates to consider (each is a single small PR):
- `FeedbackLoopDiagram` — likely a diagram, almost certainly cleaner in
  D3 or even bare SVG.
- `PolarExposureChart` — radial layout with custom highlight logic; D3
  would be more direct.
- Any future scrolly-explainer chart.

Non-candidates (keep on ECharts indefinitely):
- `StockCandlestickChart` — ECharts' `candlestick` is excellent.
- `*Treemap` — ECharts' treemap + drill-in is hard to beat.
- Any chart with `dataZoom`, `brush`, or cross-chart `connect`.
- All `data:` JSON charts unless we have a specific reason.

---

## 6. Author-facing decision tree

To put in `packages/viz-engine/docs/d3-vs-echarts.md` as an appendix once
the registry lands:

```
Need a chart? Start here.

├── Is it a standard type (line/bar/area/scatter/pie/treemap/
│   candlestick/sankey/heatmap/radar)?
│   ├── Yes → ECharts.
│   │   ├── One-off, content-driven values? → emit `data:<id>` JSON via ingest.
│   │   └── Hand-built with logic? → new file in `charts/echarts/`.
│   └── No, it's bespoke (beeswarm, hexbin, chord, custom illustration,
│        annotation-heavy explainer, diagram).
│       └── D3 (or Observable Plot).
│           ├── Tabular shape Plot can express? → emit `plot:<id>` JSON.
│           └── Otherwise → new file in `charts/d3/` using D3 modules.
│
├── Does the chart need 5k+ marks?
│   └── ECharts (canvas) is easier than building a D3 canvas path.
│
├── Does it need to render as static SVG for share/PDF without a browser?
│   └── D3 (or Plot) with `renderToStaticSvg`.
│
└── Does it need pan/zoom/brush/data-zoom out of the box?
    └── ECharts.
```

---

## 7. Risks & mitigations

| Risk                                                                 | Mitigation                                                              |
|----------------------------------------------------------------------|-------------------------------------------------------------------------|
| Authors don't know which engine to pick                              | Decision tree in §6; lint rule warns when a registered chart is in the "wrong" folder for its imports |
| Two engines = two flavors of tooltip / legend / mobile behavior      | `_shared/` + `d3/_kit/tooltip.tsx` mirror ECharts visuals so both feel identical |
| Bundle bloat from accidentally importing both                        | ESLint `no-restricted-imports` per folder; bundle-size budget check in CI |
| Readiness contract drift breaks PDF capture                          | Phase 0 already wires ECharts `finished` event; Phase 1 puts D3 on the same contract; the PDF settler timeout (`FALLBACK_TIMEOUT_MS`) guards regressions |
| D3-SSR introduces a Node-only render path the ingest pipeline doesn't yet support | Phase 3 is gated behind `renderToStaticSvg?` being optional; share-card pipeline falls back to client screenshot when absent |
| Engine churn (D3 v8, ECharts v7) doubles upgrade work                | Pin minor versions in `package.json`; both libs have slow, predictable releases |
| The `data:` and `plot:` JSON schemas diverge confusingly             | Document both side-by-side in one file; the `$token` color convention is shared |

---

## 8. What this plan deliberately does NOT do

- **No "ChartSpec" abstraction** that compiles to either engine. That's the
  trap. Vega/Vega-Lite is the existence proof that it's hard, and even if
  we built one we'd lose access to engine-specific superpowers (ECharts'
  universal transitions; D3's force/zoom/brush composition).
- **No mandatory migration** of working ECharts charts. They stay until
  there's a concrete reason to move.
- **No new chart-builder UI.** Authoring stays in JSON for ingest paths and
  TSX for hand-built; the only new authoring surface is the `plot:` JSON
  shape, which is just Observable Plot's option object.
- **No render-engine swap mid-story.** Stories that need both kinds get
  both, but each chart picks one and sticks with it.

---

## 9. Estimated effort

| Phase | Scope                                | Effort       |
|-------|--------------------------------------|--------------|
| 0     | Refactor to registry + folder split  | ~1 day       |
| 1     | First D3 chart end-to-end            | ~1–2 days    |
| 2     | `plot:` JSON-driven charts           | ~2–3 days    |
| 3     | D3-SSR for share cards               | ~2 days      |
| 4     | Opportunistic migration              | ongoing      |

Phases 0 and 1 are the minimum to call this "supported in parallel." Phases
2–4 are value-adds we can sequence based on actual story needs.
