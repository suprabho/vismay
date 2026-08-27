/**
 * Hoisted to `@vismay/viz-admin` so the footshorts + vizmaya composers share one
 * per-layer config form (m0 of the shared-composer refactor). This shim keeps the
 * existing `@/components/vizmaya/VizConfigForm` (and relative) import paths working.
 * Import directly from `@vismay/viz-admin` in new code.
 */
export { VizConfigForm as default } from '@vismay/viz-admin'
