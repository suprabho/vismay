import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { ingestSources } from '@vismay/story-pipeline'
import { insertStorySource } from '@vismay/content-source/storySources'
import { createServiceClient } from '@vismay/content-source/supabase'
import { buildTelemetryBrief, type BriefFocus } from '@vismay/f1-viz/telemetry-brief'

/**
 * Compose: build a focused F1 telemetry brief and attach it as a `kind:'text'`
 * source — the server side of the Sources-stage "Add telemetry session" picker.
 *
 * Generates the brief from the ingested telemetry tables (filtered by the
 * selected drivers/constructors, with the editor's prompt folded in as editorial
 * intent), then attaches it exactly like the `{ text }` paste path so the rest of
 * compose treats it as any other source — and the section pass grafts its real
 * `f1:` config onto the layers the model places.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params

  let body: { sessionKey?: string; driverNumbers?: number[]; constructors?: string[]; prompt?: string } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }
  const sessionKey = typeof body.sessionKey === 'string' ? body.sessionKey.trim() : ''
  if (!sessionKey) return NextResponse.json({ error: 'missing "sessionKey"' }, { status: 400 })

  const focus: BriefFocus = {}
  if (Array.isArray(body.driverNumbers)) {
    const nums = body.driverNumbers.map(Number).filter((n) => Number.isFinite(n))
    if (nums.length) focus.driverNumbers = nums
  }
  if (Array.isArray(body.constructors)) {
    const cons = body.constructors.filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim())
    if (cons.length) focus.constructors = cons
  }
  if (typeof body.prompt === 'string' && body.prompt.trim()) focus.prompt = body.prompt.trim()

  let brief: string
  try {
    brief = await buildTelemetryBrief(createServiceClient(), sessionKey, focus)
  } catch (e) {
    return NextResponse.json(
      { error: `telemetry brief failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  try {
    const { sources } = await ingestSources({ texts: [{ body: brief }] })
    const s = sources[0]
    // The brief's H1 ("# Telemetry brief — <gp> <season> (<type>)") makes a good title.
    const title = (brief.split('\n', 1)[0] ?? '').replace(/^#\s*/, '').trim() || `Telemetry — ${sessionKey}`
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
      { error: `failed to attach telemetry source: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    )
  }
}
