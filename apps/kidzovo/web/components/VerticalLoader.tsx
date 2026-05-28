'use client'

import {
  VerticalLoader as EngineVerticalLoader,
  registerVerticalLoader,
} from '@vismay/viz-engine'

// Wire the kidzovo vertical BEFORE the engine's VerticalLoader mounts. The
// registration runs as a module-level side effect so any code path that
// pulls this file in — including server pages whose JSX tree references
// <VerticalLoader/> — has the loader in place before `loadVertical` fires
// on the client.
registerVerticalLoader('kidzovo', () =>
  import('@vismay/kidzovo-viz').then((m) => m.register())
)

export default function VerticalLoader(
  props: React.ComponentProps<typeof EngineVerticalLoader>
) {
  return <EngineVerticalLoader {...props} />
}
