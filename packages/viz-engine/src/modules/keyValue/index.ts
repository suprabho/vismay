import type { VizModule } from '../../types'
import type { StatColor } from '../../lib/storyConfig.types'

export interface KeyValueItem {
  key: string
  value: string
  /** Theme token applied to the value's color. */
  color?: StatColor
}

/**
 * Layer config for the `keyValue` module — the deck-format definition list.
 *
 * Renders a two-column list typically used for closing summaries ("three
 * theses, one ticker") or sidebar facts. Each item carries a key/value pair
 * and an optional theme token for value color.
 */
export interface KeyValueLayerConfig {
  type: 'keyValue'
  /** Optional title above the list. */
  title?: string
  /** Required: 1-12 key/value items. */
  items: KeyValueItem[]
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): KeyValueLayerConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: keyValue layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.items) || r.items.length === 0) {
    throw new Error(`${ctx.label}: keyValue 'items' must be a non-empty array`)
  }
  if (r.items.length > 12) {
    throw new Error(`${ctx.label}: keyValue 'items' may contain at most 12 entries`)
  }
  const items: KeyValueItem[] = r.items.map((it, i) => {
    if (!it || typeof it !== 'object') {
      throw new Error(`${ctx.label}: keyValue item ${i} must be an object`)
    }
    const obj = it as Record<string, unknown>
    if (typeof obj.key !== 'string' || obj.key.trim().length === 0) {
      throw new Error(`${ctx.label}: keyValue item ${i} 'key' is required`)
    }
    if (typeof obj.value !== 'string' || obj.value.trim().length === 0) {
      throw new Error(`${ctx.label}: keyValue item ${i} 'value' is required`)
    }
    return {
      key: obj.key.trim(),
      value: obj.value.trim(),
      color: obj.color as StatColor | undefined,
    }
  })
  return {
    type: 'keyValue',
    title: typeof r.title === 'string' ? r.title.trim() : undefined,
    items,
  }
}

const keyValueModule: VizModule<KeyValueLayerConfig> = {
  type: 'keyValue',
  label: 'Key/value list',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  // No stableIdentity — keyValue layers remount cheaply per region.
  defaultStyle: { pointerEvents: 'none' },
  regionPreferences: ['body', 'sidebar'],
  adminForm: () => [
    { kind: 'text', key: 'title', label: 'Optional title' },
    { kind: 'json', key: 'items', label: 'Items ([{ key, value, color? }])', required: true },
  ],
}

export default keyValueModule
