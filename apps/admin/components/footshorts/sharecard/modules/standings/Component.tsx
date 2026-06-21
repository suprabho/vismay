'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { StandingsTable } from '@vismay/footshorts-viz/web'
import { useCardRatio, useFootshortsStandings } from '../dataContext'
import { maxStandingsRows, proxyCrest } from '../shared'
import type { FsCardStandingsConfig } from '../types'

/**
 * `fscard:standings` — the share-card standings table. Reproduces
 * ShareCardCanvas's StandingsBody verbatim (header + crest-proxied table) but
 * resolves its rows from the injected data by compKey, filtered to one group for
 * group-stage cups and capped to what fits the card ratio.
 */
export default function StandingsCardComponent({
  config,
  noteReady,
}: VizRenderProps<FsCardStandingsConfig>) {
  const ratio = useCardRatio()
  const { rows, meta } = useFootshortsStandings(config.compKey)

  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  const filtered = config.group
    ? rows.filter((r) => (r.group_label ?? '') === config.group)
    : rows
  const capped = filtered.slice(0, maxStandingsRows(ratio))
  if (capped.length === 0) return null

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 px-3">
      <div className="text-[14px] font-semibold uppercase tracking-wide text-muted">
        {meta?.name ?? ''} · {config.group || meta?.season || ''}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <StandingsTable
          rows={capped.map((r) =>
            r.team ? { ...r, team: { ...r.team, crest_url: proxyCrest(r.team.crest_url) } } : r,
          )}
        />
      </div>
    </div>
  )
}
