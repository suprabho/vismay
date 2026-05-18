'use client'

import { useQuery } from '@tanstack/react-query'
import { StoryViewer } from '@/components/StoryViewer'
import { useStorySegments } from '@/lib/useStorySegments'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

function useTeamName(teamId: string) {
  return useQuery({
    queryKey: ['vizf1', 'team-name', teamId],
    staleTime: 60 * 60_000,
    queryFn: async (): Promise<string> => {
      const sb = supabaseBrowser()
      const { data } = await sb
        .from('constructors')
        .select('name')
        .eq('constructor_id', teamId)
        .maybeSingle()
      return data?.name ?? teamId
    },
  })
}

export function TeamStoryView({ teamId }: { teamId: string }) {
  const name = useTeamName(teamId)
  const segs = useStorySegments('constructor', teamId)
  if (segs.isLoading)
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-bg">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  return <StoryViewer title={name.data ?? teamId} segments={segs.data ?? []} />
}
