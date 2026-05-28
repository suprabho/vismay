import type { KzCharacterConfig } from '../../types'

/**
 * Authoring sample for `kz:character` — Ovi standing, anchored bottom-center.
 * Used by the catalog page and as the "insert character" starter in the
 * admin form.
 */
export const sample: KzCharacterConfig = {
  type: 'kz:character',
  who: 'ovi',
  pose: { static: 'idle' },
  anchor: { x: 'center', y: 'bottom' },
}
