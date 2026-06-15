import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'
import {
  isHeygenConfigured,
  getVideoStatus,
  HeygenApiError,
} from '@vismay/content-source/heygenTemplate'
import {
  getHeygenRender,
  updateHeygenRender,
  heygenStoragePath,
  HEYGEN_BUCKET,
  type HeygenRenderRow,
} from '@vismay/content-source/heygenRenders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface StatusResponse {
  videoId: string
  status: HeygenRenderRow['status']
  publicUrl: string | null
  thumbnailUrl: string | null
  durationMs: number | null
  error: string | null
}

function shape(row: HeygenRenderRow): StatusResponse {
  return {
    videoId: row.video_id,
    status: row.status,
    publicUrl: row.public_url,
    thumbnailUrl: row.thumbnail_url,
    durationMs: row.duration_ms,
    error: row.error,
  }
}

/**
 * Poll a HeyGen render. The client hits this on an interval; on the first poll
 * that sees `completed` we download the finished MP4, re-upload it to the
 * `story-video` bucket (HeyGen's own URLs expire), and flip the row to
 * `completed`. Idempotent — a render already persisted returns its cached row
 * without re-downloading.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!isHeygenConfigured()) {
    return NextResponse.json({ error: 'HeyGen not configured' }, { status: 503 })
  }

  const { videoId } = await params
  if (!videoId) {
    return NextResponse.json({ error: 'missing videoId' }, { status: 400 })
  }

  let supabase
  try {
    supabase = createServiceClient()
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'supabase init failed' },
      { status: 500 },
    )
  }

  let row: HeygenRenderRow | null
  try {
    row = await getHeygenRender(supabase, videoId)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'lookup failed' },
      { status: 500 },
    )
  }
  if (!row) {
    return NextResponse.json({ error: 'unknown render' }, { status: 404 })
  }

  // Terminal states are sticky — no need to re-poll HeyGen once we've persisted.
  if (row.status === 'completed' && row.public_url) return NextResponse.json(shape(row))
  if (row.status === 'failed') return NextResponse.json(shape(row))

  let state
  try {
    state = await getVideoStatus(videoId)
  } catch (e) {
    const status = e instanceof HeygenApiError ? 502 : 500
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'status poll failed' },
      { status },
    )
  }

  if (state.status === 'failed') {
    const updated = await updateHeygenRender(supabase, videoId, {
      status: 'failed',
      error: state.error ?? 'HeyGen render failed',
    })
    return NextResponse.json(shape(updated ?? { ...row, status: 'failed', error: state.error ?? null }))
  }

  if (state.status !== 'completed') {
    // waiting / pending / processing — reflect progress, keep client polling.
    const updated =
      row.status === 'pending'
        ? await updateHeygenRender(supabase, videoId, { status: 'processing' })
        : row
    return NextResponse.json(shape(updated ?? row))
  }

  // Completed: pull the MP4 into our own bucket so it outlives HeyGen's URL.
  if (!state.videoUrl) {
    return NextResponse.json(
      { error: 'HeyGen reported completed but returned no video URL' },
      { status: 502 },
    )
  }

  let bytes: Uint8Array
  try {
    const dl = await fetch(state.videoUrl)
    if (!dl.ok) throw new Error(`download ${dl.status}`)
    bytes = new Uint8Array(await dl.arrayBuffer())
  } catch (e) {
    // Leave the row non-terminal so the next poll retries the download.
    return NextResponse.json(
      { error: `failed to download render: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }

  const path = heygenStoragePath(row.slug, videoId)
  const { error: upErr } = await supabase.storage
    .from(HEYGEN_BUCKET)
    .upload(path, bytes, { contentType: 'video/mp4', upsert: true })
  if (upErr) {
    return NextResponse.json({ error: `upload failed: ${upErr.message}` }, { status: 500 })
  }

  const { data: pub } = supabase.storage.from(HEYGEN_BUCKET).getPublicUrl(path)
  // HeyGen reports duration in seconds; store milliseconds for parity with story_videos.
  const durationMs =
    typeof state.duration === 'number' ? Math.round(state.duration * 1000) : null

  const updated = await updateHeygenRender(supabase, videoId, {
    status: 'completed',
    storage_path: path,
    public_url: pub.publicUrl,
    thumbnail_url: state.thumbnailUrl ?? null,
    duration_ms: durationMs,
    error: null,
  })
  return NextResponse.json(
    shape(
      updated ?? {
        ...row,
        status: 'completed',
        storage_path: path,
        public_url: pub.publicUrl,
        thumbnail_url: state.thumbnailUrl ?? null,
        duration_ms: durationMs,
      },
    ),
  )
}
