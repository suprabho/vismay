'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BEAT_TARGET, beatIssues, cardIssues, isBookView, pacingIssues, type BookView, type Plan } from '@/lib/seasonBooks/plan'
import { SYSTEM_VERSION } from '@/lib/seasonBooks/system'
import { BeatsView } from './BeatsView'
import { type BookViewProps, type PlannerLocation, PlannerTabs } from './BookWorkspace'
import { CardsView } from './CardsView'
import { ChaptersView } from './ChaptersView'
import { FlatplanView } from './FlatplanView'
import { SystemView } from './SystemView'

/**
 * The claim-spreads planner (plan v1): Beats → Flatplan → Cards → Chapters,
 * and the locked system. One claim per spread, any template; a v1 book keeps
 * opening here until it is converted.
 */
export function ClaimSpreadsPlanner({ plan, seasonStart, title, edit, initial, header }: {
  plan: Plan
  seasonStart: number
  title: string
  edit: (fn: (plan: Plan) => Plan) => void
  initial: PlannerLocation
  header: React.ReactNode
}) {
  const [view, setView] = useState<BookView>(isBookView(initial.view) ? initial.view : 'beats')
  const [spreadId, setSpreadId] = useState<string | null>(initial.spread)

  // Keep ?view & ?spread shareable without a navigation.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set('view', view)
    if (spreadId && view === 'cards') params.set('spread', spreadId)
    else params.delete('spread')
    params.delete('tab')
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`)
  }, [view, spreadId])

  const openSpread = useCallback((id: string) => { setSpreadId(id); setView('cards') }, [])

  const counts = useMemo(() => ({
    beats: plan.beats.filter(b => b.text.trim()).length,
    spreads: plan.spreads.length,
    carded: plan.spreads.filter(s => s.status !== 'beat').length,
    pacingWarnings: pacingIssues(seasonStart, plan.spreads).filter(i => i.severity === 'warn').length,
    beatWarnings: beatIssues(plan).filter(i => i.severity === 'warn').length,
    cardWarnings: plan.spreads.filter(s => cardIssues(s).some(i => i.severity === 'warn')).length,
  }), [plan, seasonStart])

  const tabs: { id: BookView; label: string; meta: string; warn?: number; locked?: boolean }[] = [
    { id: 'beats', label: '1 · Beats', meta: `${counts.beats}/${BEAT_TARGET.min}–${BEAT_TARGET.max}`, warn: counts.beatWarnings },
    { id: 'flatplan', label: '2 · Flatplan', meta: `${counts.spreads} spreads`, warn: counts.pacingWarnings },
    { id: 'cards', label: '3 · Cards', meta: `${counts.carded}/${counts.spreads}`, warn: counts.cardWarnings },
    { id: 'chapters', label: '4 · Chapters', meta: 'thumbnails' },
    { id: 'system', label: 'System', meta: `v${SYSTEM_VERSION}`, locked: true },
  ]
  const viewProps: BookViewProps = { plan, seasonStart, title, edit, openSpread }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-white/10 px-4 pt-4 sm:px-6">
        {header}
        <PlannerTabs tabs={tabs} view={view} onSelect={setView} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === 'beats' && <BeatsView {...viewProps} />}
        {view === 'flatplan' && <FlatplanView {...viewProps} />}
        {view === 'cards' && <CardsView {...viewProps} spreadId={spreadId} setSpreadId={setSpreadId} />}
        {view === 'chapters' && <ChaptersView {...viewProps} />}
        {view === 'system' && <SystemView />}
      </div>
    </div>
  )
}
