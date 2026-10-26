import { NextResponse } from 'next/server'
import { parseHtmlStoryApp } from '@vismay/html-stories/apps'
import { htmlStoryBrief } from '@vismay/html-stories/brief'
import { footshortsHtmlStoryBrief, MAX_CONTEXT_MATCHES } from '@vismay/html-stories/footshortsBrief'
import {
  MAX_RACE_CONTEXT_DRIVERS,
  MAX_RACE_CONTEXT_SESSIONS,
  vizf1HtmlStoryBrief,
} from '@vismay/html-stories/vizf1Brief'
import { isGameId, MAX_GAME_CONTEXT, viznbaHtmlStoryBrief } from '@vismay/html-stories/viznbaBrief'
import { travelHtmlStoryBrief } from '@vismay/html-stories/travelBrief'
import { HTML_STORY_FORMATS, isFormatForApp, parseHtmlStoryFormat } from '@vismay/html-stories/formats'
import type { StoryStyle } from '@vismay/html-stories/styles'
import { HTML_STORY_TONES, parseHtmlStoryTone } from '@vismay/html-stories/tone'
import { getSpin, isSpinId } from '@vismay/randomizer/spins'
import { RANDOMIZER_META } from '@vismay/randomizer/types'
import { isAuthed } from '@/lib/adminAuth'
import { htmlStorySiteUrl } from '@/lib/htmlStoryApps'

