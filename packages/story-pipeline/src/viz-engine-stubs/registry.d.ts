// Typecheck-only stub for `@vismay/viz-engine/src/registry`. See genSchema.d.ts.

export interface VizModuleLike {
  type: string
  parseConfig(raw: unknown, ctx: { slug: string; label: string }): unknown
}

export declare function getVizModule(type: string): VizModuleLike | undefined
export declare function allRegisteredTypes(): string[]
