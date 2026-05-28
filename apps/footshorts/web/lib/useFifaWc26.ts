import { useQuery } from '@tanstack/react-query'
import {
  getFifaWc26Teams,
  getFifaWc26TeamProfile,
  getFifaWc26Squad,
  type FifaWc26Team,
  type FifaWc26TeamProfile,
  type FifaWc26Squad,
} from './fifaWc26'

// FIFA WC26 epic landing reads. `fifa_wc26_teams` is public-read, so these go
// through the same anon Supabase client as the rest of the Footshorts web app.

export function useFifaWc26Teams() {
  return useQuery<FifaWc26Team[]>({
    queryKey: ['fifa-wc26', 'teams'],
    queryFn: getFifaWc26Teams,
    staleTime: 30 * 60_000,
  })
}

export function useFifaWc26TeamProfile(code: string | null | undefined) {
  return useQuery<FifaWc26TeamProfile | null>({
    queryKey: code ? ['fifa-wc26', 'team', code] : ['fifa-wc26', 'team', '__none__'],
    queryFn: () => (code ? getFifaWc26TeamProfile(code) : Promise.resolve(null)),
    enabled: !!code,
    staleTime: 15 * 60_000,
  })
}

export function useFifaWc26Squad(code: string | null | undefined) {
  return useQuery<FifaWc26Squad>({
    queryKey: code ? ['fifa-wc26', 'squad', code] : ['fifa-wc26', 'squad', '__none__'],
    queryFn: () =>
      code
        ? getFifaWc26Squad(code)
        : Promise.resolve({ players: [], byLeague: [], total: 0, unmatched: 0 }),
    enabled: !!code,
    staleTime: 15 * 60_000,
  })
}
