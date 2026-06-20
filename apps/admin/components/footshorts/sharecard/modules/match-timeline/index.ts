import type { AdminFormField, VizModule } from '@vismay/viz-engine'
import type { EventTypeFilter } from '@vismay/footshorts-viz/types'
import type { MatchStyle } from '../../types'
import type { FsCardMatchTimelineConfig } from '../types'

const MATCH_STYLES: MatchStyle[] = ['tile', 'card-horizontal', 'card-portrait', 'card-score']
const EVENT_FILTERS: EventTypeFilter[] = ['all', 'goal', 'card', 'subst']

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): FsCardMatchTimelineConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fscard:match-timeline layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.compKey !== 'string' || !r.compKey) {
    throw new Error(`${ctx.label}: fscard:match-timeline requires a 'compKey'`)
  }
  if (typeof r.fixtureId !== 'string' || !r.fixtureId) {
    throw new Error(`${ctx.label}: fscard:match-timeline requires a 'fixtureId'`)
  }
  const matchStyle = (MATCH_STYLES as string[]).includes(r.matchStyle as string)
    ? (r.matchStyle as MatchStyle)
    : 'tile'
  const eventFilter = (EVENT_FILTERS as string[]).includes(r.eventFilter as string)
    ? (r.eventFilter as EventTypeFilter)
    : 'all'
  return { type: 'fscard:match-timeline', compKey: r.compKey, fixtureId: r.fixtureId, matchStyle, eventFilter }
}

function adminForm(): AdminFormField[] {
  return [
    { kind: 'picker', key: 'compKey', label: 'Competition', pickerId: 'footshorts:competition', required: true },
    { kind: 'picker', key: 'fixtureId', label: 'Fixture', pickerId: 'footshorts:fixture', dependsOn: ['compKey'], required: true },
    {
      kind: 'select',
      key: 'matchStyle',
      label: 'Header style',
      options: [
        { value: 'tile', label: 'Tile' },
        { value: 'card-horizontal', label: 'Card · Horizontal' },
        { value: 'card-portrait', label: 'Card · Portrait' },
        { value: 'card-score', label: 'Card · Score' },
      ],
    },
    {
      kind: 'select',
      key: 'eventFilter',
      label: 'Events',
      options: [
        { value: 'all', label: 'All' },
        { value: 'goal', label: 'Goals' },
        { value: 'card', label: 'Cards' },
        { value: 'subst', label: 'Subs' },
      ],
    },
  ]
}

const matchTimelineCardModule: VizModule<FsCardMatchTimelineConfig> = {
  type: 'fscard:match-timeline',
  label: 'Match timeline',
  slots: ['foreground'],
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (c) => `fscard:match-timeline:${c.compKey}:${c.fixtureId}:${c.matchStyle}:${c.eventFilter}`,
}

export default matchTimelineCardModule
