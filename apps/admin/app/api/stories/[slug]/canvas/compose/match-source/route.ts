import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { ingestSources } from '@vismay/story-pipeline'
import { insertStorySource } from '@vismay/content-source/storySources'
import {
  buildMatchBrief,
  MAX_BRIEF_MATCHES,
  type MatchBriefFocus,
} from '@vismay/content-source/footshortsMatchBrief'
import type { EventTypeFilter } from '@vismay/content-source/footshortsBlocks'

/**
 * Compose: build a footshorts match brief — the Opta match facts (the full
 * scraped stat set, not just the promoted columns) plus the event timeline for
 * the selected matches — and attach it as a `kind:'text'` source. The server
 * side of the Sources-stage "Add match" picker.
 *
 * Attaches exactly like the `{ text }` paste path so the rest of compose treats
 * it as any other source — and the section pass grafts the brief's real `fs:`
 * configs onto the fs:match-card / fs:match-timeline layers the model places
 * (collectRecapDirectives reads `fs:` fences from every source, so no
 * section-route change is needed).
 *
 * The vizf1 analogue is `../telemetry-source`; keep the two shapes in step.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FILTERS = new Set<EventTypeFilter>(['all', 'goal', 'card', 'subst'])

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params

  let body: { fixtureIds?: unknown; eventFilter?: unknown; prompt?: unknown } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }
  const fixtureIds = Array.isArray(body.fixtureIds)
    ? body.fixtureIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : []
  if (fixtureIds.length === 0) {
    return NextResponse.json({ error: 'missing "fixtureIds"' }, { status: 400 })
  }
  if (fixtureIds.length > MAX_BRIEF_MATCHES) {
    return NextResponse.json(
      { error: `at most ${MAX_BRIEF_MATCHES} matches per brief` },
      { status: 400 },
    )
  }

  const focus: MatchBriefFocus = {}
  if (typeof body.eventFilter === 'string' && FILTERS.has(body.eventFilter as EventTypeFilter)) {
    focus.eventFilter = body.eventFilter as EventTypeFilter
  }
  if (typeof body.prompt === 'string' && body.prompt.trim()) focus.prompt = body.prompt.trim()

  let brief: string
  try {
    brief = await buildMatchBrief(fixtureIds, focus)
  } catch (e) {
    return NextResponse.json(
      { error: `match brief failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  try {
    const { sources } = await ingestSources({ texts: [{ body: brief }] })
    const s = sources[0]
    // The brief's H1 ("# Match brief — Arsenal 2 – 1 Chelsea (Premier League)")
    // makes a good source title.
    const title =
      (brief.split('\n', 1)[0] ?? '').replace(/^#\s*/, '').trim() ||
      `Match brief — ${fixtureIds.length} match(es)`
    const row = await insertStorySource({
      storySlug: slug,
      kind: 'text',
      title,
      extractedText: s?.body ?? brief,
      status: 'extracted',
    })
    return NextResponse.json({ ok: true, source: row })
  } catch (e) {
    return NextResponse.json(
      { error: `failed to attach match source: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    )
  }
}
