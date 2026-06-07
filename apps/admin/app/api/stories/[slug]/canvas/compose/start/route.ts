import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { getStoryContent } from '@vismay/content-source/content'
import { readComposeState, writeComposeState } from '@vismay/content-source/composeState'

/**
 * Start composing on an EXISTING story — attach a fresh `compose_state` so the
 * canvas mounts the compose overlay (sources → angles → outline) on a story that
 * wasn't created through route 0. The `attached` flag tells materialise to
 * append new sections rather than replace the body, so existing content is safe.
 *
 * DB-only: `compose_state` lives on the Supabase `stories` row, so an fs-mode
 * story has nowhere to write it — we read the state back and 422 if the write
 * affected no row, rather than silently no-op'ing.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params

  if (await readComposeState(slug)) {
    return NextResponse.json(
      { error: 'compose is already in progress for this story' },
      { status: 409 },
    )
  }

  let format: 'deck' | 'map'
  try {
    const story = await getStoryContent(slug)
    format = story.frontmatter.format === 'deck' ? 'deck' : 'map'
  } catch {
    return NextResponse.json({ error: 'story not found' }, { status: 404 })
  }

  try {
    await writeComposeState(slug, {
      phase: 'sources',
      format,
      attached: true,
      angles: [],
      outline: [],
    })
  } catch (e) {
    return NextResponse.json(
      { error: `failed to start compose: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    )
  }

  // `writeComposeState` updates by slug and affects zero rows when the story
  // isn't a Supabase row (fs mode) — confirm it actually stuck.
  if (!(await readComposeState(slug))) {
    return NextResponse.json(
      { error: 'this story is not database-backed; compose needs a Supabase story row' },
      { status: 422 },
    )
  }

  return NextResponse.json({ ok: true })
}
