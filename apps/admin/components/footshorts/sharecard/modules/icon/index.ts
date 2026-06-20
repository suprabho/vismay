import type { AdminFormField, VizModule } from '@vismay/viz-engine'
import type { PhosphorWeight } from '../../types'
import type { FsCardIconConfig } from '../types'

const WEIGHTS: PhosphorWeight[] = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone']

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): FsCardIconConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fscard:icon layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  const weight = WEIGHTS.includes(r.iconWeight as PhosphorWeight) ? (r.iconWeight as PhosphorWeight) : 'bold'
  return {
    type: 'fscard:icon',
    iconName: typeof r.iconName === 'string' ? r.iconName : '',
    iconWeight: weight,
    iconColor: typeof r.iconColor === 'string' ? r.iconColor : '',
  }
}

function adminForm(): AdminFormField[] {
  // Position / size / rotation are edited via the free-mode Transform panel.
  return [
    { kind: 'picker', key: 'iconName', label: 'Icon', pickerId: 'footshorts:icon', required: true },
    {
      kind: 'select',
      key: 'iconWeight',
      label: 'Weight',
      options: WEIGHTS.map((w) => ({ value: w, label: w })),
    },
    { kind: 'text', key: 'iconColor', label: 'Color', placeholder: '#RRGGBB / accent / text' },
  ]
}

const iconCardModule: VizModule<FsCardIconConfig> = {
  type: 'fscard:icon',
  label: 'Icon',
  slots: ['foreground'],
  placement: 'overlay',
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (c) => `fscard:icon:${c.iconName}:${c.iconWeight}:${c.iconColor}`,
}

export default iconCardModule
