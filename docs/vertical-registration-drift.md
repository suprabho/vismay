# Bug: vertical-registration drift across the centralized render surface

**Status:** open · symptom-fixed piecemeal (PR #219), root cause unaddressed
**Severity:** latent-but-recurring — silently breaks a vertical's modules in admin/preview surfaces, no error
**Discovered:** Jun 13, 2026 (via the f1 driver-standings grid collapse)
**Fix tracked by:** [vertical-registry-plan.md](vertical-registry-plan.md) (option A) · roadmap item ⑧ / option C in [roadmap-june-2026.md](roadmap-june-2026.md)

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

2. **`starship` loader gap.** Registered in `vizmaya-fyi/components/VerticalLoader.tsx` but **missing** from both `apps/admin/components/canvas/VerticalLoader.tsx` and `apps/admin/lib/vizmayaModuleTypes.ts`. Effect: a starship story edited at `vismay.xyz/starship/<slug>/canvas` doesn't get its vertical loader registered → the "+ add layer" picker falls back to core types and inline leaf render can't resolve starship module types. **Still open.**

| Site | footshorts | f1 | kidzovo | starship |
|---|:-:|:-:|:-:|:-:|
| vizmaya-fyi VerticalLoader | ✅ | ✅ | ✅ | ✅ |
| admin canvas VerticalLoader | ✅ | ✅ | ✅ | ❌ |
| admin vizmayaModuleTypes | ✅ | ✅ | ✅ | ❌ |
| vizmaya-fyi `@source` | ✅¹ | ✅¹ | n/a | n/a |

¹ after PR #219.

## Blast radius

Every new vertical multiplies the chance of this bug. The failure mode is **silent** (no build error, no runtime throw — a class is just absent, or a picker is just short), and **surface-specific** (works in the vertical's own dark consumer app, breaks in the cream vizmaya-fyi-served preview/export), which makes it expensive to diagnose each time.

## Immediate mitigations (no refactor)

- Add `starship` to `apps/admin/components/canvas/VerticalLoader.tsx` and `apps/admin/lib/vizmayaModuleTypes.ts` to match vizmaya-fyi.
- When touching verticals, check **all** sites in the table above for parity.

## Real fix

[vertical-registry-plan.md](vertical-registry-plan.md) (option A — one source of truth that every site consumes). North star is option C (extract the engine as a vertical-agnostic surface so `vizmaya.fyi` is just one consumer) — see [roadmap-june-2026.md](roadmap-june-2026.md) and the adjacent engine docs [generalized-content-engine.md](generalized-content-engine.md) / [render-templates.md](render-templates.md).
