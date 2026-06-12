export type { DomainPack, PackLayerType } from './types'
export { VIZMAYA_PACK } from './vizmaya'
export { F1_PACK } from './f1'
export { FOOTSHORTS_PACK } from './footshorts'

import { VIZMAYA_PACK } from './vizmaya'
import { F1_PACK } from './f1'
import { FOOTSHORTS_PACK } from './footshorts'
import type { DomainPack } from './types'

/**
 * Resolve a story's desk from its `vertical` frontmatter key (the same keys
 * `VerticalLoader` registers viz bundles under). Unknown or absent verticals
 * are the vizmaya desk — the default everywhere.
 */
export function packForVertical(vertical?: string | null): DomainPack {
  switch (vertical) {
    case 'f1':
      return F1_PACK
    case 'footshorts':
      return FOOTSHORTS_PACK
    default:
      return VIZMAYA_PACK
  }
}
