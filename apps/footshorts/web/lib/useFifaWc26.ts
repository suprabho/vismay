import { useQuery } from '@tanstack/react-query'
import {
  getFifaWc26Teams,
  getFifaWc26TeamProfile,
  type FifaWc26Team,
  type FifaWc26TeamProfile,
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
