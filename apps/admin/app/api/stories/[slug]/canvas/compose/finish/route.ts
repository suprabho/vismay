import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { readComposeState, writeComposeState } from '@vismay/content-source/composeState'

/**
 * Finish composing — mark the draft a normal story. We RETAIN the research:
 * the angles + outline (and the `story_sources` rows) are kept, the scaffold is
 * just flagged `archived` so it stops auto-surfacing the overlay and drops out
 * of the in-progress resume picker. The author can reopen it from the canvas /
 * editor any time. (Previously this nulled `compose_state`, which discarded the
 * whole outline irreversibly.)
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  const state = await readComposeState(slug)
  if (state && !state.archived) {
    await writeComposeState(slug, { ...state, phase: 'done', archived: true })
  }
  return NextResponse.json({ ok: true })
}
