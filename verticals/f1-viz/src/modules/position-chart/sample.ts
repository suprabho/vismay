import type { PositionChartConfig } from './index'

export const sample: PositionChartConfig = {
  type: 'f1:position-chart',
  raceLabel: '2024 Monaco GP (sample)',
  totalLaps: 78,
  lanes: [
    {
      driverId: 'charles_leclerc',
      driverCode: 'LEC',
      driverName: 'Charles Leclerc',
      color: '#E80020',
      points: [
        { lap: 1, position: 1 },
        { lap: 10, position: 1 },
        { lap: 25, position: 1 },
        { lap: 40, position: 1 },
        { lap: 55, position: 1 },
        { lap: 78, position: 1 },
      ],
    },
    {
      driverId: 'oscar_piastri',
      driverCode: 'PIA',
      driverName: 'Oscar Piastri',
      color: '#FF8000',
      points: [
        { lap: 1, position: 2 },
        { lap: 10, position: 2 },
        { lap: 25, position: 2 },
        { lap: 40, position: 2 },
        { lap: 55, position: 2 },
        { lap: 78, position: 2 },
      ],
    },
    {
      driverId: 'carlos_sainz',
      driverCode: 'SAI',
      driverName: 'Carlos Sainz',
      color: '#E80020',
      points: [
        { lap: 1, position: 3 },
        { lap: 10, position: 3 },
        { lap: 25, position: 3 },
        { lap: 40, position: 3 },
        { lap: 55, position: 3 },
        { lap: 78, position: 3 },
      ],
    },
  ],
}
