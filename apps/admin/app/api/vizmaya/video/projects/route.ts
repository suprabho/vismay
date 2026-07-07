import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createVideoProject, listVideoProjects } from '@vismay/content-source/videoProjects'

export const dynamic = 'force-dynamic'

/** List saved video projects, newest first. */
export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const projects = await listVideoProjects()
    return NextResponse.json({ ok: true, projects })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to list projects'
    console.error('[video-projects] list failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** Create a new project from the current snapshot. */
export async function POST(request: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as {
    name?: string
    aspect?: string | null
    config?: unknown
    durationMs?: number | null
  }
  const name = body.name?.trim()
  if (!name || body.config == null) {
    return NextResponse.json({ error: 'name and config are required' }, { status: 400 })
  }
  // Guard against the opaque-500: a snapshot carrying inline base64 media can
  // balloon the JSON past the serverless body / Postgres limits. Surface that
  // clearly. Clips should reference `assets://…` keys, not embed media inline.
  const approxBytes = JSON.stringify(body.config).length
  if (approxBytes > 3_500_000) {
    return NextResponse.json(
      {
        error: `Project is too large to save (~${Math.round(approxBytes / 1e6)}MB). Reference uploaded media by asset, don't embed it inline.`,
      },
      { status: 413 },
    )
  }
  try {
    const project = await createVideoProject({
      name,
      aspect: body.aspect ?? null,
      config: body.config,
      durationMs: body.durationMs ?? null,
    })
    return NextResponse.json({ ok: true, project }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create project'
    console.error('[video-projects] create failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
