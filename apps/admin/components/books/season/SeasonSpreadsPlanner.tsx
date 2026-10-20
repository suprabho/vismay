'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Lock } from '@phosphor-icons/react'
import {
  bookIssues, bookSizeLabel, isEditorTab, isSeasonBookView, openBlockers, pageCount, spreadIssues, spreadRow,
  type EditorTabId, type PlanV2, type SeasonBookView,
} from '@/lib/seasonBooks/seasonSpreads'
import { SYSTEM_VERSION } from '@/lib/seasonBooks/system'
import { type PlannerLocation, PlannerTabs, type SeasonBookViewProps } from '../BookWorkspace'
import { PANEL } from '../shared'
import { SystemView } from '../SystemView'
import { BookFlatplanView } from './BookFlatplanView'
import { LegacyView } from './LegacyView'
import { RosterView } from './RosterView'
import { SeasonSystemView } from './SeasonSystemView'
import { SpreadEditorView } from './SpreadEditorView'
import { SpreadsView } from './SpreadsView'
import { clubsByLeague, useLeagueData, usePlannedSpreads } from './useBookData'

/**
 * The season-spreads planner (plan v2), in workflow order: Roster (what the
 * book carries) → Spreads (every spread, grouped by part) → Editor (one
 * spread, its render and its tabs) → Flatplan (page pairs against the KDP
 * limit), plus the locked System and, for a converted book, its Legacy spreads.
 */
export function SeasonSpreadsPlanner({ plan, seasonStart, title, edit, initial, header }: {
  plan: PlanV2
  seasonStart: number
  title: string
  edit: (fn: (plan: PlanV2) => PlanV2) => void
  initial: PlannerLocation
  header: React.ReactNode
}) {
  const [view, setView] = useState<SeasonBookView>(isSeasonBookView(initial.view) ? initial.view : 'roster')
  const [spreadKey, setSpreadKey] = useState<string | null>(initial.spread)
  const [tab, setTab] = useState<EditorTabId>(isEditorTab(initial.tab) ? initial.tab : 'story')
  const [field, setField] = useState<string | null>(null)

  const spreads = usePlannedSpreads(plan)
  const leagueData = useLeagueData(plan.scope.leagues)
  const clubs = useMemo(() => clubsByLeague(leagueData), [leagueData])

  // Keep ?view, ?spread and ?tab shareable without a navigation.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set('view', view)
    if (spreadKey && view === 'editor') { params.set('spread', spreadKey); params.set('tab', tab) }
    else { params.delete('spread'); params.delete('tab') }
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`)
  }, [view, spreadKey, tab])

  const openSpread = useCallback((key: string, tabId?: string, fieldId?: string) => {
    setSpreadKey(key)
    if (isEditorTab(tabId)) setTab(tabId)
    setField(fieldId ?? null)
    setView('editor')
  }, [])

  const current = spreads.find(s => s.key === spreadKey) ?? spreads[0] ?? null
  const issues = useMemo(() => bookIssues(plan, clubs), [plan, clubs])
  const counts = useMemo(() => {
    const rows = spreads.map(s => spreadRow(plan, s))
    return {
      approved: rows.filter(r => r.status === 'approved' || r.status === 'handed-off').length,
      blocked: rows.filter(r => openBlockers(r, seasonStart).length > 0).length,
      current: current ? spreadIssues(spreadRow(plan, current), seasonStart).length : 0,
      roster: issues.filter(i => i.view === 'roster' && i.level === 'block').length,
      pages: issues.filter(i => i.view === 'flatplan').length,
    }
  }, [spreads, plan, seasonStart, current, issues])

  const tabs: { id: SeasonBookView; label: string; meta: string; warn?: number; locked?: boolean }[] = [
    { id: 'roster', label: '1 · Roster', meta: bookSizeLabel(plan), warn: counts.roster },
    { id: 'spreads', label: '2 · Spreads', meta: `${counts.approved}/${spreads.length} approved`, warn: counts.blocked },
    { id: 'editor', label: '3 · Editor', meta: current ? current.label : 'no spread', warn: counts.current },
    { id: 'flatplan', label: '4 · Flatplan', meta: `${pageCount(plan)} pp`, warn: counts.pages },
    { id: 'system', label: 'System', meta: 'templates v1.2 / 1.0', locked: true },
  ]
  if (plan.legacy?.length) tabs.push({ id: 'legacy', label: 'Legacy', meta: `${plan.legacy.length} spreads` })

  const viewProps: SeasonBookViewProps = { plan, seasonStart, title, edit, openSpread }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-white/10 px-4 pt-4 sm:px-6">
        {header}
        <PlannerTabs tabs={tabs} view={view} onSelect={v => { setView(v); if (v !== 'editor') setField(null) }} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === 'roster' && <RosterView {...viewProps} leagueData={leagueData} issues={issues} />}
        {view === 'spreads' && <SpreadsView {...viewProps} spreads={spreads} issues={issues} />}
        {view === 'editor' && <SpreadEditorView {...viewProps} spreads={spreads} spread={current} tab={tab} setTab={t => { setTab(t); setField(null) }} field={field} />}
        {view === 'flatplan' && <BookFlatplanView {...viewProps} spreads={spreads} issues={issues} />}
        {view === 'system' && (
          <>
            <SeasonSystemView seasonStart={seasonStart} />
            <div className="mx-auto max-w-7xl px-4 pt-2 sm:px-6">
              <div className={`${PANEL} flex items-start gap-3 p-4 text-sm text-neutral-300`}>
                <Lock size={18} className="mt-0.5 shrink-0 text-amber-300" />
                <p>Below: the series system v{SYSTEM_VERSION} the three frame spreads (cover, intro, season in numbers) are still set in.</p>
              </div>
            </div>
            <SystemView />
          </>
        )}
        {view === 'legacy' && <LegacyView {...viewProps} />}
      </div>
    </div>
  )
}
