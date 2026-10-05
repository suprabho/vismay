import { NextResponse } from 'next/server'
import { parseHtmlStoryApp } from '@vismay/html-stories/apps'
import { htmlStoryBrief } from '@vismay/html-stories/brief'
import { footshortsHtmlStoryBrief, MAX_CONTEXT_MATCHES } from '@vismay/html-stories/footshortsBrief'
import type { StoryStyle } from '@vismay/html-stories/styles'
import { isAuthed } from '@/lib/adminAuth'
import { htmlStorySiteUrl } from '@/lib/htmlStoryApps'

/**
 * The agent brief for the admin "Copy agent brief" button, built server-side
 * so a footshorts brief can carry its match context (service-role reads of the
 * match tables). JSON body:
 *
 *   { app, style?, fixtureIds?, prompt? }
 *
 * `style` is the randomizer's pick (the client shows its swatches, so it must
 * be the one the brief uses); `fixtureIds` + `prompt` are footshorts-only.
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
  const style = isStyle(b.style) ? b.style : null
  const siteUrl = htmlStorySiteUrl(app)

  const fixtureIds = Array.isArray(b.fixtureIds)
    ? b.fixtureIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
    : []
  if (fixtureIds.length > MAX_CONTEXT_MATCHES) {
    return NextResponse.json({ error: `at most ${MAX_CONTEXT_MATCHES} matches per brief` }, { status: 400 })
  }
  const prompt = typeof b.prompt === 'string' && b.prompt.trim() ? b.prompt.trim() : undefined

  let brief: string
  try {
    brief =
      app === 'footshorts'
        ? await footshortsHtmlStoryBrief({ siteUrl, style, fixtureIds, prompt })
        : htmlStoryBrief({ app, siteUrl, style })
  } catch (e) {
    return NextResponse.json(
      { error: `match context failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }
  return new Response(brief, { headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' } })
}
