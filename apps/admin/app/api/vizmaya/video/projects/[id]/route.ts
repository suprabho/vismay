import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import {
  deleteVideoProject,
  getVideoProject,
  updateVideoProject,
} from '@vismay/content-source/videoProjects'

export const dynamic = 'force-dynamic'

/** Load one project by id. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    const project = await getVideoProject(id)
    if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true, project })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load project'
    console.error('[video-projects] get failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** Update a project in place (name / aspect / config / duration). */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as {
    name?: string
    aspect?: string | null
    config?: unknown
    durationMs?: number | null
  }
  if (body.config != null) {
    const approxBytes = JSON.stringify(body.config).length
    if (approxBytes > 3_500_000) {
      return NextResponse.json(
        {
          error: `Project is too large to save (~${Math.round(approxBytes / 1e6)}MB). Reference uploaded media by asset, don't embed it inline.`,
        },
        { status: 413 },
      )
    }
  }
  try {
    const project = await updateVideoProject(id, {
      name: body.name,
      aspect: body.aspect,
      config: body.config,
      durationMs: body.durationMs,
    })
    return NextResponse.json({ ok: true, project })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update project'
    console.error('[video-projects] update failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** Delete a project. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    await deleteVideoProject(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to delete project'
    console.error('[video-projects] delete failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
