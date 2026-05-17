'use client'

import { useQuery } from '@tanstack/react-query'

export type NewsCard = {
  id: string
  headline: string
  summary: string
  publisher: string
  url: string
  publishedAt: string
  imageUrl: string | null
}

// TODO(vizf1-scaffold): replace mock with worker-backed RSS feed (mirror the
// pattern from apps/footshort/worker/src/ingest.ts — RSS sources + Gemini
// summarization + Supabase storage). For the scaffold, these hardcoded items
// prove the Discover swipe shell renders.
const MOCK: NewsCard[] = [
  {
    id: 'mock-1',
    headline: 'Verstappen secures pole at Suzuka',
    summary:
      'Max Verstappen edged out Lando Norris by 0.066s in a tense Q3, with McLaren and Red Bull separated by less than two-tenths across the front of the grid.',
    publisher: 'Formula1.com',
    url: 'https://www.formula1.com',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    imageUrl: null,
  },
  {
    id: 'mock-2',
    headline: 'Ferrari brings major upgrade for Imola',
    summary:
      'A new floor and sidepod package will debut at the team’s home race as the Scuderia looks to close the gap to McLaren in the constructors’ championship.',
    publisher: 'Autosport',
    url: 'https://www.autosport.com',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 9).toISOString(),
    imageUrl: null,
  },
  {
    id: 'mock-3',
    headline: 'Mercedes confirms Antonelli for full 2025 season',
    summary:
      'The Italian rookie graduates from F2 to partner George Russell, taking over the seat vacated by Lewis Hamilton’s move to Ferrari.',
    publisher: 'The Race',
    url: 'https://www.the-race.com',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    imageUrl: null,
  },
]

export function useNewsFeed() {
  return useQuery({
    queryKey: ['vizf1', 'news', 'mock'],
    queryFn: async () => MOCK,
  })
}
