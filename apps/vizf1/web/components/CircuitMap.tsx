'use client'

import { useQuery } from '@tanstack/react-query'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

type Props = {
  circuitId: string
  accent?: string
  height?: number
}

type CircuitGeom = {
  track_path_svg: string | null
  track_bounds: unknown
}

function useCircuitGeometry(circuitId: string) {
  return useQuery({
    enabled: Boolean(circuitId),
    queryKey: ['vizf1', 'circuit', circuitId],
    staleTime: 60 * 60_000,
    queryFn: async (): Promise<CircuitGeom | null> => {
      const sb = supabaseBrowser()
      const { data, error } = await sb
        .from('circuits')
        .select('track_path_svg, track_bounds')
        .eq('circuit_id', circuitId)
        .maybeSingle()
      if (error) throw error
      return (data as CircuitGeom) ?? null
    },
  })
}

export function CircuitMap({ circuitId, accent = '#e10600', height = 160 }: Props) {
  const q = useCircuitGeometry(circuitId)
  const d = q.data?.track_path_svg ?? null

  if (!d) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-border bg-surface text-[10px] text-muted"
        style={{ height }}
      >
        Circuit outline not yet available
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-border bg-surface p-3" style={{ height }}>
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        aria-hidden
      >
        <path
          d={d}
          fill="none"
          stroke={accent}
          strokeWidth={12}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.85}
        />
      </svg>
    </div>
  )
}
