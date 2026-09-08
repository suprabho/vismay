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
      <div className="py-6">
        <p className="text-[11px] font-semibold tracking-widest text-muted">{new Date().getFullYear()} CHAMPIONSHIP</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">The season, at a glance.</h1>
      </div>
      <ChampionshipPodiums />
      <RaceWeekends />

      <SectionHeader title="Driver position over time" hint="Season so far" />
      <SeasonStandingsChart />

      <UpcomingRaceCalendar />

      <SectionHeader title="Stories" hint="Followed" />
      <StoryRings />
    </div>
  )
}
