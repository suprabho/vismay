import type { AdminFormField, VizModule } from '@vismay/viz-engine'
import type { MatchRowVariant } from '../../types'
import type { FsCardFixturesConfig } from '../types'

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): FsCardFixturesConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fscard:fixtures layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.compKey !== 'string' || !r.compKey) {
    throw new Error(`${ctx.label}: fscard:fixtures requires a 'compKey'`)
  }
  const fixtureIds = Array.isArray(r.fixtureIds)
    ? r.fixtureIds.filter((id): id is string => typeof id === 'string')
    : []
  const variant: MatchRowVariant = r.variant === 'expanded' ? 'expanded' : 'compact'
  return { type: 'fscard:fixtures', compKey: r.compKey, fixtureIds, variant }
}

function adminForm(): AdminFormField[] {
  return [
    { kind: 'picker', key: 'compKey', label: 'Competition', pickerId: 'footshorts:competition', required: true },
    { kind: 'picker', key: 'fixtureIds', label: 'Fixtures', pickerId: 'footshorts:fixture-multi', dependsOn: ['compKey'], required: true },
    {
      kind: 'select',
      key: 'variant',
      label: 'Density',
      options: [
        { value: 'compact', label: 'Compact' },
        { value: 'expanded', label: 'Expanded' },
      ],
    },
  ]
}

const fixturesCardModule: VizModule<FsCardFixturesConfig> = {
  type: 'fscard:fixtures',
  label: 'Fixtures',
  slots: ['foreground'],
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (c) => `fscard:fixtures:${c.compKey}:${c.variant}:${c.fixtureIds.join(',')}`,
}

export default fixturesCardModule
