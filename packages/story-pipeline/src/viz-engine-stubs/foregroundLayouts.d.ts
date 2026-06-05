// Typecheck-only stub for `@vismay/viz-engine/src/foregroundLayouts`. See genSchema.d.ts.

export interface ForegroundLayoutLike {
  name: string
  regions?: Record<string, unknown>
}

export declare function getForegroundLayout(name: string): ForegroundLayoutLike | undefined
export declare function listForegroundLayouts(): ForegroundLayoutLike[]
