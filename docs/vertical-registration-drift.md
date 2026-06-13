# Bug: vertical-registration drift across the centralized render surface

**Status:** RESOLVED (root cause) — option A landed: one declarative registry (`@vismay/verticals`) every site consumes; `@source` lists generated from it.
**Severity:** latent-but-recurring — silently breaks a vertical's modules in admin/preview surfaces, no error
**Discovered:** Jun 13, 2026 (via the f1 driver-standings grid collapse)
**Fixed by:** [vertical-registry-plan.md](vertical-registry-plan.md) (option A, all phases) — see "Resolution" below. North star is still roadmap item ⑧ / option C in [roadmap-june-2026.md](roadmap-june-2026.md) (extract the render engine).

---

## One-line

`vizmaya-fyi` is both the vizmaya.fyi consumer brand **and** the universal headless render surface every vertical iframes into; the per-vertical wiring that makes that work is **hand-copied across ≥4 uncoordinated sites with no single source of truth**, so the lists silently drift and a vertical's modules break in some surfaces but not others.

## Why this exists

Leftover from the centralization scope — vizmaya was the whole product before the multi-domain split. When verticals (footshorts, vizf1, kidzovo, starship) were added, the *render engine* stayed centralized in `vizmaya-fyi`:

- Consumer apps' `/editorial/<slug>` routes are facades that **iframe `vizmaya.fyi`'s source render** (see `appStoryUrl` comment in [apps/admin/lib/publicSite.ts](apps/admin/lib/publicSite.ts)).
- The admin canvas signs **every** preview iframe (canvas-frame / autoplay / share / slides / report) against `vizmayaPublicUrl` ([apps/admin/components/canvas/CanvasPage.tsx](apps/admin/components/canvas/CanvasPage.tsx)) — its comment already protests this is "not a vizmaya-only coupling," which is the tell.

The render *engine* being shared is fine and desirable (StoryShell, snap/scroll, autoplay capture, PDF/video/audio dispatch are genuinely vertical-agnostic and expensive to duplicate). The defect is the **leaky registration seam**, not the centralization itself.

## The drift surfaces

The same per-vertical fact is restated, by hand, in all of these:

| Switchboard | File | What it lists |
|---|---|---|
| Client vertical loader (consumer) | `apps/vizmaya-fyi/components/VerticalLoader.tsx` | `registerVerticalLoader(slug → bundle)` |
| Client vertical loader (canvas) | [apps/admin/components/canvas/VerticalLoader.tsx](apps/admin/components/canvas/VerticalLoader.tsx) | same list |
| Server module-type discovery | [apps/admin/lib/vizmayaModuleTypes.ts](apps/admin/lib/vizmayaModuleTypes.ts) (`ensureLoadersRegistered`) | same list again |
| Tailwind class scanning | `globals.css` ×4 (admin, catalog, vizmaya-fyi, kidzovo) | `@source` per viz package |
| Public/preview routing | `APP_PUBLIC_ROUTES` + theme tokens in [apps/admin/lib/publicSite.ts](apps/admin/lib/publicSite.ts) | per-app base URL + story/epic paths |

## Confirmed drift (Jun 13, 2026)

1. **Tailwind `@source` gap → grid collapse.** `vizmaya-fyi/app/globals.css` scanned only `packages/story-reader/src`, omitting the vertical viz packages it renders headlessly. The f1 driver-standings module sets its columns with the package-only arbitrary class `grid-cols-[28px_1fr_60px_40px_40px]` (in [verticals/f1-viz/src/web/DriverStandings.tsx](verticals/f1-viz/src/web/DriverStandings.tsx)). With it purged, `display:grid` fell back to one implicit column and the 5 cells stacked vertically — visible in the vizf1 canvas **Autoplay 9:16** preview (rendered by vizmaya-fyi) while the canvas **editor leaf** (rendered inline by admin, which *does* `@source` f1-viz) looked correct. **Fixed in PR #219** for f1-viz + footshorts-viz; the *class* of bug remains.

