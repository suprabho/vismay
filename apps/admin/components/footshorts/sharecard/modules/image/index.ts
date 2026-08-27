import type { AdminFormField, VizModule } from '@vismay/viz-engine'
import type { FsCardImageConfig } from '../types'

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): FsCardImageConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fscard:image layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  const source =
    r.source === 'upload' || r.source === 'generated' || r.source === 'news' ? r.source : undefined
  return {
    type: 'fscard:image',
    src: typeof r.src === 'string' ? r.src : '',
    source,
    objectFit: r.objectFit === 'cover' ? 'cover' : 'contain',
  }
}

function adminForm(): AdminFormField[] {
  // Position / size / rotation are edited via the free-mode Transform panel.
  return [
    { kind: 'picker', key: 'src', label: 'Image', pickerId: 'footshorts:image', required: true },
    {
      kind: 'select',
      key: 'objectFit',
      label: 'Fit',
      options: [
        { value: 'contain', label: 'Contain' },
        { value: 'cover', label: 'Cover' },
      ],
    },
  ]
}

const imageCardModule: VizModule<FsCardImageConfig> = {
  type: 'fscard:image',
  label: 'Image',
  slots: ['foreground'],
  placement: 'overlay',
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (c) => `fscard:image:${c.src.slice(0, 64)}`,
}

export default imageCardModule
