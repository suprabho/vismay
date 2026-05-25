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
import { supabase } from './supabase'

// Footshorts and vizmaya.fyi share the same Supabase project, so the existing
// app client also reads vizmaya's `stories` and `epics` tables. The fetch
// helpers in @footshorts/shared scope every read to `app_slug='footshorts'`.

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

export function useEditorialEpics() {
  return useQuery<EditorialEpicSummary[]>({
    queryKey: EDITORIAL_QUERY_KEYS.epics(),
    queryFn: () => fetchEditorialEpics(supabase),
    staleTime: 5 * 60_000,
  })
}

export function useEditorialEpic(slug: string | null | undefined) {
  return useQuery<EditorialEpicWithStories | null>({
    queryKey: slug ? EDITORIAL_QUERY_KEYS.epic(slug) : ['editorial', 'epic', '__none__'],
    queryFn: () => (slug ? fetchEditorialEpic(supabase, slug) : Promise.resolve(null)),
    enabled: !!slug,
  })
}
