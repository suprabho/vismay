'use client'

import { useEffect, useMemo } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import {
  Bracket,
  BracketTree,
  buildBracket,
  buildStaticBracket,
} from '@vismay/footshorts-viz/web'
import { useFootshortsFixtures } from '../dataContext'
import { withProxiedBracketCrests, withProxiedFixtureCrests } from '../shared'
import type { FsCardBracketConfig } from '../types'

/**
 * `fscard:bracket` — a knockout bracket share card.
 *
 * Renders the same tree/list as the story `fs:bracket`, but resolved for the
 * share-card pipeline (crests proxied for html-to-image capture). Two sources,
 * the incomplete `rounds` draw winning when present:
 *   - `rounds`  → buildStaticBracket: an incomplete draw with team /
 *                 placeholder / TBD slots (the "14 teams locked in" look).
 *   - `compKey` → buildBracket over the competition's live knockout fixtures.
 */
export default function BracketCardComponent({
  config,
  noteReady,
}: VizRenderProps<FsCardBracketConfig>) {
  const { fixtures } = useFootshortsFixtures(config.compKey ?? '')

  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  const bracket = useMemo(() => {
    const built = config.rounds
      ? buildStaticBracket({ rounds: config.rounds, competitionSlug: config.competitionSlug })
      : buildBracket(fixtures.map(withProxiedFixtureCrests))
    if (!built) return null
    // The static path bakes palette flags into crest_url, so proxy after build;
    // the fixture path already proxied its inputs but re-proxying is idempotent
    // enough (URLs only get wrapped once — proxyCrest no-ops on empty).
    return config.rounds ? withProxiedBracketCrests(built) : built
  }, [config.rounds, config.competitionSlug, fixtures])

  const isTree = config.layout !== 'list'
  const orientation =
    config.layout === 'tree-vertical'
      ? 'vertical'
      : config.layout === 'tree-horizontal'
        ? 'horizontal'
        : 'auto'

  if (!bracket) {
    return (
      <div className="flex h-full items-center justify-center px-3 text-[14px] text-muted">
        Add a draw: paste <code className="mx-1">rounds</code> or pick a competition.
      </div>
    )
  }

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col overflow-auto px-3"
      style={{ alignItems: 'safe center', justifyContent: 'safe center' }}
    >
      <div style={{ width: '100%', maxWidth: isTree ? '100%' : 520 }}>
        {isTree ? (
          <BracketTree
            bracket={bracket}
            orientation={orientation}
            highlightTeamId={config.highlightTeamId}
            title={config.title}
            competitionSlug={config.competitionSlug ?? bracket.competition_slug}
          />
        ) : (
          <Bracket bracket={bracket} />
        )}
      </div>
    </div>
  )
}
