import type { VizModule, AdminFormField } from '@vismay/viz-engine'
import type { FixtureEvent, EventTypeFilter } from '../../types'
import {
  type FsBackgroundConfig,
  fsBackgroundFields,
  parseFsBackground,
} from '../shared/background'

/**
 * `fs:match-timeline` — Foreground viz module wrapping MatchTimeline.
 *
 * Renders a chronological match event timeline (goals / cards / subs), home-side
 * events on the left, away-side on the right, minute down the middle. Events are
 * embedded inline in the config (like fs:standings-table embeds `rows`), so the
 * fence is self-contained. `filter` narrows to one event type at render time.
 *
 * Story YAML:
 *
 *   foreground:
 *     - type: fs:match-timeline
 *       filter: all          # all | goal | card | subst
 *       events:
 *         - { id: g1, fixture_id: m1, team_id: null, side: home, minute: 23,
 *             extra_minute: null, type: goal, detail: "Normal Goal",
 *             player_name: "Saka", assist_name: "Ødegaard" }
 *         - { id: c1, fixture_id: m1, team_id: null, side: away, minute: 45,
 *             extra_minute: 2, type: card, detail: "Yellow Card",
 *             player_name: "James", assist_name: null }
 */

const FILTERS: readonly EventTypeFilter[] = ['all', 'goal', 'card', 'subst']

export interface MatchTimelineConfig extends FsBackgroundConfig {
  type: 'fs:match-timeline'
  /** All events for the match (goals, cards, subs). Filtering/sorting is at render time. */
  events: FixtureEvent[]
  /** Render-time narrowing. 'all' (default) shows goals + cards + subs. */
  filter?: EventTypeFilter
  /** Empty-state copy when nothing matches. */
  emptyText?: string
}

function parseFilter(raw: unknown, label: string): EventTypeFilter {
  if (raw === undefined || raw === null) return 'all'
  if (typeof raw !== 'string' || !FILTERS.includes(raw as EventTypeFilter)) {
    throw new Error(
      `${label}: fs:match-timeline 'filter' must be one of ${FILTERS.join(', ')} (got ${String(raw)})`,
    )
  }
  return raw as EventTypeFilter
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): MatchTimelineConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fs:match-timeline layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  // Allow an empty array — `emptyText` covers the no-events case rather than throwing.
  if (!Array.isArray(r.events)) {
    throw new Error(`${ctx.label}: fs:match-timeline requires an 'events' array`)
  }
  return {
    type: 'fs:match-timeline',
    events: r.events as unknown as FixtureEvent[],
    filter: parseFilter(r.filter, ctx.label),
    emptyText: typeof r.emptyText === 'string' ? r.emptyText : undefined,
    ...parseFsBackground(r),
  }
}

function adminForm(): AdminFormField[] {
  return [
    {
      kind: 'select',
      key: 'filter',
      label: 'Event filter',
      options: [
        { value: 'all', label: 'All events' },
        { value: 'goal', label: 'Goals only' },
        { value: 'card', label: 'Cards only' },
        { value: 'subst', label: 'Substitutions only' },
      ],
    },
    { kind: 'text', key: 'emptyText', label: 'Empty-state copy (optional)' },
    ...fsBackgroundFields(),
  ]
}

const matchTimelineModule: VizModule<MatchTimelineConfig> = {
  type: 'fs:match-timeline',
  label: 'Footshorts — match timeline',
  slots: ['foreground'],
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (config) =>
    `fs:match-timeline:${config.events.length}:${config.filter ?? 'all'}:${config.backgroundImage ?? ''}`,
}

export default matchTimelineModule
