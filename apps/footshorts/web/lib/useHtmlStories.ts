import { useQuery } from '@tanstack/react-query';
import type { PublishedHtmlStory } from '@vismay/html-stories/htmlStories';

/**
 * Published footshorts HTML stories (packages/html-stories), for the Editorial
 * tab. They are read through /api/html-stories (a server route with the
 * service client) rather than the anon Supabase client: the table is RLS-locked
 * to the service role so drafts never leak. Best-effort — a failed read leaves
 * the magazine with its viz-engine stories.
 */
export function useHtmlStories() {
  return useQuery<PublishedHtmlStory[]>({
    queryKey: ['html-stories', 'footshorts'],
    queryFn: async () => {
      const res = await fetch('/api/html-stories');
      if (!res.ok) return [];
      const body = (await res.json()) as { stories?: PublishedHtmlStory[] };
      return body.stories ?? [];
    },
    staleTime: 5 * 60_000,
  });
}
