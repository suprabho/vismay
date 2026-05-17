'use client'

export type FollowedEntities = {
  drivers: { id: string; name: string; code: string }[]
  constructors: { id: string; name: string }[]
}

// TODO(vizf1-scaffold): replace with auth-backed follows once apps/vizf1/web
// ports the AuthProvider + onboarding flow from footshort.
const STATIC: FollowedEntities = {
  drivers: [
    { id: 'max_verstappen', name: 'Max Verstappen', code: 'VER' },
    { id: 'norris', name: 'Lando Norris', code: 'NOR' },
    { id: 'leclerc', name: 'Charles Leclerc', code: 'LEC' },
    { id: 'hamilton', name: 'Lewis Hamilton', code: 'HAM' },
    { id: 'piastri', name: 'Oscar Piastri', code: 'PIA' },
  ],
  constructors: [
    { id: 'mclaren', name: 'McLaren' },
    { id: 'red_bull', name: 'Red Bull' },
    { id: 'ferrari', name: 'Ferrari' },
    { id: 'mercedes', name: 'Mercedes' },
  ],
}

export function useFollowedEntities(): FollowedEntities {
  return STATIC
}
