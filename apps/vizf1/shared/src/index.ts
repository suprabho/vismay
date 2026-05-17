/**
 * Shared schemas + types across VizF1 apps.
 *
 * Source-of-truth API shapes live in ./schemas (Zod). Domain row types
 * consumed by the UI live in @vismay/f1-viz/types — keeping the row shapes
 * with the vertical lets vizmaya stories use the same contract without
 * pulling in the Jolpica envelope plumbing.
 */

export * from './schemas'
