'use client'

import { useQuery } from '@tanstack/react-query'
import { supabaseBrowser } from './supabaseBrowser'

// VizF1 shares the project-wide Supabase project with vizmaya.fyi, so the
// anonymous read client reads vizmaya's `stories` table directly. Every read is
// scoped to `app_slug='vizf1'` — stories assigned to this app in the admin.

export type EditorialStory = {
  slug: string
  title: string
  publishedAt: string | null
}

type StoryRow = {
  slug: string
  title: string
  published_at: string | null
}

export function useEditorialStories(limit = 24) {
  return useQuery({
    queryKey: ['vizf1', 'editorial', 'stories', limit],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<EditorialStory[]> => {
      const { data, error } = await supabaseBrowser()
        .from('stories')
        .select('slug, title, published_at')
        .eq('status', 'published')
        .eq('listed', true)
        .eq('app_slug', 'vizf1')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(limit)
      if (error) throw error
      return (data as StoryRow[]).map((r) => ({
        slug: r.slug,
        title: r.title,
        publishedAt: r.published_at,
      }))
    },
  })
}
