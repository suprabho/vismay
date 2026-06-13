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

/**
 * Which config serializer a story should use, keyed off its `vertical`.
 *
 * New verticals (anything with its own desk other than vizmaya) are
 * JSON-native: the compose pipeline writes a structured `config.json` instead
 * of hand-built inline YAML, and the canvas edits the parsed tree. vizmaya-fyi
 * (the default, `null`/unknown vertical) stays on YAML — its existing stories
 * and the line-based YAML canvas surgery are untouched.
 */
export function configFormatForVertical(vertical?: string | null): 'yaml' | 'json' {
  return vertical ? 'json' : 'yaml'
}
