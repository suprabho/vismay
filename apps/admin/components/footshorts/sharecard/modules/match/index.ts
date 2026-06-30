import type { AdminFormField, VizModule } from '@vismay/viz-engine'
import type { MatchStyle } from '../../types'
import type { FsCardMatchConfig } from '../types'

const MATCH_STYLES: MatchStyle[] = ['tile', 'card-horizontal', 'card-portrait', 'card-score']

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): FsCardMatchConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fscard:match layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.compKey !== 'string' || !r.compKey) {
    throw new Error(`${ctx.label}: fscard:match requires a 'compKey'`)
  }
  if (typeof r.fixtureId !== 'string' || !r.fixtureId) {
    throw new Error(`${ctx.label}: fscard:match requires a 'fixtureId'`)
  }
  const matchStyle = (MATCH_STYLES as string[]).includes(r.matchStyle as string)
    ? (r.matchStyle as MatchStyle)
    : 'tile'
  const penalties =
    typeof r.penalties === 'string' && r.penalties.trim() ? r.penalties.trim() : undefined
  return { type: 'fscard:match', compKey: r.compKey, fixtureId: r.fixtureId, matchStyle, penalties }
}

function adminForm(): AdminFormField[] {
  return [
    { kind: 'picker', key: 'compKey', label: 'Competition', pickerId: 'footshorts:competition', required: true },
    { kind: 'picker', key: 'fixtureId', label: 'Fixture', pickerId: 'footshorts:fixture', dependsOn: ['compKey'], required: true },
    {
      kind: 'select',
      key: 'matchStyle',
      label: 'Style',
      options: [
        { value: 'tile', label: 'Tile' },
        { value: 'card-horizontal', label: 'Card · Horizontal' },
        { value: 'card-portrait', label: 'Card · Portrait' },
        { value: 'card-score', label: 'Card · Score' },
      ],
    },
    { kind: 'text', key: 'penalties', label: 'Penalties (shootout, e.g. "4 – 2")' },
  ]
}

const matchCardModule: VizModule<FsCardMatchConfig> = {
  type: 'fscard:match',
  label: 'Match',
  slots: ['foreground'],
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (c) =>
    `fscard:match:${c.compKey}:${c.fixtureId}:${c.matchStyle}:${c.penalties ?? ''}`,
}

export default matchCardModule
