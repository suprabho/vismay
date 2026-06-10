/**
 * The one place that reaches into viz-engine's schema surface.
 *
 * We deep-import the **zod-only** modules (not the package root) on purpose: the
 * root re-exports React/mapbox/echarts components that import CSS + browser
 * globals, which crash under plain node/tsx. These submodules are pure zod +
 * lazy `() => import()` component thunks, so they evaluate cleanly in a node
 * pipeline AND in a Next route. This mirrors the existing deep-import convention
 * in `apps/catalog`, which deep-imports each module's `sample` export.
 *
 * If viz-engine ever ships subpath exports, swap these for the public paths.
 */

// The AI-generation contract — the same zod layer schemas the renderer validates with.
export {
  sectionBodySchema,
  normalizeSectionBody,
  GEN_FOREGROUND_TYPES,
  genPinSchema,
  type SectionBody,
} from '@vismay/viz-engine/src/lib/genSchema'

// The live module registry — used to re-validate emitted layers via their real parseConfig.
export { getVizModule, allRegisteredTypes } from '@vismay/viz-engine/src/registry'

// Layout registry — used to check a section's chosen layout name is real.
export {
  getForegroundLayout,
  listForegroundLayouts,
} from '@vismay/viz-engine/src/foregroundLayouts'

// Schema → prompt-doc renderer (exact field docs, never drifts from the validator).
export { describeLayerSchema } from '@vismay/viz-engine/src/lib/schemaDocs'
