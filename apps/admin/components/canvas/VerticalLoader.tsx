'use client'

import {
  VerticalLoader as EngineVerticalLoader,
  registerVerticalLoader,
} from '@vismay/viz-engine'

// Same vertical bundle registrations as vizmaya-fyi/components/VerticalLoader.
// Module-level side effects — pulling this file in is what guarantees
// loadVertical sees the loaders by the time a footshort/f1 story tries to
// resolve a vertical-specific viz type from the registry.
registerVerticalLoader('footshort', () =>
  import('@vismay/footshort-viz').then((m) => m.register())
)
registerVerticalLoader('f1', () =>
  import('@vismay/f1-viz').then((m) => m.register())
)

export default function VerticalLoader(
  props: React.ComponentProps<typeof EngineVerticalLoader>
) {
  return <EngineVerticalLoader {...props} />
}
