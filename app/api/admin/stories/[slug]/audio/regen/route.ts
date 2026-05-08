/**
 * POST → fire a workflow_dispatch to render-audio.yml for this slug.
 *
 * 200 { ok: true, mode: 'dispatched' | 'unconfigured' }
 *
 * Admin-auth gated. When dispatch envs aren't set (local dev), returns
 * `mode: 'unconfigured'` so the UI can tell the operator to run
 * `npx tsx scripts/generate-audio.ts <slug> --force` manually instead of
 * silently doing nothing.
 *
 * No polling/status table for v1: the existing `story_audio_chunks` rows
 * update in place as the script runs. The admin UI shows "kicked off — check
 * autoplay in a few minutes" rather than a progress bar.
 */

import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { dispatchAudioRenderJob, isAudioDispatchConfigured } from '@/lib/storyAudioDispatch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })

  if (!isAudioDispatchConfigured()) {
    return NextResponse.json({ ok: true, mode: 'unconfigured' })
  }

  try {
    await dispatchAudioRenderJob({ slug })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'dispatch failed' },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, mode: 'dispatched' })
}
