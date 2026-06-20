import type { AdminFormField, VizModule } from '@vismay/viz-engine'
import type { FsCardEmojiConfig } from '../types'

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): FsCardEmojiConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fscard:emoji layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  return {
    type: 'fscard:emoji',
    glyph: typeof r.glyph === 'string' ? r.glyph : '',
  }
}

function adminForm(): AdminFormField[] {
  // Position / size / rotation are edited via the free-mode Transform panel.
  return [{ kind: 'picker', key: 'glyph', label: 'Emoji', pickerId: 'footshorts:emoji', required: true }]
}

const emojiCardModule: VizModule<FsCardEmojiConfig> = {
  type: 'fscard:emoji',
  label: 'Emoji',
  slots: ['foreground'],
  placement: 'overlay',
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (c) => `fscard:emoji:${c.glyph}`,
}

export default emojiCardModule
