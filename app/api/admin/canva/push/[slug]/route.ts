/**
 * POST /api/admin/canva/push/[slug]?aspect=9:16|16:9
 *
 * Pushes a cached autoplay MP4 into Canva and creates a blank design at
 * the right aspect-ratio canvas. The video lands in the user's Canva
 * Uploads sidebar; Canva's API doesn't let us embed a video into the
 * design programmatically (asset_id only supports images), so the user
 * drags it onto the canvas manually before running auto-captions.
 *
 *   200 { ok: true, design_id, edit_url, thumbnail_url, reused: boolean }
 *   401 { error }                  not authed
 *   400 { error }                  bad slug/aspect
 *   404 { error }                  no cached video for this (slug, aspect)
 *   409 { error }                  video render is still in flight
 *   500 { error }                  upload, design create, or token failure
 *
 * The first push for (slug, aspect) does the full upload+create flow. A
 * second call returns the existing canva_designs row with reused=true —
 * so the admin button can flip to "Open in Canva" without re-uploading.
 * Pass `?force=1` to ignore the cached row and re-upload (creates a second
 * design in Canva; the existing row is overwritten).
 *
 * Admin-auth gated.
 */

import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { getCachedVideo, type VideoAspect } from '@/lib/storyVideo'
import {
  CanvaAuthError,
  CanvaConfigError,
  createBlankDesignForAspect,
  getCanvaDesign,
  getValidAccessToken,
  uploadAssetFromUrl,
  upsertCanvaDesign,
} from '@/lib/canva'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/

function isAspect(v: string | null): v is VideoAspect {
  return v === '9:16' || v === '16:9'
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) {
    return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  }

  const url = new URL(req.url)
  const aspect = url.searchParams.get('aspect')
  if (!isAspect(aspect)) {
    return NextResponse.json(
      { error: 'aspect must be 9:16 or 16:9' },
      { status: 400 }
    )
  }
  const force = url.searchParams.get('force') === '1'

  const supabase = createServiceClient()

  // Short-circuit: if we already pushed this (slug, aspect), hand the edit
  // URL straight back so the UI just opens the existing design.
  if (!force) {
    const existing = await getCanvaDesign(supabase, slug, aspect)
    if (existing) {
      return NextResponse.json({
        ok: true,
        design_id: existing.design_id,
        edit_url: existing.edit_url,
        thumbnail_url: existing.thumbnail_url,
        reused: true,
      })
    }
  }

  // The MP4 has to exist before we can push it. We don't dispatch a render
  // from here — the render trigger lives next to this button and the user
  // is expected to render first.
  const video = await getCachedVideo(supabase, slug, aspect, false)
  if (!video || !video.public_url) {
    return NextResponse.json(
      { error: 'No cached video — render the autoplay first.' },
      { status: 404 }
    )
  }
  if (video.dispatched_at && !video.public_url) {
    return NextResponse.json(
      { error: 'Video render is still in flight. Try again once it completes.' },
      { status: 409 }
    )
  }

  let accessToken: string
  try {
    accessToken = await getValidAccessToken(supabase)
  } catch (err) {
    if (err instanceof CanvaConfigError) {
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
    if (err instanceof CanvaAuthError) {
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'token fetch failed' },
      { status: 500 }
    )
  }

  const filename = `${slug}-${aspect.replace(':', 'x')}.mp4`

  let assetId: string
  let assetThumb: string | undefined
  try {
    const result = await uploadAssetFromUrl({
      videoUrl: video.public_url,
      accessToken,
      name: filename,
    })
    assetId = result.assetId
    assetThumb = result.thumbnailUrl
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'asset upload failed' },
      { status: 500 }
    )
  }

  let design: { designId: string; editUrl: string; thumbnailUrl?: string }
  try {
    design = await createBlankDesignForAspect({
      aspect,
      accessToken,
      title: `${slug} — autoplay ${aspect}`,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'design create failed' },
      { status: 500 }
    )
  }

  try {
    await upsertCanvaDesign(supabase, {
      slug,
      aspect,
      asset_id: assetId,
      design_id: design.designId,
      edit_url: design.editUrl,
      thumbnail_url: design.thumbnailUrl ?? assetThumb ?? null,
    })
  } catch (err) {
    // Design exists in Canva even if we failed to persist the row — surface
    // the URL anyway so the work isn't lost; next push will re-upload.
    console.error('[canva push] upsert failed:', err)
  }

  return NextResponse.json({
    ok: true,
    design_id: design.designId,
    edit_url: design.editUrl,
    thumbnail_url: design.thumbnailUrl ?? assetThumb ?? null,
    reused: false,
  })
}
