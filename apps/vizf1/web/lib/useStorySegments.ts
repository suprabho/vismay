'use client'

import { useQuery } from '@tanstack/react-query'
import { supabaseBrowser } from './supabaseBrowser'
import type { NewsCard } from './useNewsFeed'

type EntityKind = 'driver' | 'constructor'

type SegmentRow = {
  rank: number
  articles: {
    id: string
    headline: string
    summary: string | null
    publisher: string
    url: string
    published_at: string
    image_url: string | null
    topic_category: string | null
  } | null
}

function rowsToCards(rows: SegmentRow[]): NewsCard[] {
  return rows
    .filter((r): r is SegmentRow & { articles: NonNullable<SegmentRow['articles']> } => !!r.articles)
    .sort((a, b) => a.rank - b.rank)
    .map((r) => ({
      id: r.articles.id,
      headline: r.articles.headline,
      summary: r.articles.summary ?? '',
      publisher: r.articles.publisher,
      url: r.articles.url,
      publishedAt: r.articles.published_at,
      imageUrl: r.articles.image_url,
      topicCategory: r.articles.topic_category,
    }))
}

export function useStorySegments(entityType: EntityKind, entityId: string) {
  return useQuery({
    enabled: Boolean(entityId),
    queryKey: ['vizf1', 'story-segments', entityType, entityId],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<NewsCard[]> => {
      const sb = supabaseBrowser()
      const { data, error } = await sb
        .from('story_segments')
        .select(
          'rank, articles(id, headline, summary, publisher, url, published_at, image_url, topic_category)',
        )
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('rank', { ascending: true })
      if (error) throw error
      return rowsToCards((data ?? []) as unknown as SegmentRow[])
    },
  })
}
