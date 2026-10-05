'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Shuffle, SoccerBall, X } from '@phosphor-icons/react'
import type { HtmlStoryApp } from '@vismay/html-stories/apps'
import { pickRandomStyle, type StoryStyle, type StylePool } from '@vismay/html-stories/styles'
import { MatchPicker } from '@/components/canvas/compose/MatchPicker'
import type { MatchCompetition, MatchOption } from '@/components/canvas/compose/useComposeFlow'

const SWATCHES = ['background', 'surface', 'text', 'muted', 'accent', 'accent2', 'teal'] as const

/** The matches a footshorts brief is about, as the picker returns them. */
interface MatchContextPick {
  fixtureIds: string[]
  prompt?: string
}

/**
 * "Copy agent brief" plus a style randomizer: Shuffle swaps the brief's house
 * style for a palette and font trio drawn from the app's stories' themes.
 *
 * For footshorts there is also a match picker: tick up to six matches (and
 * write the editorial angle) and the brief gains their match context — Opta
 * facts and full stat set, timeline, insights, commentary, build-up, both
 * sides' form and schedule, the table, and the competition's next fixtures.
 * Picking a match reuses the compose Sources-stage picker, badges and
 * on-demand scrape included.
 *
 * The brief itself is built server-side (POST /api/html-stories/brief) so the
 * match context can be read with the service client; it is fetched whenever
 * the style or the matches change and copied synchronously on click, so the
 * clipboard write stays inside the user gesture.
 */
export function BriefGenerator({ app, pool }: { app: HtmlStoryApp; pool: StylePool | null }) {
  const [style, setStyle] = useState<StoryStyle | null>(null)
  const [matches, setMatches] = useState<MatchContextPick | null>(null)
  const [picking, setPicking] = useState(false)
  // The last brief the server built, tagged with the request it answers; the
  // button is "building" whenever the current request has no answer yet.
  const [built, setBuilt] = useState<{ request: string; brief: string | null; error: string | null } | null>(null)
  const [copied, setCopied] = useState(false)
  const canShuffle = !!pool?.palettes.length && !!pool.fonts.length
  const isFootshorts = app === 'footshorts'

  const request = useMemo(
    () => JSON.stringify({ app, style, fixtureIds: matches?.fixtureIds ?? [], prompt: matches?.prompt }),
    [app, style, matches],
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
      const res = await fetch('/api/footshorts/data/competitions', { cache: 'no-store' })
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
  async function scrape(fixtureId: string, competition: string): Promise<'dispatched' | 'unconfigured' | 'failed'> {
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
        <div className={chip} title={`Colours: ${style.paletteFrom.title}\nType: ${style.fontsFrom.title}`}>
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
      {isFootshorts && (
        <button onClick={() => setPicking(true)} className={btn} title="Add the matches' facts, timeline, insights, schedules and table to the brief">
          <SoccerBall size={14} />
          {matches ? 'Change matches' : 'Add matches'}
        </button>
      )}
      <button
        onClick={() => pool && setStyle((prev) => pickRandomStyle(pool, { previous: prev }))}
        disabled={!canShuffle}
        title={canShuffle ? 'Pick a palette and fonts from an existing story' : 'No story themes to draw from'}
        className={btn}
      >
        <Shuffle size={14} />
        {style ? 'Shuffle' : 'Randomize style'}
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
      {picking && (
        <MatchPicker
          title="Match context"
          subtitle="Facts, timeline, insights, schedules and the table, appended to the agent brief"
          submitLabel="Add to brief"
          onClose={() => setPicking(false)}
          loadCompetitions={loadCompetitions}
          loadMatches={loadMatches}
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
