import type { AdminFormField, VizModule } from '@vismay/viz-engine'
import type { FsCardStandingsConfig } from '../types'

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): FsCardStandingsConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fscard:standings layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.compKey !== 'string' || !r.compKey) {
    throw new Error(`${ctx.label}: fscard:standings requires a 'compKey'`)
  }
  return {
    type: 'fscard:standings',
    compKey: r.compKey,
    group: typeof r.group === 'string' ? r.group : null,
  }
}

function adminForm(): AdminFormField[] {
  return [
    {
      kind: 'picker',
      key: 'compKey',
      label: 'Competition',
      pickerId: 'footshorts:competition',
      required: true,
    },
    {
      kind: 'picker',
      key: 'group',
      label: 'Group',
      pickerId: 'footshorts:standings-group',
      dependsOn: ['compKey'],
    },
  ]
}

const standingsCardModule: VizModule<FsCardStandingsConfig> = {
  type: 'fscard:standings',
  label: 'Share card — standings',
  slots: ['foreground'],
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (c) => `fscard:standings:${c.compKey}:${c.group ?? ''}`,
}

export default standingsCardModule
