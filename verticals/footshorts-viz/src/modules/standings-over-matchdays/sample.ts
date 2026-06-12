import type { StandingsOverMatchdaysConfig } from './index'

// A trimmed run-in (MD27–38): the x-axis left origin now derives from the first
// matchday present in the data, so a partial series fills the plot instead of
// anchoring at MD1 and leaving the early season blank. To pin the window
// explicitly instead, set `matchdayRange: { from, to }` (e.g. to reserve space
// for fixtures not yet played, or to show the full season around a short run).
export const sample: StandingsOverMatchdaysConfig = {
  type: 'fs:standings-over-matchdays',
  competitionLabel: 'Premier League · 2025/26 (sample)',
  // Showcase the loop in the catalog: the line-draw entrance replays
  // continuously, resting 2.5s on the drawn frame between replays (loopDelayMs
  // defaults to 1600). Omit both in real stories for a single in-view draw.
  loop: true,
  loopDelayMs: 2500,
  lanes: [
    {
      team_id: 'man-utd',
      team_name: 'Manchester United',
      team_code: 'MUN',
      color: '#DA291C',
      // Hero lane: drawn thicker and on top while the rest of the pack dims.
      highlight: true,
      lineWidth: 3.5,
      points: [
        { matchday: 27, position: 6 },
        { matchday: 28, position: 7 },
        { matchday: 29, position: 6 },
        { matchday: 30, position: 5 },
        { matchday: 31, position: 5 },
        { matchday: 32, position: 4 },
        { matchday: 33, position: 4 },
        { matchday: 34, position: 4 },
        { matchday: 35, position: 3 },
        { matchday: 36, position: 3 },
        { matchday: 37, position: 3 },
        { matchday: 38, position: 3 },
      ],
    },
    {
      team_id: 'arsenal',
      team_name: 'Arsenal',
      team_code: 'ARS',
      color: '#EF0107',
      points: [
        { matchday: 27, position: 1 },
        { matchday: 28, position: 1 },
        { matchday: 29, position: 1 },
        { matchday: 30, position: 1 },
        { matchday: 31, position: 2 },
        { matchday: 32, position: 1 },
        { matchday: 33, position: 1 },
        { matchday: 34, position: 1 },
        { matchday: 35, position: 1 },
        { matchday: 36, position: 1 },
        { matchday: 37, position: 1 },
        { matchday: 38, position: 1 },
      ],
    },
    {
      team_id: 'man-city',
      team_name: 'Manchester City',
      team_code: 'MCI',
      color: '#6CABDD',
      points: [
        { matchday: 27, position: 2 },
        { matchday: 28, position: 2 },
        { matchday: 29, position: 3 },
        { matchday: 30, position: 2 },
        { matchday: 31, position: 1 },
        { matchday: 32, position: 2 },
        { matchday: 33, position: 2 },
        { matchday: 34, position: 2 },
        { matchday: 35, position: 2 },
        { matchday: 36, position: 2 },
        { matchday: 37, position: 2 },
        { matchday: 38, position: 2 },
      ],
    },
    {
      team_id: 'liverpool',
      team_name: 'Liverpool',
      team_code: 'LIV',
      color: '#C8102E',
      points: [
        { matchday: 27, position: 3 },
        { matchday: 28, position: 3 },
        { matchday: 29, position: 2 },
        { matchday: 30, position: 4 },
        { matchday: 31, position: 4 },
        { matchday: 32, position: 3 },
        { matchday: 33, position: 3 },
        { matchday: 34, position: 3 },
        { matchday: 35, position: 4 },
        { matchday: 36, position: 4 },
        { matchday: 37, position: 4 },
        { matchday: 38, position: 4 },
      ],
    },
  ],
}