2. **`starship` loader gap.** Registered in `vizmaya-fyi/components/VerticalLoader.tsx` but **missing** from both `apps/admin/components/canvas/VerticalLoader.tsx` and `apps/admin/lib/vizmayaModuleTypes.ts`. Effect: a starship story edited at `vismay.xyz/starship/<slug>/canvas` doesn't get its vertical loader registered → the "+ add layer" picker falls back to core types and inline leaf render can't resolve starship module types. **Fixed by the registry** (registerAllVerticals registers all four by construction).

3. **`starship` also missing from `apps/catalog/components/VizModulePreview.tsx`.** The drift surfaced wider than first catalogued — catalog had **four** more hand-lists (layout, the `/api/modules` route, VizModulePreview, EmbedModule), and VizModulePreview omitted starship. **Fixed by the registry.**

Parity *before* the fix:

| Site | footshorts | f1 | kidzovo | starship |
|---|:-:|:-:|:-:|:-:|
| vizmaya-fyi VerticalLoader | ✅ | ✅ | ✅ | ✅ |
| admin canvas VerticalLoader | ✅ | ✅ | ✅ | ❌ |
| admin vizmayaModuleTypes | ✅ | ✅ | ✅ | ❌ |
| catalog VizModulePreview | ✅ | ✅ | ✅ | ❌ |
| vizmaya-fyi `@source` | ✅¹ | ✅¹ | n/a | n/a |

¹ after PR #219. After the fix every row is sourced from one array, so it **can't** drift — and `@source` now covers kidzovo/starship in the shared surfaces too.

## Blast radius

Every new vertical multiplies the chance of this bug. The failure mode is **silent** (no build error, no runtime throw — a class is just absent, or a picker is just short), and **surface-specific** (works in the vertical's own dark consumer app, breaks in the cream vizmaya-fyi-served preview/export), which makes it expensive to diagnose each time.

## Immediate mitigations (no refactor)

- Add `starship` to `apps/admin/components/canvas/VerticalLoader.tsx` and `apps/admin/lib/vizmayaModuleTypes.ts` to match vizmaya-fyi.
- When touching verticals, check **all** sites in the table above for parity.

## Resolution (option A — landed)

One declarative source of truth, `packages/verticals` (`@vismay/verticals`), per [vertical-registry-plan.md](vertical-registry-plan.md). **A dedicated package, not inside `viz-engine`** — each `@vismay/<x>-viz` depends on `viz-engine`, so the engine can't reference them back without a build-graph cycle (and they're unresolvable from inside it under pnpm). `@vismay/verticals` sits above the viz packages in the graph, so the `loadBundle` thunks resolve and the graph stays a DAG (`verticals → <x>-viz → viz-engine`).

- `src/data.ts` — the pure `VERTICALS` array (slug, lazy `loadBundle` thunk, `tailwindSources`, `publicRoutes`). Imports nothing heavy, so server-only callers consume it via `@vismay/verticals/data`.
- `src/index.ts` — re-exports the data + `registerAllVerticals()` (needs `viz-engine` for `registerVerticalLoader`).

What each surface does now:
- **Loaders** (vizmaya-fyi + admin canvas `VerticalLoader`, admin `ensureLoadersRegistered`, catalog layout/`api/modules`/`VizModulePreview`/`EmbedModule`) → all call `registerAllVerticals()`. Single-vertical consumer apps (`apps/kidzovo/web`, `apps/footshorts/web`) intentionally keep their own one-line registration — they only ever render their own vertical, so they can't drift.
- **Tailwind `@source`** → `scripts/gen-tailwind-sources.ts` (`pnpm gen:sources`) emits a committed `globals.generated.css` beside each shared surface's `globals.css` (vizmaya-fyi/admin/catalog), which `@import`s it. CI guards with `pnpm gen:sources --check` (`git diff --exit-code`).
- **Public routing** → `APP_PUBLIC_ROUTES` in `apps/admin/lib/publicSite.ts` derives its per-vertical path shapes from `VERTICALS[].publicRoutes`; the env-overridable base URLs stay local.

North star is still option C (extract the engine as a vertical-agnostic surface so `vizmaya.fyi` is just one consumer) — see [roadmap-june-2026.md](roadmap-june-2026.md) and the adjacent engine docs [generalized-content-engine.md](generalized-content-engine.md) / [render-templates.md](render-templates.md).
