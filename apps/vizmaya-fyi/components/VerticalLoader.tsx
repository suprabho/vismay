'use client'

import {
  VerticalLoader as EngineVerticalLoader,
  registerVerticalLoader,
} from '@vismay/viz-engine'

// Wire every vertical this app supports BEFORE the engine's VerticalLoader
// mounts. The registration runs as a module-level side effect, so any code
// path that pulls in this module — including server pages whose JSX tree
// references <VerticalLoader/> — is guaranteed to have the loader in place
// by the time loadVertical fires on the client.
registerVerticalLoader('footshorts', () =>
  import('@vismay/footshorts-viz').then((m) => m.register())
)
registerVerticalLoader('f1', () =>
  import('@vismay/f1-viz').then((m) => m.register())
)
registerVerticalLoader('starship', () =>
  import('@vismay/starship-viz').then((m) => m.register())
)
registerVerticalLoader('kidzovo', () =>
  import('@vismay/kidzovo-viz').then((m) => m.register())
)

export default function VerticalLoader(
  props: React.ComponentProps<typeof EngineVerticalLoader>
) {
  return <EngineVerticalLoader {...props} />
}
