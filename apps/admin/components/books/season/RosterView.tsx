'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Database, Plus, Trash, X } from '@phosphor-icons/react'
import { seasonLabel } from '@/lib/seasonBooks/plan'
import {
  BOOK_LEAGUES, bookSizeLabel, COMPETITIONS_WITH_MATCHES, DOMESTIC_CUPS, europeanCompetitionsFor, fillLeaguePart,
  KDP_PAGE_LIMIT, LEAGUE_COUNTRY, pageCount, withScope,
  type BookIssue, type HonourablePart, type LeaguePart, type PlanV2,
} from '@/lib/seasonBooks/seasonSpreads'
import type { SeasonBookViewProps } from '../BookWorkspace'
import { BUTTON, ICON_BUTTON, INPUT, LABEL, PANEL, SELECT } from '../shared'
import { useHonourableProposals, type LeagueData } from './useBookData'

const HONOURABLE_MAX = 6

/**
 * Step 1: the roster. Set the parts: leagues in order, clubs per league
 * (include or exclude with a reason), European and domestic competitions,
 * honourable mentions (confirm proposals, add by hand). Clubs come from each
 * league's table in the match data, so no relegated or promoted club is missed.
 */
export function RosterView({ plan, seasonStart, edit, leagueData, issues }: SeasonBookViewProps & { leagueData: Map<string, LeagueData>; issues: BookIssue[] }) {
  const setScope = (patch: Partial<PlanV2['scope']>) => edit(p => withScope(p, { ...p.scope, ...patch }))
  const updateLeague = (league: string, fn: (part: LeaguePart) => LeaguePart) =>
    edit(p => ({ ...p, parts: p.parts.map(part => part.kind === 'league' && part.league === league ? fn(part) : part) }))

  // A league part with no clubs yet takes its table as soon as the matches are in.
  const filled = useRef(new Set<string>())
  useEffect(() => {
    for (const part of plan.parts) {
      if (part.kind !== 'league' || part.teams.length || part.excluded.length || filled.current.has(part.league)) continue
      const d = leagueData.get(part.league)
      if (d?.entry?.status !== 'ready' || !d.clubs.length) continue
      filled.current.add(part.league)
      updateLeague(part.league, p => fillLeaguePart(p, d.clubs))
    }
    // updateLeague is stable enough: it closes over `edit`, which the workspace memoises.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.parts, leagueData])

  const european = europeanCompetitionsFor(seasonStart)
  const countries = [...new Set(plan.scope.leagues.map(l => LEAGUE_COUNTRY[l]).filter(Boolean))]
  const available = BOOK_LEAGUES.filter(l => !plan.scope.leagues.includes(l))
  const pages = pageCount(plan)
  const rosterIssues = issues.filter(i => i.view === 'roster')

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Roster</h2>
          <p className="mt-1 max-w-3xl text-sm text-neutral-400">
            What the {seasonLabel(seasonStart)} book carries, and in what order: each league and its clubs (by final position unless you reorder them),
            the European and domestic competitions, and the honourable mentions. Every club in an in-scope league is in the book or left out with a reason.
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums text-white">{bookSizeLabel(plan)}</div>
          <div className={`text-xs tabular-nums ${pages > KDP_PAGE_LIMIT ? 'text-red-300' : 'text-neutral-500'}`}>KDP limit {KDP_PAGE_LIMIT} pp · {Math.max(0, KDP_PAGE_LIMIT - pages)} spare</div>
        </div>
      </div>

      {rosterIssues.length > 0 && (
        <ul className="space-y-1 text-sm text-amber-300">
          {rosterIssues.map((i, n) => <li key={n}>{i.message}</li>)}
        </ul>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-neutral-100">Leagues <span className="text-sm font-normal text-neutral-500">· one league spread, then one team spread per club</span></h3>
          {available.length > 0 && (
            <select className={SELECT} value="" aria-label="Add a league" onChange={e => { if (e.target.value) setScope({ leagues: [...plan.scope.leagues, e.target.value] }) }}>
              <option value="">Add a league…</option>
              {available.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
        </div>
        {!plan.scope.leagues.length && <p className="text-sm text-neutral-500">No league yet. Add the Premier League first.</p>}
        <div className="grid gap-4 xl:grid-cols-2">
          {plan.parts.filter((p): p is LeaguePart => p.kind === 'league').map((part, i, parts) => (
            <LeagueCard key={part.league} part={part} data={leagueData.get(part.league)} index={i} count={parts.length}
              onMove={dir => { const ls = [...plan.scope.leagues]; const j = i + dir; if (j < 0 || j >= ls.length) return; [ls[i], ls[j]] = [ls[j], ls[i]]; setScope({ leagues: ls }) }}
              onRemove={() => { if (window.confirm(`Take ${part.league} and its ${part.teams.length} club spreads out of the book?`)) setScope({ leagues: plan.scope.leagues.filter(l => l !== part.league) }) }}
              onChange={fn => updateLeague(part.league, fn)} />
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className={`${PANEL} space-y-3 p-4`}>
          <h3 className="text-base font-semibold text-neutral-100">European competitions <span className="text-sm font-normal text-neutral-500">· one competition spread each</span></h3>
          <div className="flex flex-wrap gap-2">
            {european.map(c => (
              <Chip key={c} label={c} on={plan.scope.european.includes(c)} hasData={COMPETITIONS_WITH_MATCHES.has(c)}
                onToggle={() => setScope({ european: plan.scope.european.includes(c) ? plan.scope.european.filter(x => x !== c) : [...plan.scope.european, c] })} />
            ))}
          </div>
          <p className="text-xs text-neutral-500">A competition with no in-scope club is offered but off. Only the Champions League has match data in the admin so far.</p>
        </div>
        <div className={`${PANEL} space-y-3 p-4`}>
          <h3 className="text-base font-semibold text-neutral-100">Domestic competitions <span className="text-sm font-normal text-neutral-500">· grouped by country in league order</span></h3>
          {!countries.length && <p className="text-sm text-neutral-500">Add a league first.</p>}
          {countries.map(country => (
            <div key={country} className="flex flex-wrap items-center gap-2">
              <span className="w-24 text-xs font-medium uppercase tracking-wider text-neutral-500">{country}</span>
              {(DOMESTIC_CUPS[country] ?? []).map(c => (
                <Chip key={c} label={c} on={plan.scope.domestic.includes(c)} hasData={COMPETITIONS_WITH_MATCHES.has(c)}
                  onToggle={() => setScope({ domestic: plan.scope.domestic.includes(c) ? plan.scope.domestic.filter(x => x !== c) : [...plan.scope.domestic, c] })} />
              ))}
            </div>
          ))}
          <p className="text-xs text-neutral-500">Cup ties come from <code>cup_matches.csv</code> (football-seasons, layer 6); the admin has no cup match data yet, so the cup variant stays a design pass away.</p>
        </div>
      </section>

      <HonourableSection plan={plan} edit={edit} />
    </div>
  )
}

function Chip({ label, on, hasData, onToggle }: { label: string; on: boolean; hasData: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} title={hasData ? 'Match data in the admin' : 'No match data in the admin yet'}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm ${on ? 'border-white bg-white text-neutral-950' : 'border-white/15 text-neutral-400 hover:border-white/30 hover:text-neutral-200'}`}>
      {on ? <Check size={12} weight="bold" /> : <Plus size={12} />}
      {label}
      {hasData && <Database size={12} className={on ? 'text-neutral-600' : 'text-neutral-600'} />}
    </button>
  )
}

function LeagueCard({ part, data, index, count, onMove, onRemove, onChange }: {
  part: LeaguePart
  data: LeagueData | undefined
  index: number
  count: number
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  onChange: (fn: (part: LeaguePart) => LeaguePart) => void
}) {
  const entry = data?.entry
  const clubs = data?.clubs ?? []
  const position = new Map(clubs.map((c, i) => [c, i + 1]))
  const excluded = new Map(part.excluded.map(e => [e.teamId, e.reason]))
  // Clubs the table knows plus any the part names that the table doesn't (a renamed source label stays visible).
  const all = [...clubs, ...part.teams.filter(t => !clubs.includes(t)), ...part.excluded.map(e => e.teamId).filter(t => !clubs.includes(t))]
  const ordered = part.order === 'manual' ? [...part.teams, ...all.filter(c => !part.teams.includes(c))] : all

  const include = (team: string) => onChange(p => {
    const teams = p.order === 'manual' ? [...p.teams, team] : [...p.teams, team].sort((a, b) => (position.get(a) ?? 99) - (position.get(b) ?? 99))
    return { ...p, teams, excluded: p.excluded.filter(e => e.teamId !== team) }
  })
  const exclude = (team: string) => onChange(p => ({ ...p, teams: p.teams.filter(t => t !== team), excluded: [...p.excluded.filter(e => e.teamId !== team), { teamId: team, reason: '' }] }))
  const reason = (team: string, r: string) => onChange(p => ({ ...p, excluded: p.excluded.map(e => e.teamId === team ? { ...e, reason: r } : e) }))
  const move = (team: string, dir: -1 | 1) => onChange(p => {
    const teams = [...p.teams]
    const i = teams.indexOf(team)
    const j = i + dir
    if (i < 0 || j < 0 || j >= teams.length) return p
    ;[teams[i], teams[j]] = [teams[j], teams[i]]
    return { ...p, order: 'manual', teams }
  })

  return (
    <div className={`${PANEL} p-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-white">{index + 1} · {part.league}</span>
        <span className="text-xs text-neutral-500">{LEAGUE_COUNTRY[part.league]} · {part.teams.length} club{part.teams.length === 1 ? '' : 's'}{part.excluded.length ? `, ${part.excluded.length} left out` : ''}</span>
        <div className="ml-auto flex items-center gap-1">
          <select className={`${SELECT} py-1 text-xs`} value={part.order} aria-label="Club order"
            onChange={e => onChange(p => e.target.value === 'final-position' ? fillLeaguePart({ ...p, order: 'final-position' }, clubs) : { ...p, order: 'manual' })}>
            <option value="final-position">By final position</option>
            <option value="manual">Manual order</option>
          </select>
          <button type="button" className={ICON_BUTTON} title="Earlier in the book" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={14} /></button>
          <button type="button" className={ICON_BUTTON} title="Later in the book" disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown size={14} /></button>
          <button type="button" className={ICON_BUTTON} title="Remove league" onClick={onRemove}><Trash size={14} /></button>
        </div>
      </div>
      {(!entry || entry.status === 'loading') && <p className="mt-3 text-sm text-neutral-500">Reading the {part.league} table…</p>}
      {entry?.status === 'error' && <p className="mt-3 text-sm text-amber-300">{entry.error}</p>}
      {entry?.status === 'ready' && !clubs.length && <p className="mt-3 text-sm text-neutral-500">No {part.league} matches stored for this season (run <code>history:import</code>).</p>}
      {ordered.length > 0 && (
        <ul className="mt-3 grid gap-1 sm:grid-cols-2">
          {ordered.map(team => {
            const out = excluded.has(team)
            const i = part.teams.indexOf(team)
            return (
              <li key={team} className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm ${out ? 'bg-neutral-950/60 text-neutral-500' : 'text-neutral-200'}`}>
                <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-neutral-500">{position.get(team) ?? '–'}</span>
                <button type="button" onClick={() => out ? include(team) : exclude(team)} title={out ? 'Put back in the book' : 'Leave out of the book (needs a reason)'}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${out ? 'border-white/15' : 'border-white bg-white text-neutral-950'}`}>
                  {!out && <Check size={12} weight="bold" />}
                </button>
                <span className={`min-w-0 flex-1 truncate ${out ? 'line-through' : ''}`}>{team}</span>
                {out
                  ? <input className={`${INPUT} w-40 py-0.5 text-xs ${!excluded.get(team)?.trim() ? 'border-amber-400/50' : ''}`} maxLength={200} placeholder="Reason" value={excluded.get(team) ?? ''} onChange={e => reason(team, e.target.value)} />
                  : part.order === 'manual' && (
                    <span className="flex">
                      <button type="button" className={ICON_BUTTON} title="Earlier" disabled={i <= 0} onClick={() => move(team, -1)}><ArrowUp size={12} /></button>
                      <button type="button" className={ICON_BUTTON} title="Later" disabled={i >= part.teams.length - 1} onClick={() => move(team, 1)}><ArrowDown size={12} /></button>
                    </span>
                  )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function HonourableSection({ plan, edit }: { plan: PlanV2; edit: SeasonBookViewProps['edit'] }) {
  const part = plan.parts.find((p): p is HonourablePart => p.kind === 'honourable')
  const teams = part?.teams ?? []
  const proposals = useHonourableProposals(plan).filter(p => !teams.some(t => t.teamId === p.teamId))
  const [draft, setDraft] = useState({ teamId: '', league: '', reason: '' })
  const otherLeagues = BOOK_LEAGUES.filter(l => !plan.scope.leagues.includes(l))
  const update = (fn: (part: HonourablePart) => HonourablePart) => edit(p => ({ ...p, parts: p.parts.map(x => x.kind === 'honourable' ? fn(x) : x) }))
  const add = (teamId: string, league: string, reason: string) => {
    if (!teamId.trim() || teams.length >= HONOURABLE_MAX) return
    update(p => ({ ...p, teams: [...p.teams, { teamId: teamId.trim(), league, reason }] }))
  }

  return (
    <section className={`${PANEL} space-y-4 p-4`}>
      <div>
        <h3 className="text-base font-semibold text-neutral-100">Honourable mentions <span className="text-sm font-normal text-neutral-500">· team spreads for clubs outside the covered leagues, {teams.length}/{HONOURABLE_MAX}</span></h3>
        <p className="mt-1 text-xs text-neutral-500">
          Proposed: every club outside the in-scope leagues that won a European competition, reached a European final or reached a Champions League semi-final.
          Each needs your reason before it enters the book. The club’s own league data comes from <code>matches.csv</code>, so the team template works unchanged.
        </p>
      </div>
      {proposals.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {proposals.map(p => (
            <li key={p.teamId} className="flex items-center gap-2 rounded-lg border border-white/10 bg-neutral-950/60 px-2.5 py-1.5 text-sm">
              <span className="text-neutral-200">{p.teamId}</span>
              <span className="text-xs text-neutral-500">{p.reason}</span>
              <button type="button" className={`${BUTTON} py-0.5 text-xs`} disabled={teams.length >= HONOURABLE_MAX} onClick={() => add(p.teamId, '', p.reason)}><Plus size={12} /> Confirm</button>
            </li>
          ))}
        </ul>
      )}
      {teams.length > 0 && (
        <ul className="space-y-2">
          {teams.map(t => (
            <li key={t.teamId} className="grid gap-2 rounded-lg border border-white/10 bg-neutral-950/60 p-2.5 sm:grid-cols-[12rem_12rem_minmax(0,1fr)_auto]">
              <span className="truncate text-sm text-neutral-100" title={t.teamId}>{t.teamId}</span>
              <select className={`${SELECT} py-1 text-xs`} value={t.league} aria-label="Own league" onChange={e => update(p => ({ ...p, teams: p.teams.map(x => x.teamId === t.teamId ? { ...x, league: e.target.value } : x) }))}>
                <option value="">Own league…</option>
                {otherLeagues.map(l => <option key={l} value={l}>{l}</option>)}
                {t.league && !otherLeagues.includes(t.league as typeof otherLeagues[number]) && <option value={t.league}>{t.league}</option>}
              </select>
              <input className={`${INPUT} py-1 text-xs ${!t.reason.trim() ? 'border-amber-400/50' : ''}`} maxLength={200} placeholder="Why this club is in the book" value={t.reason}
                onChange={e => update(p => ({ ...p, teams: p.teams.map(x => x.teamId === t.teamId ? { ...x, reason: e.target.value } : x) }))} />
              <button type="button" className={ICON_BUTTON} title="Remove" onClick={() => update(p => ({ ...p, teams: p.teams.filter(x => x.teamId !== t.teamId) }))}><X size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-[12rem_12rem_minmax(0,1fr)_auto]">
        <div>
          <label className={LABEL} htmlFor="hon-team">Add by hand</label>
          <input id="hon-team" className={`${INPUT} py-1 text-xs`} maxLength={80} placeholder="Club, as the match data spells it" value={draft.teamId} onChange={e => setDraft({ ...draft, teamId: e.target.value })} />
        </div>
        <div>
          <label className={LABEL}>Own league</label>
          <select className={`${SELECT} w-full py-1 text-xs`} value={draft.league} onChange={e => setDraft({ ...draft, league: e.target.value })}>
            <option value="">Own league…</option>
            {otherLeagues.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL}>Reason</label>
          <input className={`${INPUT} py-1 text-xs`} maxLength={200} placeholder="e.g. won the Champions League" value={draft.reason} onChange={e => setDraft({ ...draft, reason: e.target.value })} />
        </div>
        <button type="button" className={`${BUTTON} self-end`} disabled={!draft.teamId.trim() || teams.length >= HONOURABLE_MAX} onClick={() => { add(draft.teamId, draft.league, draft.reason); setDraft({ teamId: '', league: '', reason: '' }) }}>
          <Plus size={14} /> Add
        </button>
      </div>
    </section>
  )
}
