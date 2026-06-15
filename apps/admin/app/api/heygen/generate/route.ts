import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'
import {
  isHeygenConfigured,
  generateFromTemplate,
  HeygenApiError,
  type HeygenVariable,
} from '@vismay/content-source/heygenTemplate'
import { insertHeygenRender } from '@vismay/content-source/heygenRenders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/

interface GenerateBody {
  templateId: string
  variables: Record<string, HeygenVariable>
  slug: string
  appSlug?: string
  title?: string
  dimension?: { width: number; height: number }
  test?: boolean
}

/**
 * Kick off a HeyGen template render and stub a `heygen_renders` row.
 *
 * HeyGen renders take minutes, so we return the `videoId` immediately and let
 * the client poll `/api/heygen/status/[videoId]` — which is also where the
 * finished MP4 gets downloaded and persisted. This keeps every request well
 * inside the serverless time limit.
 */
export async function POST(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!isHeygenConfigured()) {
    return NextResponse.json({ error: 'HeyGen not configured' }, { status: 503 })
  }

  let body: GenerateBody
  try {
    body = (await req.json()) as GenerateBody
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }

  const templateId = typeof body.templateId === 'string' ? body.templateId.trim() : ''
  if (!templateId) {
    return NextResponse.json({ error: 'missing "templateId"' }, { status: 400 })
  }
  const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
  if (!slug || !SAFE_SLUG.test(slug)) {
    return NextResponse.json({ error: 'missing or invalid "slug"' }, { status: 400 })
  }
  if (!body.variables || typeof body.variables !== 'object') {
    return NextResponse.json({ error: 'missing "variables"' }, { status: 400 })
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

  // Generate first — no point inserting a stub row if HeyGen rejects the call.
  let videoId: string
  try {
    const out = await generateFromTemplate({
      templateId,
      variables: body.variables,
      title: body.title,
      dimension: body.dimension,
      test: body.test,
    })
    videoId = out.videoId
  } catch (e) {
    const status = e instanceof HeygenApiError ? 502 : 500
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'HeyGen generate failed' },
      { status },
    )
  }

  try {
    await insertHeygenRender(supabase, {
      videoId,
      slug,
      appSlug: body.appSlug ?? null,
      templateId,
      title: body.title ?? null,
      variables: body.variables,
      dimension: body.dimension ?? null,
      test: body.test ?? false,
      status: 'pending',
    })
  } catch (e) {
    // The render is already running on HeyGen's side; surface the persistence
    // failure but still hand back the videoId so the client can keep polling.
    return NextResponse.json(
      {
        videoId,
        warning: e instanceof Error ? e.message : 'failed to record render',
      },
      { status: 200 },
    )
  }

  return NextResponse.json({ videoId })
}
