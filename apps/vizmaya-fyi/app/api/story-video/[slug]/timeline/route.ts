import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  computeTimeline,
  listRangeRenders,
  loadChunksAndCues,
} from '@/lib/storyVideo'

/**
 * Surface the cumulative audio timeline for a slug so the admin
 * Range-renders UI can map unit indices ↔ absolute ms ranges. Also returns
 * any existing sub-range renders for the slug so the panel can list them
 * without a separate fetch.
 *
 *   GET /api/story-video/[slug]/timeline
 *     → 200 {
 *         totalMs,
 *         units: [{ unitIndex, absStartMs, absEndMs }],   // ordered, dedupe
 *         renders: [
 *           { aspect, range_start_ms, range_end_ms,
 *             public_url, duration_ms, dispatched_at, created_at }
 *         ],
 *       }
 *     → 404 if the slug has no audio
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) {
    return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  }

  const supabase = createServiceClient()
  try {
    const { chunks, cues } = await loadChunksAndCues(supabase, slug)
    if (chunks.length === 0 || cues.length === 0) {
      return NextResponse.json({ error: 'no audio for slug' }, { status: 404 })
    }

    const { totalMs, chunkOffsetMs } = computeTimeline(chunks)

    // Reduce cues to one row per unit_index. Multiple cues can share a unit
    // when audio chunks split mid-unit; take the earliest start and latest
    // end so the absolute window covers the whole unit.
    type Acc = { unitIndex: number; absStartMs: number; absEndMs: number }
    const byUnit = new Map<number, Acc>()
    for (const c of cues) {
      const offset = chunkOffsetMs.get(c.chunk_index) ?? 0
      const absStart = offset + c.start_ms
      const absEnd = offset + c.end_ms
      const prev = byUnit.get(c.unit_index)
      if (!prev) {
        byUnit.set(c.unit_index, {
          unitIndex: c.unit_index,
          absStartMs: absStart,
          absEndMs: absEnd,
        })
      } else {
        prev.absStartMs = Math.min(prev.absStartMs, absStart)
        prev.absEndMs = Math.max(prev.absEndMs, absEnd)
      }
    }

    const units = Array.from(byUnit.values()).sort(
      (a, b) => a.absStartMs - b.absStartMs
    )

    const renders = await listRangeRenders(supabase, slug, totalMs)

    return NextResponse.json({ totalMs, units, renders })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'timeline lookup failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
