'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ESPN_CUPS, cupSeasonLabel, type CupFixture } from '@footshorts/shared/espnCups'
import type { EspnDerivedFacts, EspnLineup, EspnMatchDetail, EspnSideFacts, EspnTimelineEntry } from '@footshorts/shared/espnMatch'

/**
 * The ESPN match page, rendered inside the admin. espn.com answers every match
 * page with `Content-Security-Policy: frame-ancestors` limited to ESPN/Disney
 * hosts, so an iframe is refused; instead this panel shows the same content
 * (score header, key events, team stats, lineups, commentary) from the
 * extracted ESPN match summary, with a link to the live page.
 */

const DATE = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' })
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
const DATE_TIME = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })

type Tab = 'timeline' | 'facts' | 'lineups' | 'commentary'
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'facts', label: 'Match facts' },
  { id: 'lineups', label: 'Lineups' },
  { id: 'commentary', label: 'Commentary' },
]

const BTN = 'rounded-lg px-3 py-1.5 text-sm disabled:opacity-50'
const PRIMARY = `${BTN} bg-white font-medium text-neutral-950`
const SECONDARY = `${BTN} border border-white/15 text-neutral-200 hover:bg-white/5`

interface Props {
  /** Mount with `key={eventId}` — the panel's state is per match. */
  eventId: string
  onClose: () => void
  /** Called after an extraction so the fixtures list can update its badge. */
  onExtracted: (eventId: string, detail: EspnMatchDetail) => void
}

