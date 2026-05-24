import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

// Slug → crest_url for every seeded league. Small query (≤30 rows) used to
// theme each MatchTile's watermark with the right competition logo. Mobile
// twin of apps/footshort/web/lib/useLeagueCrestMap.ts.
export function useLeagueCrestMap() {
  return useQuery({
    queryKey: ['leagueCrestMap'],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from('entities')
        .select('slug, crest_url')
        .eq('type', 'league')
        .not('crest_url', 'is', null);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as { slug: string; crest_url: string }[]) {
        map[row.slug] = row.crest_url;
      }
      return map;
    },
    staleTime: 60 * 60 * 1000,
  });
}
