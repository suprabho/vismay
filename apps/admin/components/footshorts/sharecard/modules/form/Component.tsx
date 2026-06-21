'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { TeamFormStrip } from '@vismay/footshorts-viz/web'
import { useFootshortsFixtures } from '../dataContext'
import { withProxiedFixtureCrests } from '../shared'
import type { FsCardFormConfig } from '../types'

/** `fscard:form` — a team's last-5 W/D/L grid. Reproduces ShareCardCanvas's
 *  FormBody; derives the last 5 finished fixtures for the picked team. */
export default function FormCardComponent({ config, noteReady }: VizRenderProps<FsCardFormConfig>) {
  const { fixtures } = useFootshortsFixtures(config.compKey)

  const teamFixtures = fixtures
    .filter(
      (f) =>
        (f.home?.slug === config.teamSlug || f.away?.slug === config.teamSlug) &&
        f.status === 'finished',
    )
    .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at))
    .slice(-5)

  const teamName = (() => {
    for (const f of fixtures) {
      if (f.home?.slug === config.teamSlug && f.home?.name) return f.home.name
      if (f.away?.slug === config.teamSlug && f.away?.name) return f.away.name
    }
    return config.teamSlug
  })()

  useEffect(() => {
    if (teamFixtures.length === 0) return
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [teamFixtures.length, noteReady])

  if (teamFixtures.length === 0) return null

  return (
    <div className="flex h-full min-h-0 flex-col justify-center px-4">
      <TeamFormStrip
        fixtures={teamFixtures.map(withProxiedFixtureCrests)}
        teamId={config.teamSlug}
        label={`${teamName} · last 5`}
        layout="grid"
        columns={5}
        rows={1}
      />
    </div>
  )
}
