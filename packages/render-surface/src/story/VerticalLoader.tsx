'use client'

import { VerticalLoader as EngineVerticalLoader } from '@vismay/viz-engine'
import { registerAllVerticals } from '@vismay/verticals'

// Wire every vertical from the shared registry BEFORE the engine's
// VerticalLoader mounts. The registration runs as a module-level side effect,
// so any code path that pulls in this module — including server pages whose
// JSX tree references <VerticalLoader/> — is guaranteed to have the loaders in
// place by the time loadVertical fires on the client.
//
// Source of truth: packages/viz-engine/src/verticalRegistry.ts. Adding a
// vertical there registers it here (and in admin) with no edit to this file —
// retiring the hand-maintained list that used to drift across sites.
registerAllVerticals()

export default function VerticalLoader(
  props: React.ComponentProps<typeof EngineVerticalLoader>
) {
  return <EngineVerticalLoader {...props} />
}
