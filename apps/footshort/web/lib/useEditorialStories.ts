import { useQuery } from '@tanstack/react-query'
import {
  fetchEditorialStories,
  fetchEditorialStory,
  EDITORIAL_QUERY_KEYS,
  type EditorialStorySummary,
  type EditorialStoryFull,
  type FetchEditorialStoriesOptions,
} from '@shortfoot/shared'
import { supabase } from './supabase'

// Footshort and vizmaya.fyi share the same Supabase project, so the existing
// app client also reads vizmaya's `stories` table. RLS on that table already
// filters to (status='published' AND listed=true).

export function useEditorialStories(opts?: FetchEditorialStoriesOptions) {
  return useQuery<EditorialStorySummary[]>({
    queryKey: EDITORIAL_QUERY_KEYS.stories(opts),
    queryFn: () => fetchEditorialStories(supabase, opts),
    staleTime: 5 * 60_000,
  })
}

export function useEditorialStory(slug: string | null | undefined) {
  return useQuery<EditorialStoryFull | null>({
    queryKey: slug ? EDITORIAL_QUERY_KEYS.story(slug) : ['editorial', 'story', '__none__'],
    queryFn: () => (slug ? fetchEditorialStory(supabase, slug) : Promise.resolve(null)),
    enabled: !!slug,
  })
}
