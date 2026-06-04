# Deck layout de-hardcode — assessment & approach

**Roadmap item:** ④ Grow Deck format · Track B
**Target:** [`packages/viz-engine/src/foregroundLayouts.ts`](../packages/viz-engine/src/foregroundLayouts.ts)
**Generated:** June 4, 2026 · basis: read of `foregroundLayouts.ts`, `ForegroundLayoutSlot.tsx`, and `apps/admin/components/vizmaya/DeckComposerPanel.tsx`

---

## TL;DR

The roadmap calls this *"de-hardcode the ~30 layouts in code."* In reality there are **~11 registered layouts, and 8 of them are identical no-op stubs** that collapse to the same box. So the task is less a mechanical extraction and more: **make layout names mean something and make them data-driven**, which then unblocks per-section overrides and share-card variations. It's a *design* task (the config shape is the real decision), it's **independent of auth (#161) and the ⑤ research-source decision**, and the admin/AI side mostly comes along for free because it already reads the layout registry.

---

## What it actually is (vs. how the roadmap frames it)

`foregroundLayouts.ts` registers ~11 layouts, but the shape matters more than the count:

- **Real layouts:** `single-fill`, `split-37-63-two-row` (+ portrait variant), `hero-full-bleed`.
- **8 "deck" names** (`text-left-chart-right`, `text-left-quote-right`, `image-left-text-right`, `stat-top-chart-below`, `stat-left-chart-right`, `chart-top-text-below`, `centered`, `free`) are generated from a string array and **all collapse to the same `DECK_SAFE_AREA` box**. They carry no distinct geometry. The file's own comment says they exist so "authors signal intent and the admin form / preview can render the right scaffolding" — the actual positioning is done **per-slot** via `style.position` + `style.size`.

So "de-hardcode the layout list" rests on a looser premise than stated: there isn't a rich list of geometries trapped in code — there are 8 placeholder names with no real layout behind them. (This mirrors how the roadmap's `rohit/test` reads were corrected against the repo.)

## What's already in place (so the task is smaller than it sounds)

- A registry seam already exists: `registerForegroundLayout()` / `getForegroundLayout()` / `listForegroundLayouts()` — and verticals can register their own layouts without touching core.
- The admin **`DeckComposerPanel`** and the AI canvas routes (`canvas/evaluate`, `canvas/fix`) already **read the registry** (`knownLayouts`) to validate a section's `layout` and warn on an unknown one. They do **not** hardcode a layout list. So once layouts are config-driven, the admin + AI validation comes along largely for free.

## What it unblocks (the roadmap's payoff)

1. **Per-section overrides** — a section could adjust its region geometry inline instead of someone adding a new hardcoded TS layout. (`section.layout` already exists; the gap is overriding *regions*.)
2. **Share-card variations** — the social / OG share card could render a different crop or framing of a section than the on-page layout.

## The real work — and the decision inside it

The core fork is **how a layout becomes data**:

1. A config file (JSON/YAML) of `ForegroundLayoutDef`s loaded into the registry at boot.
2. Give the 8 deck names **real** region splits (so `text-left-chart-right` actually maps slots to a left/right region instead of one fill box).
3. Let story / section YAML define **inline `regions`**, with the named layouts as presets.

These aren't mutually exclusive — the likely answer is **(2) + (3)**. Because it's genuinely multi-approach, this wants a short **plan checkpoint before coding**.

## Scope · risk · dependencies

| | |
|---|---|
| **Effort** | The Deck track is scoped ~10–18h; this is its leverage piece — a solid multi-file change in `viz-engine` + light admin wiring. |
| **Blast radius** | Medium — touches the foreground render path (`ForegroundLayoutSlot`, `ForegroundVizSlot`) every Deck story uses. Verify against the catalog + a real Deck story (spacex-ipo / paris) for no render regression. |
| **Dependencies** | ✅ Independent of #161 (auth) and Decision 2 (research source) — fully parallelizable. Independent of `f1_backend`. |
| **Ownership** | This is roadmap **Track B (Rohit + 1)**, not Track A. Picking it up means doing Track B work — reasonable since auth landed early and freed capacity, but worth naming. |

## Recommendation

A real, unblocked, critical-path improvement — but a **design** task (config shape) more than a mechanical de-hardcode. Recommended path: a short plan (approach **(2)+(3)**) for sign-off, then build in `viz-engine` with catalog + Deck-story verification. Can run in parallel while #161 is tested and Decision 2 is pending.

---

*Generated June 4, 2026 · basis: direct read of the layout registry and its admin/AI consumers, verified against the repo on `main`.*
