import type { AdminFormField, VizModule } from '@vismay/viz-engine'
import { isCalendarMonth } from '@vismay/footshorts-viz/web'
import type { FsCardCalendarConfig } from '../types'

/**
 * `fscard:calendar` — one team's month as a wall calendar (competition chip,
 * home/away fill, opponent crest per match day). Unlike the other picks-based
 * layers it spans SEVERAL competitions: a club's month mixes league, cup and
 * European nights, so the author ticks every competition the team plays in and
 * the module merges those fixture lists before filtering to the team + month.
 */
function parseConfig(raw: unknown, ctx: { slug: string; label: string }): FsCardCalendarConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fscard:calendar layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  const compKeys = Array.isArray(r.compKeys)
    ? r.compKeys.filter((k): k is string => typeof k === 'string' && k.length > 0)
    : []
  if (compKeys.length === 0) {
    throw new Error(`${ctx.label}: fscard:calendar requires at least one competition in 'compKeys'`)
  }
  if (typeof r.teamSlug !== 'string' || !r.teamSlug) {
    throw new Error(`${ctx.label}: fscard:calendar requires a 'teamSlug'`)
  }
  // Blank month = auto (the team's next fixture month); anything else must parse.
  const month = typeof r.month === 'string' ? r.month : ''
  if (month && !isCalendarMonth(month)) {
    throw new Error(`${ctx.label}: fscard:calendar 'month' must be YYYY-MM (got ${month})`)
  }
  return {
    type: 'fscard:calendar',
    compKeys,
    teamSlug: r.teamSlug,
    month,
    showScores: r.showScores !== false,
    showLegend: r.showLegend !== false,
  }
}

function adminForm(): AdminFormField[] {
  return [
    {
      kind: 'picker',
      key: 'compKeys',
      label: 'Competitions (every one the team plays in)',
      pickerId: 'footshorts:competition-multi',
      required: true,
    },
    {
      kind: 'picker',
      key: 'teamSlug',
      label: 'Team',
      pickerId: 'footshorts:team-multi',
      dependsOn: ['compKeys'],
      required: true,
    },
    {
      kind: 'picker',
      key: 'month',
      label: 'Month',
      pickerId: 'footshorts:month',
      dependsOn: ['compKeys', 'teamSlug'],
    },
    { kind: 'boolean', key: 'showScores', label: 'Show finished scores' },
    { kind: 'boolean', key: 'showLegend', label: 'Show legend' },
  ]
}

const calendarCardModule: VizModule<FsCardCalendarConfig> = {
  type: 'fscard:calendar',
  label: 'Team calendar',
  slots: ['foreground'],
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (c) =>
    `fscard:calendar:${c.compKeys.join('+')}:${c.teamSlug}:${c.month}:${c.showScores ? 1 : 0}${c.showLegend ? 1 : 0}`,
}

export default calendarCardModule
