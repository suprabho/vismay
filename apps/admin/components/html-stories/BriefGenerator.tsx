'use client'

import { useEffect, useMemo, useState } from 'react'
import { Basketball, Check, Compass, Copy, FlagCheckered, Shuffle, SoccerBall, X } from '@phosphor-icons/react'
import type { HtmlStoryApp } from '@vismay/html-stories/apps'
import { MAX_CONTEXT_MATCHES } from '@vismay/html-stories/footshortsBrief'
import type { AuthorableHtmlStoryFormat } from '@vismay/html-stories/formats'
import {
  entityStoryStyle,
  pickRandomStyle,
  type EntityStyleOption,
  type StoryStyle,
  type StylePool,
} from '@vismay/html-stories/styles'
import type { HtmlStoryTone } from '@vismay/html-stories/tone'
import { MatchPicker } from '@/components/canvas/compose/MatchPicker'
import type { MatchCompetition, MatchOption, MatchTeam } from '@/components/canvas/compose/useComposeFlow'
import { FormatPicker } from './FormatPicker'
import { ToneToggle } from './ToneToggle'
import { GameContextPicker, type GameContextPick } from './GameContextPicker'
import { RaceContextPicker, type RaceContextPick } from './RaceContextPicker'
import { StoryStylePicker } from './StoryStylePicker'
import { TripContextPicker, type TripContextPick } from './TripContextPicker'

const SWATCHES = ['background', 'surface', 'text', 'muted', 'accent', 'accent2', 'teal'] as const

/** The matches a footshorts brief is about, as the picker returns them. */
interface MatchContextPick {
  fixtureIds: string[]
  prompt?: string
}

/**
 * "Copy agent brief" plus a story format picker (a scrolling page, or a book,
 * a pinned board or a deck on the site's hosted runtime) and a style
 * randomizer: Shuffle swaps the brief's house style for a palette and font
 * trio drawn from the app's stories' themes. The Humorous toggle asks for a
 * wry, sarcastic voice (@vismay/html-stories/tone) under the same accuracy
 * rules.
 *
 * For footshorts, Story style (./StoryStylePicker) swaps in a competition's
 * or team's own palette and fonts, set in the Asset Studio.
 *
 * For footshorts there is also a match picker — by competition, or by team
 * across every competition (where Last 5 results / Next 3 tick a club's
 * fixtures in one go): tick up to MAX_CONTEXT_MATCHES (and
 * write the editorial angle) and the brief gains their match context — Opta
 * facts and full stat set, timeline, insights, commentary, build-up, both
 * sides' form and schedule, the table, and the competition's next fixtures.
 * Picking a match reuses the compose Sources-stage picker, badges and
 * on-demand scrape included. The domestic cups imported in the Cup fixtures
 * tab (ESPN) are listed too, as "<Cup> (ESPN)" seasons and among a club's
 * matches; their context is the ESPN match detail (lib/espnCupContext).
 *
 * For vizf1 there is a race picker instead (./RaceContextPicker): tick any
 * ingested sessions across races and seasons and the drivers to follow, and
 * the brief gains their race context — results, lap timing, sectors, speed
 * traps, strategy, the head-to-head across the sessions and the standings
 * round by round (@vismay/f1-viz/race-context).
 *
 * For viznba there is a game picker (./GameContextPicker): tick games off
 * ESPN's schedule and the brief gains their box scores (./viznbaBrief).
 *
 * For travel there is a trip picker (./TripContextPicker): a trip, one day
 * of it or all of it, and notes on how it really went; the brief gains the
 * itinerary and the curated photos' URLs (./travelBrief).
 *
 * The brief itself is built server-side (POST /api/html-stories/brief) so the
 * match context can be read with the service client; it is fetched whenever
 * the style or the matches change and copied synchronously on click, so the
 * clipboard write stays inside the user gesture.
 */
