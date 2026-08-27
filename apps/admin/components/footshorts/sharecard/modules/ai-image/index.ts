import type { AdminFormField, VizModule } from '@vismay/viz-engine'
import type { FsCardAiImageConfig } from '../types'

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): FsCardAiImageConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fscard:ai-image layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.dataUrl !== 'string' || !r.dataUrl) {
    throw new Error(`${ctx.label}: fscard:ai-image requires a 'dataUrl'`)
  }
  return {
    type: 'fscard:ai-image',
    dataUrl: r.dataUrl,
    caption: typeof r.caption === 'string' ? r.caption : undefined,
  }
}

function adminForm(): AdminFormField[] {
  return [
    { kind: 'picker', key: 'dataUrl', label: 'AI image', pickerId: 'footshorts:ai-image', required: true },
    { kind: 'text', key: 'caption', label: 'Caption' },
  ]
}

const aiImageCardModule: VizModule<FsCardAiImageConfig> = {
  type: 'fscard:ai-image',
  label: 'AI image',
  slots: ['foreground'],
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (c) => `fscard:ai-image:${c.caption ?? ''}`,
}

export default aiImageCardModule
