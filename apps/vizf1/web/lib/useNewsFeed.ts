'use client'

import { useQuery } from '@tanstack/react-query'
import { supabaseBrowser } from './supabaseBrowser'
import {
  ARTICLE_ENTITIES_SELECT,
  resolveStoryVisuals,
  type ArticleEntityRow,
  type StoryVisual,
} from './storyVisuals'

export type NewsCard = {
  id: string
  headline: string
  summary: string
  publisher: string
  url: string
  publishedAt: string
  imageUrl: string | null
  topicCategory: string | null
  /** Placeholder artwork when `imageUrl` is null (driver / team / race flag). */
  visual: StoryVisual | null
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
  vizf1_article_entities?: ArticleEntityRow[] | null
}

function rowToCard(r: ArticleRow, visual: StoryVisual | null = null): NewsCard {
  return {
    id: r.id,
    headline: r.headline,
    summary: r.summary ?? '',
    publisher: r.publisher,
    url: r.url,
    publishedAt: r.published_at,
    imageUrl: r.image_url,
    topicCategory: r.topic_category,
    visual,
  }
}

export function useNewsFeed(limit = 50) {
  return useQuery({
    queryKey: ['vizf1', 'news', 'feed', limit],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<NewsCard[]> => {
      const sb = supabaseBrowser()
      const { data, error } = await sb
        .from('vizf1_articles')
        .select(
          `id, headline, summary, publisher, url, published_at, image_url, topic_category, ${ARTICLE_ENTITIES_SELECT}`,
        )
        .eq('status', 'summarized')
        .order('published_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      const rows = (data ?? []) as ArticleRow[]
      const visuals = await resolveStoryVisuals(sb, rows)
      return rows.map((r) => rowToCard(r, visuals.get(r.id) ?? null))
    },
  })
}
