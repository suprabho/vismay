'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ESPN_CUPS, currentCupSeason, cupSeasonLabel } from '@footshorts/shared/espnCups'
import type { EspnMatchDetail } from '@footshorts/shared/espnMatch'
import type { CupFixtureListRow } from '@/lib/espnCups'
import { CupMatchPanel } from './CupMatchPanel'

const API = '/api/footshorts/cup-fixtures'
const SELECT = 'rounded-lg border border-white/15 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 disabled:opacity-50'
const DATE = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' })
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })

export function CupFixturesClient() {
  const latest = currentCupSeason()
  const [season, setSeason] = useState(latest)
  const [competition, setCompetition] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<CupFixtureListRow[]>([])
  const [openEventId, setOpenEventId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState('')
  const [reports, setReports] = useState<{ name: string; message: string; failed: boolean }[]>([])
  const [revision, setRevision] = useState(0)
  const [visible, setVisible] = useState(100)

  function resetList() {
    setLoading(true)
    setError('')
    setRows([])
    setVisible(100)
  }

  function reloadList() {
    resetList()
    setRevision(n => n + 1)
  }

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ season: String(season) })
    if (competition) params.set('competition', competition)
    fetch(`${API}?${params}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'Could not load matches')
        if (!controller.signal.aborted) setRows(data.rows)
      })
      .catch(e => { if (!controller.signal.aborted) setError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [competition, season, revision])

  const filtered = useMemo(() => rows.filter(row =>
    (!status || row.status === status) &&
    (!search || `${row.home_team_name} ${row.away_team_name}`.toLowerCase().includes(search.toLowerCase())),
  ), [rows, status, search])
  const fetchedAt = rows.reduce((latest, row) => row.fetched_at > latest ? row.fetched_at : latest, '')
  const closePanel = useCallback(() => setOpenEventId(null), [])
  const markExtracted = useCallback((eventId: string, detail: EspnMatchDetail) => {
    setRows(previous => previous.map(row => row.espn_event_id === eventId
      ? { ...row, detail_fetched_at: detail.fetched_at, detail_event_count: detail.events.length }
      : row))
  }, [])

  async function runImport() {
    setImporting(true)
    setReports([])
    const cups = ESPN_CUPS.filter(c => !competition || c.slug === competition)
    try {
      for (const cup of cups) {
        setProgress(`Fetching ${cup.name}…`)
        try {
          const response = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ competition: cup.slug, season }),
          })
          const result = await response.json()
          if (!response.ok) throw new Error(result.error ?? 'Import failed')
          setReports(previous => [...previous, {
            name: cup.name, failed: false,
            message: result.imported
              ? `${result.imported} matches saved · ${result.finished} finished · ${result.scheduled} scheduled`
              : 'ESPN returned no matches for this season. Existing records were kept.',
          }])
        } catch (e) {
          setReports(previous => [...previous, { name: cup.name, failed: true, message: e instanceof Error ? e.message : 'Import failed' }])
        }
      }
    } finally {
      setImporting(false)
      setProgress('')
      reloadList()
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl flex-1 min-h-0 space-y-6 overflow-y-auto px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-amber-300">Private admin data · ESPN</div>
          <h1 className="text-2xl font-semibold text-white">Cup fixtures</h1>
          <p className="mt-2 text-sm text-neutral-400">Domestic cup schedules and scores for internal review. These matches are stored separately and are not published in the app. Open a match to view it as ESPN reports it and extract its timeline and match facts for Share cards.</p>
        </div>
        <button type="button" onClick={runImport} disabled={importing || loading || !!error}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950 disabled:opacity-50">
          {importing ? 'Importing…' : competition ? 'Fetch selected cup' : 'Fetch all six cups'}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-neutral-400">Competition
          <select className={SELECT} value={competition} disabled={importing} onChange={e => { resetList(); setCompetition(e.target.value); setReports([]) }}>
            <option value="">All cups</option>
            {ESPN_CUPS.map(cup => <option key={cup.slug} value={cup.slug}>{cup.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-400">Season
          <select className={SELECT} value={season} disabled={importing} onChange={e => { resetList(); setSeason(Number(e.target.value)); setReports([]) }}>
            {Array.from({ length: 5 }, (_, i) => latest - i).map(year => <option key={year} value={year}>{cupSeasonLabel(year)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-400">Status
          <select className={SELECT} value={status} onChange={e => { setVisible(100); setStatus(e.target.value) }}>
            <option value="">All statuses</option>
            {['scheduled', 'live', 'finished', 'postponed', 'cancelled', 'suspended', 'unknown'].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-400">Team
          <input className={SELECT} type="search" value={search} onChange={e => { setVisible(100); setSearch(e.target.value) }} placeholder="Search teams" />
        </label>
        <button type="button" className="px-3 py-2 text-sm text-neutral-300 disabled:opacity-50" disabled={loading || importing} onClick={reloadList}>Reload stored data</button>
      </div>

      <div aria-live="polite" className="space-y-2 text-sm">
        {progress && <p className="text-neutral-300">{progress}</p>}
        {reports.map(report => <p key={report.name} className={report.failed ? 'text-red-300' : 'text-neutral-300'}><strong>{report.name}:</strong> {report.message}</p>)}
        {error && <p role="alert" className="rounded-lg border border-red-400/20 bg-red-400/5 p-4 text-red-300">{error}</p>}
      </div>

      <div className="flex flex-wrap justify-between gap-2 text-xs text-neutral-500">
        <span>{filtered.length} stored matches · Kickoffs in UTC</span>
        {fetchedAt && <span>Last fetched {DATE.format(new Date(fetchedAt))} at {TIME.format(new Date(fetchedAt))} UTC</span>}
      </div>
      {loading ? <p className="py-12 text-center text-sm text-neutral-400">Loading stored fixtures…</p> : !error && !filtered.length ? (
        <div className="rounded-xl border border-white/10 p-10 text-center text-sm text-neutral-400">
          {rows.length ? 'No matches match these filters.' : 'No stored matches for this selection. Fetch the cup data or select a previous season.'}
        </div>
      ) : !error && (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-xs text-neutral-400"><tr>
              {['Kickoff (UTC)', 'Match', 'Round', 'Score', 'Status', 'ESPN detail'].map(label => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-white/10">
              {filtered.slice(0, visible).map(row => <tr key={row.espn_event_id}>
                <td className="whitespace-nowrap px-4 py-4 text-neutral-300">
                  {row.kickoff_at ? <>{DATE.format(new Date(row.kickoff_at))}<div className="mt-1 text-xs text-neutral-500">{row.kickoff_time_confirmed ? TIME.format(new Date(row.kickoff_at)) : 'Time TBC'}</div></> : 'Date TBC'}
                </td>
                <td className="min-w-60 px-4 py-4">
                  <button type="button" onClick={() => setOpenEventId(row.espn_event_id)} className="text-left text-neutral-100 underline-offset-4 hover:underline">
                    {row.home_team_name} <span className="text-neutral-500">vs</span> {row.away_team_name}
                  </button>
                  <div className="mt-1 text-xs text-neutral-500">{ESPN_CUPS.find(c => c.slug === row.competition_slug)?.name}{row.venue ? ` · ${row.venue}` : ''}</div>
                  {row.notes.map((note, i) => <div key={i} className="mt-1 text-xs text-neutral-400">{note}</div>)}
                </td>
                <td className="px-4 py-4 capitalize text-neutral-400">{row.round_label ?? 'TBC'}</td>
                <td className="whitespace-nowrap px-4 py-4 font-medium tabular-nums text-white">
                  {row.home_score != null && row.away_score != null ? `${row.home_score} – ${row.away_score}` : '—'}
                  {row.home_penalties != null && row.away_penalties != null && <div className="mt-1 text-xs font-normal text-neutral-400">Pens {row.home_penalties} – {row.away_penalties}</div>}
                </td>
                <td className="px-4 py-4 text-xs text-neutral-300">{row.status_detail ?? row.status}</td>
                <td className="whitespace-nowrap px-4 py-4 text-xs">
                  <button type="button" onClick={() => setOpenEventId(row.espn_event_id)} className="rounded-md border border-white/15 px-2.5 py-1 text-neutral-200 hover:bg-white/5">
                    {row.detail_fetched_at ? 'View' : 'View & extract'}
                  </button>
                  {row.detail_fetched_at && <div className="mt-1 text-neutral-500">{row.detail_event_count ?? 0} events extracted</div>}
                </td>
              </tr>)}
            </tbody>
          </table>
          {filtered.length > visible && <button type="button" onClick={() => setVisible(n => n + 100)} className="w-full border-t border-white/10 py-3 text-sm text-neutral-300">Show more matches ({filtered.length - visible} remaining)</button>}
        </div>
      )}
      <p className="text-xs text-neutral-500">Imports run only when requested. ESPN may omit early rounds or fixtures awaiting a draw; an empty response does not confirm full coverage.</p>
      {openEventId && <CupMatchPanel key={openEventId} eventId={openEventId} onClose={closePanel} onExtracted={markExtracted} />}
    </div>
  )
}