export function BriefGenerator({
  app,
  pool,
  entityStyles = [],
}: {
  app: HtmlStoryApp
  pool: StylePool | null
  entityStyles?: EntityStyleOption[]
}) {
  const [style, setStyle] = useState<StoryStyle | null>(null)
  const [format, setFormat] = useState<AuthorableHtmlStoryFormat>('scroll')
  const [tone, setTone] = useState<HtmlStoryTone>('straight')
  const [matches, setMatches] = useState<MatchContextPick | null>(null)
  const [picking, setPicking] = useState(false)
  const [race, setRace] = useState<RaceContextPick | null>(null)
  const [pickingRace, setPickingRace] = useState(false)
  const [games, setGames] = useState<GameContextPick | null>(null)
  const [pickingGames, setPickingGames] = useState(false)
  const [trip, setTrip] = useState<TripContextPick | null>(null)
  const [pickingTrip, setPickingTrip] = useState(false)
  // The last brief the server built, tagged with the request it answers; the
  // button is "building" whenever the current request has no answer yet.
  const [built, setBuilt] = useState<{ request: string; brief: string | null; error: string | null } | null>(null)
  const [copied, setCopied] = useState(false)
  const canShuffle = !!pool?.palettes.length && !!pool.fonts.length
  const isFootshorts = app === 'footshorts'
  const isVizf1 = app === 'vizf1'
  const isViznba = app === 'viznba'
  const isTravel = app === 'travel'
  // A competition's or team's Asset Studio style, rather than a random draw.
  const isEntityStyle = style?.paletteFrom.kind === 'competition' || style?.paletteFrom.kind === 'team'

  const request = useMemo(
    () =>
      JSON.stringify(
        isVizf1
          ? { app, format, tone, style, sessionKeys: race?.sessionKeys ?? [], drivers: race?.drivers ?? [], prompt: race?.prompt }
          : isViznba
            ? { app, format, tone, style, gameIds: games?.gameIds ?? [], prompt: games?.prompt }
            : isTravel
              ? { app, format, tone, style, tripSlug: trip?.tripSlug, day: trip?.day ?? undefined, prompt: trip?.prompt }
              : { app, format, tone, style, fixtureIds: matches?.fixtureIds ?? [], prompt: matches?.prompt },
      ),
    [app, isVizf1, isViznba, isTravel, format, tone, style, matches, race, games, trip],
  )
  const building = built?.request !== request
  const brief = building ? null : built?.brief ?? null
  const error = building ? null : built?.error ?? null

  useEffect(() => {
    let cancelled = false
    fetch('/api/html-stories/brief', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: request,
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
        }
        return res.text()
      })
      .then((text) => {
        if (!cancelled) setBuilt({ request, brief: text, error: null })
      })
      .catch((e) => {
        if (!cancelled) setBuilt({ request, brief: null, error: e instanceof Error ? e.message : 'brief failed' })
      })
    return () => {
      cancelled = true
    }
  }, [request])

  // The compose picker's loaders, against the shared footshorts data routes.
  async function loadCompetitions(): Promise<MatchCompetition[]> {
    try {
      const res = await fetch('/api/footshorts/data/competitions?include=espn', { cache: 'no-store' })
      if (!res.ok) return []
      return ((await res.json()) as { competitions?: MatchCompetition[] }).competitions ?? []
    } catch {
      return []
    }
  }
  async function loadMatches(competition: string, season: string): Promise<MatchOption[]> {
    try {
      const qs = `competition=${encodeURIComponent(competition)}&season=${encodeURIComponent(season)}`
      const res = await fetch(`/api/footshorts/data/matches?${qs}`, { cache: 'no-store' })
      if (!res.ok) return []
      return ((await res.json()) as { rows?: MatchOption[] }).rows ?? []
    } catch {
      return []
    }
  }
  async function searchTeams(q: string): Promise<MatchTeam[]> {
    try {
      const qs = `q=${encodeURIComponent(q)}&type=team&crest=any&limit=12`
      const res = await fetch(`/api/footshorts/data/entities?${qs}`, { cache: 'no-store' })
      if (!res.ok) return []
      const data = (await res.json()) as { items?: Array<{ slug: string; name: string; crest_url: string | null }> }
      return (data.items ?? []).map((t) => ({ slug: t.slug, name: t.name, crestUrl: t.crest_url }))
    } catch {
      return []
    }
  }
  async function loadTeamMatches(teamSlug: string): Promise<MatchOption[]> {
    try {
      const res = await fetch(`/api/footshorts/data/matches?team=${encodeURIComponent(teamSlug)}&include=espn`, { cache: 'no-store' })
      if (!res.ok) return []
      return ((await res.json()) as { rows?: MatchOption[] }).rows ?? []
    } catch {
      return []
    }
  }
  async function scrape(fixtureId: string, competition: string): Promise<'dispatched' | 'extracted' | 'unconfigured' | 'failed'> {
    // An ESPN cup match (numeric event id): extract its match detail now, as the Cup fixtures tab does.
    if (/^\d+$/.test(fixtureId)) {
      try {
        const res = await fetch(`/api/footshorts/cup-fixtures/${fixtureId}/detail`, { method: 'POST' })
        return res.ok ? 'extracted' : 'failed'
      } catch {
        return 'failed'
      }
    }
    try {
      const res = await fetch('/api/footshorts/data/matches/scrape', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fixtureId, competition }),
      })
      if (!res.ok) return 'failed'
      return ((await res.json()) as { mode?: 'dispatched' | 'unconfigured' }).mode ?? 'failed'
    } catch {
      return 'failed'
    }
  }

  const btn =
    'text-sm text-neutral-200 hover:text-white px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/5 inline-flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none'
  const chip = 'flex items-center gap-2 pl-2 pr-1 py-1 border border-white/10 rounded-lg text-xs text-neutral-300'

  return (
    <div className="flex flex-wrap items-center gap-2">
      {style && (
        <div
          className={chip}
          title={
            isEntityStyle
              ? `${style.paletteFrom.title} style (Asset Studio)`
              : `Colours: ${style.paletteFrom.title}\nType: ${style.fontsFrom.title}`
          }
        >
          {isEntityStyle && <span className="text-neutral-200">{style.paletteFrom.title}</span>}
          <span className="flex">
            {SWATCHES.map((k) => (
              <span
                key={k}
                className="w-3.5 h-3.5 rounded-full border border-white/20 -ml-1 first:ml-0"
                style={{ background: style.palette[k] }}
              />
            ))}
          </span>
          <span className="truncate max-w-[16rem]">
            {style.fonts.serif} · {style.fonts.sans} · {style.fonts.mono}
          </span>
          <button
            onClick={() => setStyle(null)}
            className="p-1 text-neutral-500 hover:text-white rounded"
            aria-label="Back to house style"
            title="Back to house style"
          >
            <X size={12} />
          </button>
        </div>
      )}
      {matches && (
        <div className={chip} title={matches.prompt ? `Focus: ${matches.prompt}` : 'Match context in the brief'}>
          <SoccerBall size={14} />
          <span>
            {matches.fixtureIds.length} match{matches.fixtureIds.length === 1 ? '' : 'es'} in the brief
          </span>
          <button
            onClick={() => setMatches(null)}
            className="p-1 text-neutral-500 hover:text-white rounded"
            aria-label="Drop the match context"
            title="Drop the match context"
          >
            <X size={12} />
          </button>
        </div>
      )}
      {race && (
        <div
          className={chip}
          title={[race.drivers.length ? `Drivers: ${race.drivers.join(', ')}` : 'Drivers: the top scorers', race.prompt && `Focus: ${race.prompt}`]
            .filter(Boolean)
            .join('\n')}
        >
          <FlagCheckered size={14} />
          <span>
            {race.sessionKeys.length} session{race.sessionKeys.length === 1 ? '' : 's'}
            {race.drivers.length ? ` · ${race.drivers.join(', ')}` : ''} in the brief
          </span>
          <button
            onClick={() => setRace(null)}
            className="p-1 text-neutral-500 hover:text-white rounded"
            aria-label="Drop the race context"
            title="Drop the race context"
          >
            <X size={12} />
          </button>
        </div>
      )}
      {games && (
        <div className={chip} title={[games.labels.join('\n'), games.prompt && `Focus: ${games.prompt}`].filter(Boolean).join('\n')}>
          <Basketball size={14} />
          <span>
            {games.gameIds.length} game{games.gameIds.length === 1 ? '' : 's'} in the brief
          </span>
          <button
            onClick={() => setGames(null)}
            className="p-1 text-neutral-500 hover:text-white rounded"
            aria-label="Drop the game context"
            title="Drop the game context"
          >
            <X size={12} />
          </button>
        </div>
      )}
      {trip && (
        <div className={chip} title={trip.prompt ? `Notes: ${trip.prompt}` : 'Trip context in the brief'}>
          <Compass size={14} />
          <span>{trip.label} in the brief</span>
          <button
            onClick={() => setTrip(null)}
            className="p-1 text-neutral-500 hover:text-white rounded"
            aria-label="Drop the trip context"
            title="Drop the trip context"
          >
            <X size={12} />
          </button>
        </div>
      )}
      {isTravel && (
        <button onClick={() => setPickingTrip(true)} className={btn} title="Add the trip's itinerary and curated photos to the brief">
          <Compass size={14} />
          {trip ? 'Change trip' : 'Add trip'}
        </button>
      )}
      {isViznba && (
        <button onClick={() => setPickingGames(true)} className={btn} title="Add the games' box scores, runs, leaders and recaps to the brief">
          <Basketball size={14} />
          {games ? 'Change games' : 'Add games'}
        </button>
      )}
      {isVizf1 && (
        <button
          onClick={() => setPickingRace(true)}
          className={btn}
          title="Add the sessions' results, lap timing, telemetry, strategy and standings to the brief"
        >
          <FlagCheckered size={14} />
          {race ? 'Change races' : 'Add races'}
        </button>
      )}
      {isFootshorts && (
        <button onClick={() => setPicking(true)} className={btn} title="Add the matches' facts, timeline, insights, schedules and table to the brief">
          <SoccerBall size={14} />
          {matches ? 'Change matches' : 'Add matches'}
        </button>
      )}
      <FormatPicker app={app} value={format} onChange={setFormat} />
      <ToneToggle value={tone} onChange={setTone} className={btn} />
      {isFootshorts && (
        <StoryStylePicker
          options={entityStyles}
          selected={
            style && (style.paletteFrom.kind === 'competition' || style.paletteFrom.kind === 'team')
              ? { kind: style.paletteFrom.kind, slug: style.paletteFrom.slug }
              : null
          }
          onPick={(o) => setStyle(entityStoryStyle(o))}
          className={btn}
        />
      )}
      <button
        onClick={() => pool && setStyle((prev) => pickRandomStyle(pool, { previous: prev }))}
        disabled={!canShuffle}
        title={canShuffle ? 'Pick a palette and fonts from an existing story' : 'No story themes to draw from'}
        className={btn}
      >
        <Shuffle size={14} />
        {style && !isEntityStyle ? 'Shuffle' : 'Randomize style'}
      </button>
      <button
        onClick={async () => {
          if (!brief) return
          await navigator.clipboard.writeText(brief)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        disabled={!brief || building}
        title={error ?? undefined}
        className={btn}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? 'Copied' : building ? 'Building brief…' : 'Copy agent brief'}
      </button>
      {error && <span className="text-xs text-red-400 basis-full">{error}</span>}
      {pickingRace && <RaceContextPicker initial={race} onClose={() => setPickingRace(false)} onPick={setRace} />}
      {pickingGames && <GameContextPicker initial={games} onClose={() => setPickingGames(false)} onPick={setGames} />}
      {pickingTrip && <TripContextPicker initial={trip} onClose={() => setPickingTrip(false)} onPick={setTrip} />}
      {picking && (
        <MatchPicker
          title="Match context"
          subtitle="Facts, timeline, insights, schedules and the table, appended to the agent brief"
          submitLabel="Add to brief"
          showEventFilter={false}
          maxMatches={MAX_CONTEXT_MATCHES}
          onClose={() => setPicking(false)}
          loadCompetitions={loadCompetitions}
          loadMatches={loadMatches}
          searchTeams={searchTeams}
          loadTeamMatches={loadTeamMatches}
          onScrape={scrape}
          onCreate={async ({ fixtureIds, prompt }) => {
            setMatches({ fixtureIds, prompt })
            return true
          }}
        />
      )}
    </div>
  )
}
