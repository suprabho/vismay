'use client'

import { StoryRings } from '@/components/StoryRings'
import { SectionHeader } from '@/components/SectionHeader'
import { ChampionshipPodiums } from '@/components/ChampionshipPodiums'
import { SeasonStandingsChart } from '@/components/SeasonStandingsChart'
import { RaceWeekends } from '@/components/RaceWeekends'
import { UpcomingRaceCalendar } from '@/components/UpcomingRaceCalendar'

export function ForYouFeed() {
  return (
    <div>
      <SectionHeader title="Stories" hint="Followed" />
      <StoryRings />

      <div className="py-6">
        <p className="wdth-kicker text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{new Date().getFullYear()} CHAMPIONSHIP</p>
        <h1 className="mt-2 wdth-display text-3xl font-bold tracking-[-0.025em] sm:text-4xl">The season, at a glance.</h1>
      </div>
      <ChampionshipPodiums />
      <RaceWeekends />

      <SectionHeader title="Driver position over time" hint="Season so far" />
      <SeasonStandingsChart />

      <UpcomingRaceCalendar />
    </div>
  )
}
