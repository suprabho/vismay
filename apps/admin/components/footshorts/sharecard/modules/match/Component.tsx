'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { useFootshortsFixtures } from '../dataContext'
import { MatchStyleCard, resolveMatchScore } from '../shared'
import type { FsCardMatchConfig } from '../types'

/** `fscard:match` — a single fixture as the colorful tile or an editorial card.
 *  Reproduces ShareCardCanvas's MatchBody; resolves the fixture by id. */
export default function MatchCardComponent({ config, noteReady }: VizRenderProps<FsCardMatchConfig>) {
  const { fixtures, meta } = useFootshortsFixtures(config.compKey)
  const fixture = fixtures.find((f) => f.id === config.fixtureId) ?? null

  useEffect(() => {
    if (!fixture) return
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [fixture, noteReady])

  if (!fixture) return null
  const competitionName = meta?.name ?? ''

  // Validate the hardcoded score/penalties up front so an incoherent scoreline
  // (non-numeric, not level, level shootout) shows a visible message instead of
  // throwing through render — which LayerView swallows into a blank layer.
  let scoreError: string | null = null
  try {
    resolveMatchScore(fixture, config.scoreOverride, config.penalties)
  } catch (e) {
    scoreError = e instanceof Error ? e.message : 'Invalid score'
  }
  if (scoreError) return <ScoreError message={scoreError} />

  if (config.matchStyle === 'tile') {
    return (
      <div className="flex h-full min-h-0 flex-col justify-center gap-4 px-4">
        <div className="text-center text-[15px] font-semibold uppercase tracking-wide text-muted">
          {competitionName}
        </div>
        <div className="w-full">
          <MatchStyleCard
            fixture={fixture}
            style="tile"
            competitionName={competitionName}
            scoreOverride={config.scoreOverride}
            penalties={config.penalties}
          />
        </div>
      </div>
    )
  }
  return (
    <div className="flex h-full min-h-0 items-center justify-center px-3 py-2">
      <MatchStyleCard
        fixture={fixture}
        style={config.matchStyle}
        competitionName={competitionName}
        scoreOverride={config.scoreOverride}
        penalties={config.penalties}
      />
    </div>
  )
}

/** In-card validation message for a bad score/penalties override. */
function ScoreError({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center p-4">
      <div className="max-w-[80%] rounded-lg border border-red-400/60 bg-red-500/10 px-4 py-3 text-center text-[13px] font-medium text-red-300">
        {message}
      </div>
    </div>
  )
}
