import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'
import { recordFeedback, type FeedbackRating } from '@vismay/ai-gateway'

/**
 * Attach an author's verdict to one AI generation.
 *
 * Generations (slot `generate` and `generate-section`) return a `generation.id`
 * — the `ai_generations` row id. The author rates that output thumbs up/down
 * with an optional note; we write it back onto the row (migration 051). Rating
 * is mutable: re-posting for the same id overwrites. This endpoint never
 * generates — it only records the verdict.
 */

const MAX_COMMENT_LENGTH = 2000

interface Body {
  generationId?: string
  rating?: string
  comment?: string
}

export async function POST(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }

  const generationId =
    typeof body.generationId === 'string' ? body.generationId.trim() : ''
  if (!generationId) {
    return NextResponse.json({ error: 'missing "generationId"' }, { status: 400 })
  }
  if (body.rating !== 'up' && body.rating !== 'down') {
    return NextResponse.json(
      { error: '"rating" must be "up" or "down"' },
      { status: 400 },
    )
  }
  const comment =
    typeof body.comment === 'string' && body.comment.trim()
      ? body.comment.trim().slice(0, MAX_COMMENT_LENGTH)
      : null

  try {
    const supabase = createServiceClient()
    await recordFeedback(supabase, {
      generationId,
      rating: body.rating as FeedbackRating,
      comment,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'could not record feedback' },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true })
}
