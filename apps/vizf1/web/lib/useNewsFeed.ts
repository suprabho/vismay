'use client'

import { useQuery } from '@tanstack/react-query'
import { supabaseBrowser } from './supabaseBrowser'

export type NewsCard = {
  id: string
  headline: string
  summary: string
  publisher: string
  url: string
  publishedAt: string
  imageUrl: string | null
  topicCategory: string | null
}

type ArticleRow = {
  id: string
  headline: string
  summary: string | null
  publisher: string
  url: string
  published_at: string
  image_url: string | null
  topic_category: string | null
}

function rowToCard(r: ArticleRow): NewsCard {
  return {
    id: r.id,
    headline: r.headline,
    summary: r.summary ?? '',
    publisher: r.publisher,
    url: r.url,
    publishedAt: r.published_at,
    imageUrl: r.image_url,
    topicCategory: r.topic_category,
  }
}

export function useNewsFeed(limit = 50) {
  return useQuery({
    queryKey: ['vizf1', 'news', 'feed', limit],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<NewsCard[]> => {
      const sb = supabaseBrowser()
      const { data, error } = await sb
        .from('articles')
        .select('id, headline, summary, publisher, url, published_at, image_url, topic_category')
        .eq('status', 'summarized')
        .order('published_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []).map(rowToCard)
    },
  })
}
