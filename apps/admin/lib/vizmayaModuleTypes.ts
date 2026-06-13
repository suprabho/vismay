/**
 * Server-side module-type discovery for the canvas's "+ add layer" picker.
 *
 * The canvas client needs to show the user a list of valid VizModule types
 * for background and foreground slots. Module types are registered by
 * calling `registerVizModule(...)` at module-evaluation time (core
 * modules) or by `register()` on a vertical bundle (verticals).
 *
 * This helper:
 *   1. registers vertical loaders the first time it's imported, mirroring
 *      the client-side `components/canvas/VerticalLoader.tsx`
 *   2. loads the story's vertical via `loadVertical(slug)` — idempotent,
 *      cached per-process
 *   3. snapshots `listModulesForSlot('background' | 'foreground')` into a
 *      pair of string arrays the client can render.
 *
 * Lives in `lib/` (server-only) so it doesn't get included in the client
 * bundle. The CanvasClient consumes the resulting `{background, foreground}`
 * prop — it never imports this file directly.
 */

// NB: server-side module. Only imported from server components (page.tsx).
// We don't gate with `import 'server-only'` to avoid pnpm-hoisting issues —
// the import-only-from-server discipline is enforced by convention plus
// the fact that `@vismay/footshorts-viz` / `@vismay/f1-viz` are server-safe
// at first import but resolve client modules in their tree, which would
// blow up if pulled into the client bundle anyway.
import { loadVertical, listModulesForSlot } from '@vismay/viz-engine'
import { registerAllVerticals } from '@vismay/verticals'

// Module-evaluation-time side effect: wire up the same loaders the client
// uses (from the shared registry), so server-side code paths can call
// loadVertical('footshorts') etc. `registerAllVerticals` is idempotent —
// re-registering a vertical just replaces its loader entry, no error.
//
// Source of truth: packages/viz-engine/src/verticalRegistry.ts. This used to
// be a hand-copied list that drifted from the client loaders (the `starship`
// gap); it now picks up every vertical from one edit.
let registered = false
function ensureLoadersRegistered(): void {
  if (registered) return
  registerAllVerticals()
  registered = true
}

export interface ModuleTypeLists {
  /** Module `type` strings that can appear under `section.background`. */
  background: string[]
  /** Module `type` strings that can appear under `section.foreground.*`. */
  foreground: string[]
}

/**
 * Resolve the module-type lists for one story, taking its `vertical`
 * frontmatter into account. Returns core types only when `vertical` is
 * undefined or unknown. Safe to call repeatedly — `loadVertical` dedupes
 * via its own promise cache.
 */
export async function getModuleTypesForVertical(
  vertical: string | undefined
): Promise<ModuleTypeLists> {
  ensureLoadersRegistered()
  // loadVertical is a no-op for falsy slugs and resolves immediately for
  // already-loaded ones. Errors are swallowed so a broken vertical doesn't
  // break the canvas page — the picker just falls back to core types.
  try {
    await loadVertical(vertical)
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn(
        `[vizmayaModuleTypes] loadVertical('${vertical}') failed:`,
        err
      )
    }
  }
  return {
    background: listModulesForSlot('background').map((m) => m.type),
    foreground: listModulesForSlot('foreground').map((m) => m.type),
  }
}
