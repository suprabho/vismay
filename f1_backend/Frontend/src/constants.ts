/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Signal } from './types';

export const MAGAZINE_CONTENT = {
  heroTitleLines: [
    'A race is not speed.',
    'It is decisions unfolding over time.'
  ],
  heroDescription: 'Dissecting the strategy, the telemetry, and the human element behind the pinnacle of motorsport.',
  liveSignalLabel: 'Live Signal',
  liveSignalTitle: 'Monza P1 Telemetry',
  liveStatusLabel: 'LIVE',
  trackMapImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDgBoKYtLQh8B9V-nEylpxs1HpziGmpNeYBbV1pcClNCJ_OIxjU2WwbwkuygNqbEMDMVxlvF-QOmQSySL2CSxTQZj9c2GZD9bDvy704YHtgkmsMa8CT_Qgep8W8dxWVFePB8l4_Ao0JQUPcJgtojCDC9B25wWxB6Odv6B_JH-jz7N1We2W9WPTO2-NMRCjWb-lAkfelk-ZkkNZLkYjUCvFshgUYirL5oQ4a6Vbs6RS8j_r3osJJzQ_7JFg7lQQ2RJDi_zHlJM3UknE',
  latestAnalysisHeading: 'Latest Analysis',
  liveStats: [
    {
      label: 'P1 GAP TO P2',
      value: '+1.245s',
      valueClass: 'text-telemetry-blue',
      icon: 'trending-up'
    },
    {
      label: 'SECTOR 1 FASTEST',
      value: '26.431',
      valueClass: 'text-gain-green',
      icon: 'gauge'
    },
    {
      label: 'TYRE DEGRADATION',
      value: 'High',
      valueClass: 'text-caution-yellow',
      icon: 'settings-2'
    },
    {
      label: 'WIND SPEED',
      value: '12 km/h',
      valueClass: 'text-neutral-900',
      icon: 'wind'
    }
  ]
} as const;

export const STORY_DETAIL_TELEMETRY = {
  articleId: '1',
  title: 'Telemetry Delta / Turn 14 Approach',
  driverALabel: 'DRIVER A',
  driverBLabel: 'DRIVER B',
  earlyLiftLabel: 'EARLY LIFT (-15M)',
  throttleLabel: 'THROTTLE APP. (+0.2S)',
  driverAPath: 'M 5 35 L 20 35 C 40 35, 50 15, 75 15 L 95 15',
  driverBPath: 'M 5 35 L 30 35 C 50 35, 60 10, 80 10 L 95 10',
  metrics: [
    {
      label: 'Braking Point',
      value: 'A: 110m / B: 95m',
      valueClass: 'text-neutral-900'
    },
    {
      label: 'Minimum Speed',
      value: 'A: 82km/h / B: 74km/h',
      valueClass: 'text-telemetry-blue'
    }
  ]
} as const;

export const SIGNALS: Signal[] = [
  {
    id: '1',
    lap: 24,
    location: 'SECTOR 2',
    priority: 'high',
    driverNumber: null,
    title: 'Medium compound front-left graining exceeding predicted model by 14%.',
    meaning: 'Current pace delta will drop by +0.8s per lap within next 3 laps.',
    implication: 'Strategy window shifting. Mandatory pit for Hard compound required 4 laps early.',
    telemetryFields: [
      { label: 'Tire Temp (FL)', value: '115°C', color: 'text-f1-red', percentage: 85 },
      { label: 'Wear Rate', value: '+14% vs Model', color: 'text-f1-red', percentage: 60 }
    ]
  },
  {
    id: '2',
    lap: 22,
    location: 'TURN 4',
    priority: 'med',
    driverNumber: null,
    title: 'Sudden drop in rear downforce detected on corner entry.',
    meaning: 'Potential debris strike to underfloor or diffuser stall.',
    implication: 'Monitor cornering speeds. Adjust brake bias forward to compensate for rear instability.',
    telemetryFields: [
      { label: 'AERO BAL', value: '42.1% F', color: 'text-primary' },
      { label: 'R-RIDE HGT', value: '+2mm', color: 'text-caution-yellow' },
      { label: 'DELTA', value: '+0.15s', color: 'text-f1-red' }
    ]
  },
  {
    id: '3',
    lap: 15,
    location: 'PIT STRAIGHT',
    priority: 'low',
    driverNumber: null,
    title: 'ERS deployment optimized, exiting slipstream.',
    meaning: 'Target top speed achieved 50m earlier than previous lap.',
    implication: 'Overtake delta established. Prepare for move into Turn 1.'
  }
];
