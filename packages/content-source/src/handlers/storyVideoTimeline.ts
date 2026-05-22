import { NextResponse } from 'next/server'
import { createServiceClient } from '../supabase'
import {
  computeTimeline,
  listRangeRenders,
  loadChunksAndCues,
} from '../storyVideo'

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/

/**
 * GET /api/story-video/[slug]/timeline
 *
 * Returns the cumulative audio timeline (so admins can map unit indices ↔
 * absolute ms ranges) plus any existing sub-range renders for the slug.
 *
 *   200 {
 *     totalMs,
 *     units:   [{ unitIndex, absStartMs, absEndMs }],
 *     renders: [{ aspect, range_start_ms, range_end_ms, public_url, ... }]
 *   }
 *   404 if the slug has no audio
 */
export function createStoryVideoTimelineHandler() {
  return {
    async GET(
      _req: Request,
      { params }: { params: Promise<{ slug: string }> }
    ) {
      const { slug } = await params
      if (!SAFE_SLUG.test(slug)) {
        return NextResponse.json({ error: 'bad slug' }, { status: 400 })
      }

      try {
        // createServiceClient() throws synchronously when SUPABASE_SERVICE_ROLE_KEY
        // is missing. Catch it so the client sees a real error message instead of
        // an opaque Next.js 500.
        const supabase = createServiceClient()
        const { chunks, cues } = await loadChunksAndCues(supabase, slug)
        if (chunks.length === 0 || cues.length === 0) {
          return NextResponse.json({ error: 'no audio for slug' }, { status: 404 })
        }

        const { totalMs, chunkOffsetMs } = computeTimeline(chunks)

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
        const message =
          err instanceof Error ? err.message : 'timeline lookup failed'
        return NextResponse.json({ error: message }, { status: 500 })
      }
    },
  }
}
