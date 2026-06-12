// Typecheck-only stub for `@vismay/viz-engine/src/lib/genSchema`.
//
// viz-engine is consumed as source (no built .d.ts), and its module graph pulls
// in .tsx + .css that a standalone `tsc` can't parse. At RUNTIME (tsx / Next)
// the real module is resolved by node; this stub is wired in via tsconfig
// `paths` ONLY so our isolated typecheck doesn't compile viz-engine's source.
// Keep the surface in sync with `vizEngine.ts`.

import type { ZodTypeAny } from 'zod'

export declare const sectionBodySchema: ZodTypeAny
export declare function mapSectionBodySchemaFor(opts?: { requireEyebrow?: boolean }): ZodTypeAny
export declare const genPinSchema: ZodTypeAny
export declare function normalizeSectionBody(body: unknown): Record<string, unknown>
export declare const GEN_FOREGROUND_TYPES: ReadonlyArray<{ type: string; label: string }>
export type SectionBody = unknown
/** A `z.object` with a `type: z.literal(...)` discriminator (vertical layer schema). */
export type GenLayerOption = ZodTypeAny
export declare function sectionBodySchemaWith(extra: readonly GenLayerOption[]): ZodTypeAny
