import type { Metadata } from 'next'
import { TeamPicker } from '@/components/TeamPicker'
import { getPrefs } from '@/lib/prefs'
import { TEAMS } from '@/lib/teams'

export const metadata: Metadata = { title: 'Your teams' }

export default async function TeamsPage() {
  const { followed } = await getPrefs()
  return (
    <main className="flex flex-col gap-4 px-3 pt-[18px] pb-10">
      <div>
        <h1 className="text-[32px] leading-none font-bold tracking-[-0.02em] wdth-75">Your teams</h1>
        <p className="mt-2 text-[13px] text-dim">
          Followed teams drive For you, the calendar dots and the &ldquo;My teams&rdquo; filter. Saved in this browser.
        </p>
      </div>
      <TeamPicker teams={TEAMS} initial={followed.map((t) => t.id)} />
    </main>
  )
}
