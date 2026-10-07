import { NextResponse } from 'next/server'
import { parseHtmlStoryApp } from '@vismay/html-stories/apps'
import { htmlStoryBrief } from '@vismay/html-stories/brief'
import { footshortsHtmlStoryBrief, MAX_CONTEXT_MATCHES } from '@vismay/html-stories/footshortsBrief'
import {
  MAX_RACE_CONTEXT_DRIVERS,
  MAX_RACE_CONTEXT_SESSIONS,
  vizf1HtmlStoryBrief,
} from '@vismay/html-stories/vizf1Brief'
import { parseHtmlStoryFormat } from '@vismay/html-stories/formats'
import type { StoryStyle } from '@vismay/html-stories/styles'
import { getSpin, isSpinId } from '@vismay/randomizer/spins'
import { RANDOMIZER_META } from '@vismay/randomizer/types'
import { isAuthed } from '@/lib/adminAuth'
import { htmlStorySiteUrl } from '@/lib/htmlStoryApps'

/**
 * The agent brief for the admin "Copy agent brief" button, built server-side
 * so a footshorts brief can carry its match context and a vizf1 brief its race
 * context (service-role reads of the match and telemetry tables). JSON body:
 *
 *   { app, format?, style?, fixtureIds?, sessionKeys?, drivers?, prompt?, spinId? }
 *
 * `format` is the story format (scroll, the default, or book, board, deck);
 * `style` is the randomizer's pick (the client shows its swatches, so it must
 * be the one the brief uses); `fixtureIds` + `prompt` are footshorts-only;
 * `sessionKeys` + `drivers` (codes) + `prompt` are vizf1-only;
 * `spinId` is a logged randomizer spin for this app (Desk, Atlas, Epics on
 * vizmaya; the Football Desk on footshorts), whose assignment, research
 * protocol, format and research file the brief then carries (a Football
 * Desk spin's also its fixtures' match context, unless matches are picked).
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
  if (!format) return NextResponse.json({ error: 'format must be scroll, book, board or deck' }, { status: 400 })
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

  let spin = null
  if (b.spinId != null) {
    if (app === 'vizf1' || !isSpinId(b.spinId)) {
      return NextResponse.json({ error: 'spinId must be a vizmaya or footshorts randomizer spin id' }, { status: 400 })
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
        ? await footshortsHtmlStoryBrief({ siteUrl, style, fixtureIds, prompt, format, spin })
        : app === 'vizf1'
          ? await vizf1HtmlStoryBrief({ siteUrl, style, sessionKeys, drivers, prompt, format })
          : htmlStoryBrief({ app, siteUrl, style, spin, format })
  } catch (e) {
    const what = app === 'vizf1' ? 'race context' : 'match context'
    return NextResponse.json(
      { error: `${what} failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }
  return new Response(brief, { headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' } })
}
