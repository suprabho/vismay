import type { ConstructorPodiumConfig } from './index'

export const sample: ConstructorPodiumConfig = {
  type: 'f1:constructor-podium',
  rows: [
    {
      position: 1,
      constructorId: 'mercedes',
      constructorName: 'Mercedes',
      nationality: 'German',
      primaryColor: '#27F4D2',
      logoUrl: null,
      points: 503,
      wins: 9,
    },
    {
      position: 2,
      constructorId: 'ferrari',
      constructorName: 'Ferrari',
      nationality: 'Italian',
      primaryColor: '#E8002D',
      logoUrl: null,
      points: 360,
      wins: 3,
    },
    {
      position: 3,
      constructorId: 'mclaren',
      constructorName: 'McLaren',
      nationality: 'British',
      primaryColor: '#FF8000',
      logoUrl: null,
      points: 306,
      wins: 2,
    },
  ],
}
