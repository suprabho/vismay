'use client'

import { StoryRings } from '@/components/StoryRings'
import { SectionHeader } from '@/components/SectionHeader'
import {
  DriverStandingsWidget,
  ConstructorStandingsWidget,
} from '@/components/StandingsWidgets'
import { LatestRaceChart } from '@/components/LatestRaceChart'

export function ForYouFeed() {
  return (
    <div>
      <SectionHeader title="Stories" hint="Followed" />
      <StoryRings />

      <SectionHeader title="Drivers' standings" href="/feed#drivers" />
      <DriverStandingsWidget />

      <SectionHeader title="Constructors' standings" href="/feed#constructors" />
      <ConstructorStandingsWidget />

      <SectionHeader title="Position over time" hint="Most recent race" />
      <LatestRaceChart />
    </div>
  )
}