export function CupMatchPanel({ eventId, onClose, onExtracted }: Props) {
  const [fixture, setFixture] = useState<CupFixture | null>(null)
  const [detail, setDetail] = useState<EspnMatchDetail | null>(null)
  const [tab, setTab] = useState<Tab>('timeline')
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/footshorts/cup-fixtures/${encodeURIComponent(eventId)}/detail`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'Could not load match')
        if (controller.signal.aborted) return
        setFixture(data.fixture)
        setDetail(data.detail)
        if (data.detailError) setError(data.detailError)
      })
      .catch(e => { if (!controller.signal.aborted) setError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [eventId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function extract() {
    setExtracting(true)
    setError('')
    try {
      const response = await fetch(`/api/footshorts/cup-fixtures/${encodeURIComponent(eventId)}/detail`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Extraction failed')
      setFixture(data.fixture)
      setDetail(data.detail)
      onExtracted(eventId, data.detail)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  const cup = fixture ? ESPN_CUPS.find(c => c.slug === fixture.competition_slug) : undefined
  const espnUrl = fixture?.source_url ?? `https://www.espn.com/soccer/match/_/gameId/${encodeURIComponent(eventId)}`

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="ESPN match view">
      <button type="button" aria-label="Close match view" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-3xl flex-col border-l border-white/10 bg-neutral-950 text-neutral-100 shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <div className="min-w-0 text-xs text-neutral-400">
            <span className="font-medium uppercase tracking-wider text-amber-300">ESPN match view</span>
            {fixture && <span className="ml-2">{cup?.name ?? fixture.competition_slug} · {cupSeasonLabel(fixture.season_start)}{fixture.round_label ? ` · ${fixture.round_label}` : ''}</span>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a href={espnUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-neutral-300 underline underline-offset-4">Open on ESPN ↗</a>
            <button type="button" onClick={onClose} className={SECONDARY} aria-label="Close">✕</button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-8 text-center text-sm text-neutral-400">Loading match…</p>
          ) : !fixture ? (
            <p role="alert" className="m-5 rounded-lg border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300">{error || 'Match not found.'}</p>
          ) : (
            <>
              <Scoreboard fixture={fixture} detail={detail} />

              <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-3 text-xs text-neutral-400">
                <button type="button" onClick={extract} disabled={extracting} className={detail ? SECONDARY : PRIMARY}>
                  {extracting ? 'Extracting from ESPN…' : detail ? 'Refresh from ESPN' : 'Extract match facts & timeline'}
                </button>
                {detail ? (
                  <span>Extracted {DATE_TIME.format(new Date(detail.fetched_at))} UTC · {detail.events.length} timeline events{detail.facts ? ' · team stats' : ''}{detail.lineups ? ' · lineups' : ''}</span>
                ) : (
                  <span>Not extracted yet. Extraction reads ESPN&apos;s match summary and stores it privately for this admin.</span>
                )}
                {detail && (
                  <Link href="/footshorts/share-cards" className="ml-auto underline underline-offset-4 text-neutral-300">
                    Use in Share cards →
                  </Link>
                )}
              </div>
              {error && <p role="alert" className="m-5 rounded-lg border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300">{error}</p>}

              {detail ? (
                <>
                  <nav className="flex gap-1 border-b border-white/10 px-5 pt-3" aria-label="Match sections">
                    {TABS.map(t => (
                      <button key={t.id} type="button" onClick={() => setTab(t.id)}
                        className={`rounded-t-md px-3 py-2 text-sm ${tab === t.id ? 'border border-b-0 border-white/15 bg-white/5 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
                        aria-current={tab === t.id ? 'page' : undefined}>
                        {t.label}
                      </button>
                    ))}
                  </nav>
                  <div className="px-5 py-4">
                    {tab === 'timeline' && <Timeline detail={detail} />}
                    {tab === 'facts' && <Facts detail={detail} />}
                    {tab === 'lineups' && <Lineups detail={detail} />}
                    {tab === 'commentary' && <Commentary detail={detail} />}
                  </div>
                  <p className="px-5 pb-6 text-xs text-neutral-500">
                    In Share cards, pick “{cup?.name ?? fixture.competition_slug} · {cupSeasonLabel(fixture.season_start)} · ESPN” as the competition, then this match, for the Match and Match timeline layers. Shootout results are typed into the Match layer&apos;s Penalties field.
                  </p>
                </>
              ) : (
                <div className="m-5 rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-neutral-400">
                  <p>ESPN does not allow its pages to be embedded, so the match is shown here from its data instead.</p>
                  <p className="mt-2">Extract the match to see the timeline, match facts, lineups and commentary, and to make it available to Share cards.</p>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

function Crest({ url, name }: { url: string | null; name: string }) {
  if (!url) return <div className="h-14 w-14 rounded-full bg-white/10" aria-hidden />
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={`${name} crest`} className="h-14 w-14 object-contain" />
}

function Scoreboard({ fixture, detail }: { fixture: CupFixture; detail: EspnMatchDetail | null }) {
  const home = detail?.home
  const away = detail?.away
  const homeScore = detail?.home.score ?? fixture.home_score
  const awayScore = detail?.away.score ?? fixture.away_score
  const homePens = detail?.home.shootout_score ?? fixture.home_penalties
  const awayPens = detail?.away.shootout_score ?? fixture.away_penalties
  const kickoff = detail?.kickoff_at ?? fixture.kickoff_at
  const status = detail?.status.description ?? fixture.status_detail ?? fixture.status
  const meta = [
    kickoff ? `${DATE.format(new Date(kickoff))}${fixture.kickoff_time_confirmed || detail ? ` ${TIME.format(new Date(kickoff))} UTC` : ''}` : 'Date TBC',
    detail?.venue ?? fixture.venue,
    detail?.attendance != null ? `Att. ${detail.attendance.toLocaleString('en-GB')}` : null,
    detail?.referee ? `Ref. ${detail.referee}` : null,
  ].filter(Boolean)
  return (
    <section className="border-b border-white/10 px-5 py-6">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <Crest url={home?.logo_url ?? (fixture.home_espn_id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${fixture.home_espn_id}.png` : null)} name={fixture.home_team_name} />
          <span className="text-sm font-medium">{home?.name ?? fixture.home_team_name}</span>
        </div>
        <div className="text-center">
          <div className="text-4xl font-semibold tabular-nums">{homeScore != null && awayScore != null ? `${homeScore} – ${awayScore}` : 'v'}</div>
          {homePens != null && awayPens != null && <div className="mt-1 text-xs text-neutral-400">Pens {homePens} – {awayPens}</div>}
          <div className="mt-1 text-xs uppercase tracking-wide text-neutral-400">{status}</div>
        </div>
        <div className="flex flex-col items-center gap-2 text-center">
          <Crest url={away?.logo_url ?? (fixture.away_espn_id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${fixture.away_espn_id}.png` : null)} name={fixture.away_team_name} />
          <span className="text-sm font-medium">{away?.name ?? fixture.away_team_name}</span>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-neutral-400">{meta.join(' · ')}</p>
      {fixture.notes.map((note, i) => <p key={i} className="mt-1 text-center text-xs text-neutral-500">{note}</p>)}
    </section>
  )
}

const KIND_GLYPH: Record<EspnTimelineEntry['kind'], string> = {
  goal: '⚽', 'own-goal': '⚽', 'penalty-goal': '⚽', 'penalty-missed': '✗', 'yellow-card': '🟨', 'red-card': '🟥',
  substitution: '⇄', var: 'VAR', period: '·', other: '•',
}

function minuteLabel(t: EspnTimelineEntry): string {
  if (t.clock_label) return t.clock_label
  return t.minute != null ? `${t.minute}'` : ''
}

function Timeline({ detail }: { detail: EspnMatchDetail }) {
  if (!detail.timeline.length) return <p className="text-sm text-neutral-400">ESPN has no key events for this match.</p>
  return (
    <ol className="space-y-1">
      {detail.timeline.map((t, i) => {
        if (t.kind === 'period') {
          return (
            <li key={t.espn_id ?? i} className="py-2 text-center text-[11px] uppercase tracking-wider text-neutral-500">
              {t.label}{t.text && t.text !== t.label ? ` — ${t.text}` : ''}
            </li>
          )
        }
        const right = t.side === 'away'
        const goal = t.kind === 'goal' || t.kind === 'own-goal' || t.kind === 'penalty-goal'
        const qualifier = t.kind === 'own-goal' ? ' (OG)' : t.kind === 'penalty-goal' ? ' (pen)' : t.kind === 'penalty-missed' ? ' (penalty missed)' : ''
        const secondary = t.kind === 'substitution' ? (t.secondary ? `off: ${t.secondary}` : null) : goal && t.secondary ? `assist: ${t.secondary}` : null
        return (
          <li key={t.espn_id ?? i} className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md px-2 py-1.5 ${goal ? 'bg-white/5' : ''}`}>
            <div className={right ? '' : 'text-right'}>
              {!right && <Event t={t} qualifier={qualifier} secondary={secondary} align="right" />}
            </div>
            <div className="flex flex-col items-center text-xs text-neutral-400">
              <span className="tabular-nums">{minuteLabel(t)}</span>
              <span aria-hidden className={t.kind === 'var' ? 'text-[10px]' : ''}>{KIND_GLYPH[t.kind]}</span>
            </div>
            <div>{right && <Event t={t} qualifier={qualifier} secondary={secondary} align="left" />}</div>
          </li>
        )
      })}
    </ol>
  )
}

function Event({ t, qualifier, secondary, align }: { t: EspnTimelineEntry; qualifier: string; secondary: string | null; align: 'left' | 'right' }) {
  return (
    <div className={`flex flex-col ${align === 'right' ? 'items-end text-right' : 'items-start text-left'}`} title={t.text}>
      <span className="text-sm font-medium">{t.player ?? t.label}<span className="text-neutral-500">{qualifier}</span></span>
      {secondary ? <span className="text-[11px] text-neutral-400">{secondary}</span> : null}
      {!t.player && t.text !== t.label ? <span className="text-[11px] text-neutral-400">{t.text}</span> : null}
    </div>
  )
}

const FACT_ROWS: Array<{ key: keyof Omit<EspnSideFacts, 'raw_stats'>; label: string; pct?: boolean }> = [
  { key: 'possession', label: 'Possession', pct: true },
  { key: 'shots', label: 'Shots' },
  { key: 'shots_on_target', label: 'On target' },
  { key: 'corners', label: 'Corners' },
  { key: 'fouls', label: 'Fouls' },
  { key: 'offsides', label: 'Offsides' },
  { key: 'saves', label: 'Saves' },
  { key: 'passes', label: 'Passes' },
  { key: 'pass_accuracy', label: 'Pass accuracy', pct: true },
  { key: 'yellow_cards', label: 'Yellow cards' },
  { key: 'red_cards', label: 'Red cards' },
]

const DERIVED_ROWS: Array<{ key: keyof EspnDerivedFacts; label: string }> = [
  { key: 'goals', label: 'Goals' },
  { key: 'penalties_scored', label: 'Penalties scored' },
  { key: 'penalties_missed', label: 'Penalties missed / saved' },
  { key: 'yellow_cards', label: 'Yellow cards' },
  { key: 'red_cards', label: 'Red cards' },
  { key: 'substitutions', label: 'Substitutions' },
]

function fmt(v: number | null | undefined, pct?: boolean): string {
  return v == null ? '—' : pct ? `${v}%` : String(v)
}

function FactsTable({ rows, homeName, awayName }: { rows: Array<{ label: string; home: string; away: string; homeShare?: number }>; homeName: string; awayName: string }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-neutral-500">
          <th className="w-1/3 px-3 py-1.5 text-right font-normal">{homeName}</th>
          <th className="w-1/3 px-3 py-1.5 text-center font-normal" />
          <th className="w-1/3 px-3 py-1.5 text-left font-normal">{awayName}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.label} className="border-t border-white/5">
            <td className="px-3 py-1.5 text-right tabular-nums text-neutral-200">{r.home}</td>
            <td className="px-3 py-1.5 text-center text-xs text-neutral-500">
              {r.label}
              {r.homeShare != null && (
                <div className="mx-auto mt-1 flex h-1 w-24 overflow-hidden rounded bg-white/10" aria-hidden>
                  <div className="bg-neutral-200" style={{ width: `${r.homeShare}%` }} />
                </div>
              )}
            </td>
            <td className="px-3 py-1.5 text-left tabular-nums text-neutral-200">{r.away}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Facts({ detail }: { detail: EspnMatchDetail }) {
  const { home, away } = detail
  return (
    <div className="space-y-6">
      {detail.facts ? (
        <FactsTable homeName={home.name} awayName={away.name} rows={FACT_ROWS.map(r => {
          const h = detail.facts!.home[r.key]
          const a = detail.facts!.away[r.key]
          return { label: r.label, home: fmt(h, r.pct), away: fmt(a, r.pct), homeShare: h != null && a != null && h + a > 0 ? Math.round((h / (h + a)) * 100) : undefined }
        })} />
      ) : (
        <p className="rounded-lg border border-white/10 p-4 text-sm text-neutral-400">
          ESPN publishes team statistics (possession, shots, passes…) for some competitions only; this match has none. The counts below are derived from the timeline.
        </p>
      )}
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">From the timeline</h3>
        <FactsTable homeName={home.name} awayName={away.name} rows={DERIVED_ROWS.map(r => ({ label: r.label, home: String(detail.derived.home[r.key]), away: String(detail.derived.away[r.key]) }))} />
      </div>
      {detail.facts && Object.keys(detail.facts.home.raw_stats).length > FACT_ROWS.length && (
        <details className="text-xs text-neutral-400">
          <summary className="cursor-pointer">All ESPN statistics</summary>
          <FactsTable homeName={home.name} awayName={away.name} rows={Object.keys({ ...detail.facts.home.raw_stats, ...detail.facts.away.raw_stats }).sort().map(name => ({
            label: name, home: fmt(detail.facts!.home.raw_stats[name]), away: fmt(detail.facts!.away.raw_stats[name]),
          }))} />
        </details>
      )}
    </div>
  )
}

function LineupList({ lineup, name }: { lineup: EspnLineup; name: string }) {
  const player = (p: EspnLineup['starters'][number]) => (
    <li key={`${p.jersey}-${p.name}`} className="flex items-center gap-2 py-1 text-sm">
      <span className="w-6 text-right tabular-nums text-neutral-500">{p.jersey ?? ''}</span>
      <span className={p.subbed_out ? 'text-neutral-400' : ''}>{p.name}</span>
      {p.position && p.position !== 'SUB' && <span className="text-[10px] text-neutral-500">{p.position}</span>}
      {p.subbed_out && <span className="text-[10px] text-neutral-500">off</span>}
      {p.subbed_in && <span className="text-[10px] text-emerald-400">on</span>}
    </li>
  )
  return (
    <div>
      <h3 className="text-sm font-medium">{name}{lineup.formation ? <span className="ml-2 text-xs font-normal text-neutral-400">{lineup.formation}</span> : null}</h3>
      <ul className="mt-2">{lineup.starters.map(player)}</ul>
      {lineup.bench.length > 0 && (
        <>
          <h4 className="mt-3 text-[11px] uppercase tracking-wider text-neutral-500">Bench</h4>
          <ul className="mt-1">{lineup.bench.map(player)}</ul>
        </>
      )}
    </div>
  )
}

function Lineups({ detail }: { detail: EspnMatchDetail }) {
  if (!detail.lineups) return <p className="text-sm text-neutral-400">ESPN has no lineups for this match.</p>
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <LineupList lineup={detail.lineups.home} name={detail.home.name} />
      <LineupList lineup={detail.lineups.away} name={detail.away.name} />
    </div>
  )
}

function Commentary({ detail }: { detail: EspnMatchDetail }) {
  if (!detail.commentary.length) return <p className="text-sm text-neutral-400">ESPN has no commentary for this match.</p>
  return (
    <ol className="space-y-2">
      {detail.commentary.map(c => (
        <li key={c.sequence} className="grid grid-cols-[3.5rem_1fr] gap-3 text-sm">
          <span className="tabular-nums text-neutral-500">{c.clock_label}</span>
          <span className="text-neutral-200">{c.text}</span>
        </li>
      ))}
    </ol>
  )
}
