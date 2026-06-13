# Vertical registry — implementation plan (option A)

**Status: IMPLEMENTED** (all phases). The registry landed as a **dedicated `packages/verticals` (`@vismay/verticals`)** — the "(or a new packages/verticals)" option below — *not* inside `viz-engine`. Reason discovered during build: each `@vismay/<x>-viz` depends on `viz-engine`, so putting the `loadBundle` thunks in the engine forms a build-graph cycle and the packages aren't even resolvable from inside it under pnpm. The new package sits above the viz packages (`verticals → <x>-viz → viz-engine`, a DAG). Verified: `admin` + `vizmaya-fyi` + `catalog` typecheck clean, `catalog` + `admin` (incl. middleware) build clean, `pnpm gen:sources --check` clean. The catalog scope was wider than first written — see §2.

**Goal:** kill the registration-drift bug class ([vertical-registration-drift.md](vertical-registration-drift.md)) by giving every vertical-aware site one source of truth, with **no behavior change**.
**Scope:** mechanical consolidation. *Not* the engine extraction (that's option C in [roadmap-june-2026.md](roadmap-june-2026.md)).
**Effort:** ~4–7h.

---

## 1. The shape of it

A single declarative registry — one entry per vertical — holding everything the scattered switchboards restate today:

```ts
// packages/viz-engine/src/verticals/registry.ts  (or a new packages/verticals)
export interface VerticalEntry {
  slug: string                          // 'footshorts' | 'f1' | 'kidzovo' | 'starship' | ...
  loadBundle: () => Promise<{ register: () => void }>  // dynamic import of @vismay/<x>-viz
  /** Repo-relative source globs for Tailwind @source generation. */
  tailwindSources: string[]             // e.g. ['verticals/f1-viz/src/**/*.{ts,tsx}']
  /** Public consumer routing (moves APP_PUBLIC_ROUTES here). */
  publicRoutes?: { storyPath?: (slug: string) => string; epicPath?: (slug: string) => string; baseUrlEnv?: string }
  theme?: string                        // default theme token set, if any
}

export const VERTICALS: VerticalEntry[] = [ /* one entry each */ ]
export const VERTICAL_BY_SLUG = new Map(VERTICALS.map((v) => [v.slug, v]))
```

Rule going forward: **adding a vertical = adding one `VerticalEntry`.** Nothing else gets hand-edited.

## 2. Consumers — what each site replaces

| Today (drifts) | After |
|---|---|
| `apps/vizmaya-fyi/components/VerticalLoader.tsx` hand list | iterate `VERTICALS`, call `registerVerticalLoader(v.slug, v.loadBundle)` |
| `apps/admin/components/canvas/VerticalLoader.tsx` hand list | same shared helper |
| `apps/admin/lib/vizmayaModuleTypes.ts` `ensureLoadersRegistered` | same shared helper |
| `APP_PUBLIC_ROUTES` + per-app URLs in `apps/admin/lib/publicSite.ts` | derive from `VERTICALS[].publicRoutes` (keep env-override + `originVariants` as-is) |
| 4× hand-maintained `@source` blocks in `globals.css` | generated (see §3) |

A single `registerAllVerticals()` helper in viz-engine collapses the three loader sites into one call.

## 3. Tailwind `@source` generation

Tailwind v4 can't read a TS array, so generate the CSS partial from the registry at build time:

- Script `scripts/gen-tailwind-sources.ts` reads `VERTICALS[].tailwindSources`, emits `globals.generated.css` (a list of `@source` lines, path-rebased per app dir), and each app's `globals.css` does `@import './globals.generated.css'`.
- Wire as a `prebuild` / `predev` step (or a `pnpm gen:sources` checked-in artifact with a CI drift check — `git diff --exit-code` on the generated file).
- **Interim (cheap):** if generation is deferred, at minimum extract the `@source` lines into a single committed partial that every app imports, so the list lives once.

## 4. Phases

1. **Registry module** — author `VerticalEntry` + `VERTICALS` covering footshorts/f1/kidzovo/starship (this also *fixes the starship drift* by construction). Add `registerAllVerticals()`. ~1.5h.
2. **Swap the 3 loader sites** to the shared helper; delete the hand lists. Verify canvas picker + autoplay render for each vertical. ~1.5h.
3. **`@source` generation** (§3) + drift check. Verify f1/footshorts grids still render in vizmaya-fyi previews (the PR #219 regression). ~1.5h.
4. **`publicRoutes`** — fold `APP_PUBLIC_ROUTES` into the registry; keep `vizmayaPublicUrl`/env-override/`originVariants` untouched. ~1h.

Phases 1–2 alone retire the loader drift and the starship bug; 3 retires the `@source` drift; 4 is optional tidy.

## 5. Verification

- Per vertical, in the admin canvas: "+ add layer" lists that vertical's modules, and Autoplay 9:16 + Share + Report previews render module grids correctly (not column-collapsed).
- `pnpm gen:sources && git diff --exit-code` clean in CI.
- The parity table in [vertical-registration-drift.md](vertical-registration-drift.md) is all-green and **can't** regress (one source).

## 6. Non-goals / risks

- **Not** changing where rendering happens (still vizmaya-fyi headless) — that's option C.
- Server/client import boundary: the registry must stay import-safe on the server (loaders are `() => import()` thunks, evaluated lazily) — mirror the existing `vizmayaModuleTypes.ts` discipline (no `import 'server-only'`, lazy bundle import) to avoid pulling client viz code into server bundles.
- pnpm hoisting: keep bundle imports as dynamic `import('@vismay/<x>-viz')` so workspace resolution is unchanged.
