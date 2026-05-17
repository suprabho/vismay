import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/

interface CueUpdate {
  unit_index: number
  start_ms: number
  end_ms: number
}

interface PatchBody {
  updates?: CueUpdate[]
}

function isCueUpdate(v: unknown): v is CueUpdate {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.unit_index === 'number' &&
    Number.isInteger(o.unit_index) &&
    o.unit_index >= 0 &&
    typeof o.start_ms === 'number' &&
    o.start_ms >= 0 &&
    typeof o.end_ms === 'number' &&
    o.end_ms >= o.start_ms
  )
}

/**
 * PATCH /api/admin/cues/[slug]
 *
 * Body: { updates: [{ unit_index, start_ms, end_ms }, ...] }
 *
 * Each update overrides one row in `story_audio_cues`. We don't allow changing
 * `chunk_index` here — that's a structural property of the audio, set by the
 * generator. This endpoint only nudges timings within an existing chunk.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) {
    return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  }

  const body = (await req.json().catch(() => null)) as PatchBody | null
  if (!body || !Array.isArray(body.updates) || body.updates.length === 0) {
    return NextResponse.json({ error: 'updates required' }, { status: 400 })
  }
  if (!body.updates.every(isCueUpdate)) {
    return NextResponse.json({ error: 'invalid update shape' }, { status: 400 })
  }

  const sb = createServiceClient()

  // Update each row by (slug, unit_index). Could be done with a bulk upsert
  // but the cues are already keyed by (slug, unit_index) and we don't want
  // to touch chunk_index, so per-row updates are the cleanest fit.
  const errors: string[] = []
  for (const u of body.updates) {
    const { error } = await sb
      .from('story_audio_cues')
      .update({ start_ms: u.start_ms, end_ms: u.end_ms })
      .eq('slug', slug)
      .eq('unit_index', u.unit_index)
    if (error) errors.push(`unit ${u.unit_index}: ${error.message}`)
  }

  if (errors.length > 0) {
    return NextResponse.json(
      { error: 'partial failure', details: errors },
      { status: 500 }
    )
  }
  return NextResponse.json({ updated: body.updates.length })
}
