import { NextResponse } from 'next/server'
import { createServiceClient } from '@vismay/content-source/supabase'
import {
  classifyProjectRenderState,
  computeProjectHash,
  getCachedProjectRender,
  getVideoProject,
  markProjectDispatched,
  type VideoProjectAspect,
} from '@vismay/content-source/videoProjects'
import {
  dispatchProjectVideoRenderJob,
  isProjectVideoDispatchConfigured,
} from '@/lib/projectVideoDispatch'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

function isAspect(v: string | null): v is VideoProjectAspect {
  return v === '9:16' || v === '16:9'
}

/**
 * Render-or-poll endpoint for a freeform video project. Same polling-friendly
 * response shape as the story-video route (`{ status: 'ready' | 'rendering' }`)
 * and the same dispatch-or-sync split:
 *
 *   - cached + hash match → 200 ready (cached)
 *   - render already in flight → 202 rendering
 *   - otherwise: dispatch to GitHub Actions (prod) → 202 rendering, or run the
 *     renderer in-process (dev, no dispatch envs) → 200 ready.
 *
 * `renderProjectVideo` pulls in playwright, so it's dynamic-imported only on the
 * sync path (importing it eagerly would break the serverless cold-start).
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const url = new URL(req.url)

  const aspectParam = url.searchParams.get('aspect') ?? '16:9'
  if (!isAspect(aspectParam)) {
    return NextResponse.json(
      { error: 'aspect must be 9:16 or 16:9' },
      { status: 400 },
    )
  }
  const aspect = aspectParam
  const force = url.searchParams.get('force') === '1'

  // The headless browser fetches `/video-project/<id>?capture=1` from this same
  // origin — derive baseUrl from the request so dev/preview/prod all work.
  const baseUrl =
    process.env.BASE_URL ?? `${url.protocol}//${url.host}`

  let supabase: ReturnType<typeof createServiceClient>
  try {
    // createServiceClient() throws synchronously when the service key is
    // missing — catch it so the client sees a real error, not an opaque 500.
    supabase = createServiceClient()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'supabase init failed' },
      { status: 500 },
    )
  }

  const project = await getVideoProject(id)
  if (!project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 })
  }

  const hash = computeProjectHash(project.config, aspect)
  const cached = await getCachedProjectRender(supabase, id, aspect, hash)
  const state = classifyProjectRenderState(cached, hash)

  if (!force && state.kind === 'ready') {
    return NextResponse.json({
      status: 'ready',
      public_url: state.row.public_url,
      duration_ms: state.row.duration_ms,
      cached: true,
    })
  }

  if (!force && state.kind === 'rendering') {
    return NextResponse.json({ status: 'rendering' }, { status: 202 })
  }

  // Cache miss / stale / forced → kick off a render.
  if (isProjectVideoDispatchConfigured()) {
    await markProjectDispatched(supabase, { projectId: id, aspect, snapshotHash: hash })
    await dispatchProjectVideoRenderJob({ projectId: id, aspect, baseUrl })
    return NextResponse.json({ status: 'rendering' }, { status: 202 })
  }

  // Dev fallback: render synchronously in-process. Dynamic-import so the
  // playwright dependency never loads on the dispatch path / cold start.
  try {
    const { renderProjectVideo } = await import('@/lib/projectVideoRender')
    const result = await renderProjectVideo({
      supabase,
      projectId: id,
      aspect,
      baseUrl,
      force,
      log: (msg) => console.log(`[video-project ${id}] ${msg}`),
    })
    return NextResponse.json({
      status: 'ready',
      public_url: result.public_url,
      duration_ms: result.duration_ms,
      cached: result.cached,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'render failed' },
      { status: 500 },
    )
  }
}
