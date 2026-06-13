'use client'

import { VerticalLoader as EngineVerticalLoader } from '@vismay/viz-engine'
import { registerAllVerticals } from '@vismay/verticals'

// Same shared registry as vizmaya-fyi/components/VerticalLoader. Module-level
// side effect — pulling this file in is what guarantees loadVertical sees the
// loaders by the time a vertical story tries to resolve a vertical-specific
// viz type from the registry.
//
// Source of truth: packages/viz-engine/src/verticalRegistry.ts. Using the
// shared helper is what fixed the `starship` drift (it was previously missing
// from this list); a new vertical is now registered everywhere from one edit.
registerAllVerticals()

export default function VerticalLoader(
  props: React.ComponentProps<typeof EngineVerticalLoader>
) {
  return <EngineVerticalLoader {...props} />
}
