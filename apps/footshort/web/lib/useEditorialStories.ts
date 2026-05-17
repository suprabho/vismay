import { useQuery } from '@tanstack/react-query'
import {
  fetchEditorialStories,
  fetchEditorialStory,
  EDITORIAL_QUERY_KEYS,
  type EditorialStorySummary,
  type EditorialStoryFull,
  type FetchEditorialStoriesOptions,
} from '@shortfoot/shared'
import { getVizmayaClient } from './vizmayaClient'

export function useEditorialStories(opts?: FetchEditorialStoriesOptions) {
  return useQuery<EditorialStorySummary[]>({
    queryKey: EDITORIAL_QUERY_KEYS.stories(opts),
    queryFn: () => fetchEditorialStories(getVizmayaClient(), opts),
    staleTime: 5 * 60_000,
  })
}

export function useEditorialStory(slug: string | null | undefined) {
  return useQuery<EditorialStoryFull | null>({
    queryKey: slug ? EDITORIAL_QUERY_KEYS.story(slug) : ['editorial', 'story', '__none__'],
    queryFn: () => (slug ? fetchEditorialStory(getVizmayaClient(), slug) : Promise.resolve(null)),
    enabled: !!slug,
  })
}
