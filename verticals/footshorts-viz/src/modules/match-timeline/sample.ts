import type { MatchTimelineConfig } from './index'

// Spans both halves with all three rendered event types (goal/card/subst) on
// both sides, so the catalog preview shows the full layout. No `filter` set →
// renders everything.
export const sample: MatchTimelineConfig = {
  type: 'fs:match-timeline',
  events: [
    {
      id: 'g1',
      fixture_id: 'sample',
      team_id: null,
      side: 'home',
      minute: 21,
      extra_minute: null,
      type: 'goal',
      detail: 'Normal Goal',
      player_name: 'Bukayo Saka',
      assist_name: 'Martin Ødegaard',
    },
    {
      id: 'c1',
      fixture_id: 'sample',
      team_id: null,
      side: 'away',
      minute: 45,
      extra_minute: 2,
      type: 'card',
      detail: 'Yellow Card',
      player_name: 'Reece James',
      assist_name: null,
    },
    {
      id: 's1',
      fixture_id: 'sample',
      team_id: null,
      side: 'home',
      minute: 63,
      extra_minute: null,
      type: 'subst',
      detail: null,
      player_name: 'Kai Havertz',
      assist_name: 'Gabriel Jesus',
    },
    {
      id: 'g2',
      fixture_id: 'sample',
      team_id: null,
      side: 'away',
      minute: 78,
      extra_minute: null,
      type: 'goal',
      detail: 'Penalty',
      player_name: 'Cole Palmer',
      assist_name: null,
    },
  ],
}
