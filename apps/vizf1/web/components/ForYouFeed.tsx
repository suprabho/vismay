'use client'

import { StoryRings } from '@/components/StoryRings'
import { SectionHeader } from '@/components/SectionHeader'
import {
  DriverStandingsWidget,
  ConstructorStandingsWidget,
} from '@/components/StandingsWidgets'
import { SeasonStandingsChart } from '@/components/SeasonStandingsChart'

export function ForYouFeed() {
  return (
    <div>
      <SectionHeader title="Stories" hint="Followed" />
      <StoryRings />

      <SectionHeader title="Drivers' standings" href="/feed#drivers" />
      <DriverStandingsWidget />

      <SectionHeader title="Constructors' standings" href="/feed#constructors" />
      <ConstructorStandingsWidget />

      <SectionHeader title="Standings over time" hint="Season so far" />
      <SeasonStandingsChart />
    </div>
  )
}
