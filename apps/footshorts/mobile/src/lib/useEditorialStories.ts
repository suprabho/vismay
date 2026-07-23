import { useQuery } from '@tanstack/react-query'
import {
  fetchEditorialStories,
  fetchEditorialStory,
  fetchEditorialEpics,
  fetchEditorialEpic,
  EDITORIAL_QUERY_KEYS,
  type EditorialStorySummary,
  type EditorialStoryFull,
  type EditorialEpicSummary,
  type EditorialEpicWithStories,
  type FetchEditorialStoriesOptions,
} from '@footshorts/shared'
import { HIDDEN_EPIC_SLUGS, HIDDEN_STORY_SLUGS } from './hiddenContent'
import { supabase } from './supabase'

// Mobile twin of apps/footshorts/web/lib/useEditorialStories.ts. Reuses
// Footshorts's existing Supabase client — same project as vizmaya.fyi.

export function useEditorialStories(opts?: FetchEditorialStoriesOptions) {
  return useQuery<EditorialStorySummary[]>({
    queryKey: EDITORIAL_QUERY_KEYS.stories(opts),
    queryFn: async () =>
      (await fetchEditorialStories(supabase, opts)).filter(
        (s) => !HIDDEN_STORY_SLUGS.has(s.slug),
      ),
    staleTime: 5 * 60_000,
  })
}

export function useEditorialStory(slug: string | null | undefined) {
  return useQuery<EditorialStoryFull | null>({
    queryKey: slug ? EDITORIAL_QUERY_KEYS.story(slug) : ['editorial', 'story', '__none__'],
    queryFn: () => (slug ? fetchEditorialStory(supabase, slug) : Promise.resolve(null)),
    enabled: !!slug && !HIDDEN_STORY_SLUGS.has(slug),
  })
}

export function useEditorialEpics() {
  return useQuery<EditorialEpicSummary[]>({
    queryKey: EDITORIAL_QUERY_KEYS.epics(),
    queryFn: async () =>
      (await fetchEditorialEpics(supabase)).filter((e) => !HIDDEN_EPIC_SLUGS.has(e.slug)),
    staleTime: 5 * 60_000,
  })
}

export function useEditorialEpic(slug: string | null | undefined) {
  return useQuery<EditorialEpicWithStories | null>({
    queryKey: slug ? EDITORIAL_QUERY_KEYS.epic(slug) : ['editorial', 'epic', '__none__'],
    queryFn: () => (slug ? fetchEditorialEpic(supabase, slug) : Promise.resolve(null)),
    enabled: !!slug && !HIDDEN_EPIC_SLUGS.has(slug),
  })
}
