import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { readComposeState, writeComposeState } from '@vismay/content-source/composeState'

/**
 * Finish composing — clear the draft's `compose_state` so it becomes a normal
 * story (the canvas overlay stops rendering). The sources/markdown/config stay;
 * only the pipeline scaffold is dropped.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  const state = await readComposeState(slug)
  if (state) await writeComposeState(slug, null)
  return NextResponse.json({ ok: true })
}