/**
 * The agent brief for the admin "Copy agent brief" button, built server-side
 * so a footshorts brief can carry its match context, a vizf1 brief its race
 * context (service-role reads of the match and telemetry tables), a viznba
 * brief its game context (ESPN box scores) and a travel brief its trip context
 * (the itinerary and curated photos). JSON body:
 *
 *   { app, format?, tone?, style?, fixtureIds?, sessionKeys?, drivers?, gameIds?, tripSlug?, day?, prompt?, spinId? }
 *
 * `format` is the story format (scroll, the default, or book, board, deck, collage, recap);
 * `tone` is the story's voice (straight, the default, or humorous);
 * `style` is the randomizer's pick (the client shows its swatches, so it must
 * be the one the brief uses); `fixtureIds` + `prompt` are footshorts-only;
 * `sessionKeys` + `drivers` (codes) + `prompt` are vizf1-only;
 * `gameIds` (ESPN event ids) + `prompt` are viznba-only;
 * `tripSlug` + `day` (omitted: the whole trip) + `prompt` are travel-only;
 * `spinId` is a logged randomizer spin for this app (Desk, Atlas, Epics on
 * vizmaya; the Football Desk on footshorts; the NBA Desk on viznba), whose
 * assignment, research protocol, format and research file the brief then
 * carries (a Football Desk spin's also its fixtures' match context, an NBA
 * Desk spin's its games' box scores, unless matches or games are picked).
 * Answers text/markdown.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isStyle(v: unknown): v is StoryStyle {
  if (!v || typeof v !== 'object') return false
  const s = v as Record<string, unknown>
  return !!s.palette && typeof s.palette === 'object' && !!s.fonts && typeof s.fonts === 'object'
}

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'expected a JSON object' }, { status: 400 })

  const app = parseHtmlStoryApp(b.app)
  if (!app) return NextResponse.json({ error: 'unknown app' }, { status: 400 })
  const format = parseHtmlStoryFormat(b.format)
  if (!format) return NextResponse.json({ error: `format must be one of ${HTML_STORY_FORMATS.join(', ')}` }, { status: 400 })
  if (!isFormatForApp(app, format)) {
    return NextResponse.json({ error: `the ${format} format isn't available for ${app}` }, { status: 400 })
  }
  const tone = parseHtmlStoryTone(b.tone)
  if (!tone) return NextResponse.json({ error: `tone must be one of ${HTML_STORY_TONES.join(', ')}` }, { status: 400 })
  const style = isStyle(b.style) ? b.style : null
  const siteUrl = htmlStorySiteUrl(app)

  const fixtureIds = Array.isArray(b.fixtureIds)
    ? b.fixtureIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
    : []
  if (fixtureIds.length > MAX_CONTEXT_MATCHES) {
    return NextResponse.json({ error: `at most ${MAX_CONTEXT_MATCHES} matches per brief` }, { status: 400 })
  }
  const prompt = typeof b.prompt === 'string' && b.prompt.trim() ? b.prompt.trim() : undefined
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : []
  const sessionKeys = app === 'vizf1' ? Array.from(new Set(strings(b.sessionKeys))) : []
  const drivers = app === 'vizf1' ? Array.from(new Set(strings(b.drivers).map((d) => d.toUpperCase()))) : []
  if (sessionKeys.length > MAX_RACE_CONTEXT_SESSIONS) {
    return NextResponse.json({ error: `at most ${MAX_RACE_CONTEXT_SESSIONS} sessions per brief` }, { status: 400 })
  }
  if (drivers.length > MAX_RACE_CONTEXT_DRIVERS) {
    return NextResponse.json({ error: `at most ${MAX_RACE_CONTEXT_DRIVERS} drivers per brief` }, { status: 400 })
  }
  const gameIds = app === 'viznba' ? Array.from(new Set(strings(b.gameIds))) : []
  if (gameIds.length > MAX_GAME_CONTEXT) {
    return NextResponse.json({ error: `at most ${MAX_GAME_CONTEXT} games per brief` }, { status: 400 })
  }
  if (!gameIds.every(isGameId)) return NextResponse.json({ error: 'gameIds must be ESPN event ids' }, { status: 400 })
  const tripSlug = app === 'travel' && typeof b.tripSlug === 'string' && b.tripSlug.trim() ? b.tripSlug.trim() : null
  const day = app === 'travel' && b.day != null ? Number(b.day) : null
  if (day != null && (!Number.isInteger(day) || day < 0 || !tripSlug)) {
    return NextResponse.json({ error: 'day must be a day number of the picked trip' }, { status: 400 })
  }

  let spin = null
  if (b.spinId != null) {
    if (app === 'vizf1' || app === 'travel' || !isSpinId(b.spinId)) {
      return NextResponse.json({ error: 'spinId must be a vizmaya, footshorts or viznba randomizer spin id' }, { status: 400 })
    }
    try {
      spin = await getSpin(b.spinId)
    } catch (e) {
      return NextResponse.json({ error: `spin lookup failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 })
    }
    if (!spin) return NextResponse.json({ error: `no spin ${b.spinId}` }, { status: 404 })
    if (RANDOMIZER_META[spin.randomizer].app !== app) {
      return NextResponse.json({ error: `spin ${spin.id} is a ${RANDOMIZER_META[spin.randomizer].name} spin, not a ${app} one` }, { status: 400 })
    }
  }

  let brief: string
  try {
    brief =
      app === 'footshorts'
        ? await footshortsHtmlStoryBrief({ siteUrl, style, fixtureIds, prompt, format, spin, tone })
        : app === 'vizf1'
          ? await vizf1HtmlStoryBrief({ siteUrl, style, sessionKeys, drivers, prompt, format, tone })
          : app === 'viznba'
            ? await viznbaHtmlStoryBrief({ siteUrl, style, gameIds, prompt, format, spin, tone })
            : app === 'travel'
              ? await travelHtmlStoryBrief({ siteUrl, style, tripSlug, day, prompt, format, tone })
              : htmlStoryBrief({ app, siteUrl, style, spin, format, tone })
  } catch (e) {
    const what =
      app === 'vizf1' ? 'race context' : app === 'viznba' ? 'game context' : app === 'travel' ? 'trip context' : 'match context'
    return NextResponse.json(
      { error: `${what} failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }
  return new Response(brief, { headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' } })
}
