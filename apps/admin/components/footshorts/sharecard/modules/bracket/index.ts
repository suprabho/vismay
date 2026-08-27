import type { AdminFormField, VizModule } from '@vismay/viz-engine'
import type { StaticRoundInput } from '@vismay/footshorts-viz/web'
import type { BracketCardLayout, FsCardBracketConfig } from '../types'

const LAYOUTS: BracketCardLayout[] = ['tree', 'tree-vertical', 'tree-horizontal', 'list']

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): FsCardBracketConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fscard:bracket layer must be an object`)
  }
  const r = raw as Record<string, unknown>

  const rounds = Array.isArray(r.rounds) ? (r.rounds as unknown as StaticRoundInput[]) : undefined
  const compKey = typeof r.compKey === 'string' && r.compKey ? r.compKey : undefined
  if (!rounds && !compKey) {
    throw new Error(`${ctx.label}: fscard:bracket requires either 'rounds' (incomplete draw) or a 'compKey'`)
  }

  const layout = LAYOUTS.includes(r.layout as BracketCardLayout)
    ? (r.layout as BracketCardLayout)
    : 'tree'

  return {
    type: 'fscard:bracket',
    rounds,
    compKey,
    layout,
    title: typeof r.title === 'string' ? r.title : undefined,
    competitionSlug: typeof r.competitionSlug === 'string' ? r.competitionSlug : undefined,
    highlightTeamId: typeof r.highlightTeamId === 'string' ? r.highlightTeamId : undefined,
  }
}

function adminForm(): AdminFormField[] {
  return [
    {
      kind: 'json',
      key: 'rounds',
      label: 'Incomplete draw — rounds [{ stage, ties:[{ a, b }] }]',
      placeholder:
        '[{"stage":"ROUND_OF_32","ties":[{"a":{"team":"germany"},"b":"3rd A/C/D/F"}]}]',
    },
    {
      kind: 'picker',
      key: 'compKey',
      label: 'Or a competition (live knockout fixtures)',
      pickerId: 'footshorts:competition',
    },
    {
      kind: 'select',
      key: 'layout',
      label: 'Layout',
      options: LAYOUTS.map((l) => ({ value: l, label: l })),
    },
    { kind: 'text', key: 'title', label: 'Centre emblem caption' },
    { kind: 'text', key: 'competitionSlug', label: 'Competition slug (emblem)' },
    { kind: 'text', key: 'highlightTeamId', label: 'Highlight team id' },
  ]
}

const bracketCardModule: VizModule<FsCardBracketConfig> = {
  type: 'fscard:bracket',
  label: 'Bracket',
  slots: ['foreground'],
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  // A bracket tree can outgrow the card; let the author size the box up to 300%
  // (rather than scroll it) in both axes.
  maxWidthPct: 300,
  maxHeightPct: 300,
  stableIdentity: (c) => {
    const nTies = c.rounds?.reduce((n, r) => n + (r.ties?.length ?? 0), 0) ?? 0
    return `fscard:bracket:${c.compKey ?? 'static'}:${c.rounds?.length ?? 0}:${nTies}:${c.layout}`
  },
}

export default bracketCardModule
