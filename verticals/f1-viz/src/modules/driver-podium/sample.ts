import type { DriverPodiumConfig } from './index'

export const sample: DriverPodiumConfig = {
  type: 'f1:driver-podium',
  rows: [
    {
      position: 1,
      driverId: 'kimi_antonelli',
      driverCode: 'ANT',
      driverName: 'Kimi Antonelli',
      constructorId: 'mercedes',
      constructorName: 'Mercedes',
      constructorColor: '#27F4D2',
      headshotUrl: null,
      points: 292,
      wins: 6,
    },
    {
      position: 2,
      driverId: 'russell',
      driverCode: 'RUS',
      driverName: 'George Russell',
      constructorId: 'mercedes',
      constructorName: 'Mercedes',
      constructorColor: '#27F4D2',
      headshotUrl: null,
      points: 211,
      wins: 3,
    },
    {
      position: 3,
      driverId: 'hamilton',
      driverCode: 'HAM',
      driverName: 'Lewis Hamilton',
      constructorId: 'ferrari',
      constructorName: 'Ferrari',
      constructorColor: '#E8002D',
      headshotUrl: null,
      points: 189,
      wins: 2,
    },
  ],
}
