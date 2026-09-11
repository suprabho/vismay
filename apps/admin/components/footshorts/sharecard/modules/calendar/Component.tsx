'use client'

import { useEffect, useMemo } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { TeamCalendar, defaultCalendarMonth, formatCalendarMonth } from '@vismay/footshorts-viz/web'
import { useFootshortsFixturesMulti } from '../dataContext'
import { withProxiedFixtureCrests } from '../shared'
import type { FsCardCalendarConfig } from '../types'

/** `fscard:calendar` — a team's month across every ticked competition. Merges
 *  the competitions' fixture lists, keeps the picked team's matches, and hands
 *  the month to TeamCalendar (which does the day-grid + per-match chips). An
 *  empty `month` opens on the team's next fixture. */
export default function CalendarCardComponent({
  config,
  noteReady,
}: VizRenderProps<FsCardCalendarConfig>) {
  const { fixtures, loaded } = useFootshortsFixturesMulti(config.compKeys)

  const teamFixtures = useMemo(
    () =>
      fixtures
        .filter((f) => f.home?.slug === config.teamSlug || f.away?.slug === config.teamSlug)
        .map(withProxiedFixtureCrests),
    [fixtures, config.teamSlug],
  )

  const teamName = (() => {
    for (const f of teamFixtures) {
      if (f.home?.slug === config.teamSlug && f.home?.name) return f.home.name
      if (f.away?.slug === config.teamSlug && f.away?.name) return f.away.name
    }
    return config.teamSlug
  })()

  const month = config.month || defaultCalendarMonth(teamFixtures, config.teamSlug)

  // Ready once every referenced competition has resolved (the capture gate);
  // a competition still in flight would bake an incomplete month.
  useEffect(() => {
    if (!loaded) return
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [loaded, noteReady])

  if (!config.teamSlug) return null

  return (
    <div className="flex h-full min-h-0 flex-col justify-center px-3">
      <TeamCalendar
        fixtures={teamFixtures}
        teamId={config.teamSlug}
        month={month}
        label={`${teamName} · ${formatCalendarMonth(month)}`}
        showScores={config.showScores}
        showLegend={config.showLegend}
      />
    </div>
  )
}
