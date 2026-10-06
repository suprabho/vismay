import { useQuery } from '@tanstack/react-query'
import { FOOTSHORTS_WEB_ORIGIN } from './links'
import { HIDDEN_STORY_SLUGS } from './hiddenContent'

/**
 * A published footshorts HTML story, as footshorts.com/api/html-stories lists
 * it. The fields the magazine uses from PublishedHtmlStory
 * (packages/html-stories/src/htmlStories.ts), redeclared rather than imported
 * so the app doesn't typecheck that server-only module.
 */
export interface HtmlStoryCard {
  slug: string
  title: string
  description: string | null
  publishedAt: string | null
  updatedAt: string
  aura: string | null
  /** The page's declared palette (`vizmaya:theme`), when complete. */
  theme: { background?: string; surface?: string; accent?: string } | null
}

/**
 * Mobile twin of apps/footshorts/web/lib/useHtmlStories.ts. The table is
 * service-role only, so the app can't read it through its anon Supabase client
 * the way it reads `stories`: it goes through the web deployment's public JSON
 * route instead. Best-effort — a failed read leaves the magazine with its
 * viz-engine stories.
 */
export function useHtmlStories() {
  return useQuery<HtmlStoryCard[]>({
    queryKey: ['html-stories', 'footshorts'],
    queryFn: async () => {
      try {
        const res = await fetch(`${FOOTSHORTS_WEB_ORIGIN}/api/html-stories`)
        if (!res.ok) return []
        const body = (await res.json()) as { stories?: HtmlStoryCard[] }
        return (body.stories ?? []).filter((s) => !HIDDEN_STORY_SLUGS.has(s.slug))
      } catch {
        return []
      }
    },
    staleTime: 5 * 60_000,
  })
}
