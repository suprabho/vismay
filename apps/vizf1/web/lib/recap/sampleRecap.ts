/**
 * The sample recap: the design's story with sample numbers, in the same shape
 * a real race's recap has (./types). The recap page shows it, badged "Sample
 * data", when a race has no telemetry ingested; its replay then plays the
 * demo race, which has the same five drivers.
 */

import type { RaceRecap } from './types'

export const SAMPLE_RECAP: RaceRecap = {
  sample: true,
  sessionKey: 'demo',
  gpName: 'Grand Prix',
  season: null,
  round: null,
  totalLaps: 57,
  drivers: [
    { number: 1, code: 'VER', name: 'Verstappen', team: 'Red Bull', color: '#4C8DF6' },
    { number: 4, code: 'NOR', name: 'Norris', team: 'McLaren', color: '#FF8A1F' },
    { number: 16, code: 'LEC', name: 'Leclerc', team: 'Ferrari', color: '#E8203A' },
    { number: 63, code: 'RUS', name: 'Russell', team: 'Mercedes', color: '#27D3B8' },
    { number: 14, code: 'ALO', name: 'Alonso', team: 'Aston Martin', color: '#2FA36B' },
  ],
  chapters: [
    {
      kind: 'start',
      label: 'Lights out',
      kicker: 'Lights out · Lap 1',
      headline: 'Norris jumps two places into Turn 1',
      dek: 'A clean launch from P3 and a late move around the outside put the McLaren in front before the first braking zone.',
      replay: { lap: 1, cam: 'heli', focus: 'NOR' },
      hero: { code: 'NOR', delta: 2, from: 3, to: 1 },
      deltas: [
        { code: 'NOR', delta: 2 },
        { code: 'RUS', delta: 1 },
        { code: 'LEC', delta: 0 },
        { code: 'VER', delta: -1 },
        { code: 'ALO', delta: -2 },
      ],
    },
    {
      kind: 'pit-swing',
      label: 'The undercut',
      kicker: 'The undercut · Laps 18–24',
      headline: 'An early stop flips a 1.8s deficit',
      dek: 'Red Bull boxed Verstappen on lap 18. Three laps on fresh tyres were enough to come out ahead when Norris stopped on lap 21.',
      replay: { lap: 18, cam: 'chase', focus: 'VER' },
      a: 'VER',
      b: 'NOR',
      gap: [
        [12, 2.1], [13, 2.0], [14, 1.9], [15, 1.9], [16, 1.8], [17, 1.7], [18, 1.4], [19, 0.9],
        [20, 0.4], [21, -0.6], [22, -0.9], [23, -1.1], [24, -1.2], [25, -1.4], [26, -1.5], [27, -1.6], [28, -1.8],
      ].map(([lap, gap]) => ({ lap, gap })),
      pits: [
        { code: 'VER', lap: 18 },
        { code: 'NOR', lap: 21 },
      ],
      tiles: [
        { value: '2.4s', label: 'VER stop · L18' },
        { value: '2.9s', label: 'NOR stop · L21' },
        { value: '3.9s', label: 'Net swing', highlight: true },
      ],
    },
    {
      kind: 'battle',
      label: 'Wheel to wheel',
      kicker: 'Wheel to wheel · Lap 34',
      headline: 'Side by side through Turn 4',
      dek: 'Verstappen braked later, Norris carried more speed through the apex and held the inside on exit. The traces follow the replay frame by frame.',
      replay: { lap: 34, cam: 'pov', focus: 'VER' },
      a: 'VER',
      b: 'NOR',
      lap: 34,
      trace: {
        // VER brakes later and lower; NOR carries more minimum speed and is back on the throttle first.
        a: [[0, 316], [88, 321], [175, 324], [233, 298], [263, 215], [292, 138], [321, 108], [365, 120], [423, 178], [496, 232], [569, 268], [642, 291], [700, 304]].map(([d, v]) => ({ d, v })),
        b: [[0, 318], [88, 322], [175, 325], [219, 300], [248, 220], [277, 140], [307, 112], [350, 118], [408, 170], [482, 225], [554, 262], [627, 288], [700, 302]].map(([d, v]) => ({ d, v })),
        passAt: 554,
        apex: { d: 309, label: 'Turn 4 apex' },
        caption: 'KM/H · METRES INTO LAP 34 →',
      },
      tiles: [
        { code: 'VER', speed: 262, gear: 7, throttle: 100, brake: 0, drs: true },
        { code: 'NOR', speed: 261, gear: 7, throttle: 96, brake: 0, drs: false, delta: '+0.08s' },
      ],
    },
    {
      kind: 'finish',
      label: 'Chequered flag',
      kicker: 'Chequered flag · Lap 57',
      headline: 'Norris holds on by 1.6 seconds',
      dek: 'The lap-34 move stuck. Verstappen closed to within a second twice in the final stint but never got back into DRS range.',
      replay: { lap: 57, cam: 'tv', focus: 'NOR' },
      results: [
        { pos: 1, code: 'NOR', gap: 'Winner', pts: 25 },
        { pos: 2, code: 'VER', gap: '+1.6s', pts: 18 },
        { pos: 3, code: 'LEC', gap: '+8.4s', pts: 15 },
        { pos: 4, code: 'RUS', gap: '+12.1s', pts: 12 },
        { pos: 5, code: 'ALO', gap: '+27.9s', pts: 10 },
      ],
      fastestLap: { code: 'VER', time: '1:31.447', lap: 49 },
    },
  ],
}
