import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { assembleStory, validateStory, type GeneratedSection } from '@vismay/story-pipeline'
import { loadSession, deleteSession, previewUrlFor } from '../../shared'

/**
 * Load a saved session in full (for reload-resume rehydration) or delete it.
 * GET returns the session plus the derived previewUrl / issues / imagePrompts so
 * the panel can restore the exact post-generation view.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { id } = await params

  let session
  try {
    session = await loadSession(id)
  } catch {
    return NextResponse.json({ error: 'bad session id' }, { status: 400 })
  }
  if (!session) {
    return NextResponse.json({ error: 'session not found' }, { status: 404 })
  }

  const sections = (session.sections ?? []).filter((x): x is GeneratedSection => x != null)
  const total = session.outline?.sections.length ?? 0
  const imagePrompts = session.outline?.imagePrompts ?? []
  let issues: ReturnType<typeof validateStory> = []
  if (session.outline && sections.length > 0) {
    issues = validateStory(assembleStory(session.outline, sections))
  }

  return NextResponse.json({
    ok: true,
    session,
    previewUrl: session.slug ? previewUrlFor(session.slug) : null,
    issues,
    imagePrompts,
    done: sections.length,
    total,
  })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { id } = await params
  try {
    await deleteSession(id)
  } catch {
    return NextResponse.json({ error: 'bad session id' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
