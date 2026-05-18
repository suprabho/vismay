'use client'

import { useQuery } from '@tanstack/react-query'
import { StoryViewer } from '@/components/StoryViewer'
import { useStorySegments } from '@/lib/useStorySegments'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

function useDriverName(driverId: string) {
  return useQuery({
    queryKey: ['vizf1', 'driver-name', driverId],
    staleTime: 60 * 60_000,
    queryFn: async (): Promise<string> => {
      const sb = supabaseBrowser()
      const { data } = await sb
        .from('vizf1_drivers')
        .select('given_name, family_name')
        .eq('driver_id', driverId)
        .maybeSingle()
      if (data) return `${data.given_name} ${data.family_name}`
      return driverId
    },
  })
}

export function DriverStoryView({ driverId }: { driverId: string }) {
  const name = useDriverName(driverId)
  const segs = useStorySegments('driver', driverId)
  if (segs.isLoading)
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-bg">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  return <StoryViewer title={name.data ?? driverId} segments={segs.data ?? []} />
}
