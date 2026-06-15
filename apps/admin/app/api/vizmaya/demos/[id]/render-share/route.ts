import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { signOutputUrl } from '@vismay/admin-core/signedUrl'
import { renderSurfaceUrl } from '@/lib/publicSite'
import { getDemoById } from '@vismay/content-source/demos'
import { computeContentRevisionHash } from '@vismay/content-source/storyPdf'
import { getContentSource } from '@vismay/content-source/contentSource'
import { createServiceClient } from '@vismay/content-source/supabase'
import { renderShareAssets } from '@vismay/content-source/storyShareRender'
import {
  dispatchShareRenderJob,
  isShareDispatchConfigured,
} from '@vismay/content-source/storyShareDispatch'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id: idParam } = await params
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'bad id' }, { status: 400 })
  }

  const demo = await getDemoById(id)
  if (!demo) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const cardIds: string[] = Array.isArray(demo.share_card_ids)
    ? demo.share_card_ids
        .map((c) => {
          if (!c || typeof c !== 'object') return null
          const o = c as { parentIndex?: number; subIndex?: number; sliceIndex?: number; variant?: string }
          if (
            typeof o.parentIndex !== 'number' ||
            typeof o.subIndex !== 'number' ||
            typeof o.variant !== 'string'
          )
            return null
          const slice = typeof o.sliceIndex === 'number' ? o.sliceIndex : 0
          return `${o.parentIndex}-${o.subIndex}-${slice}-${o.variant}`
        })
        .filter((s): s is string => !!s)
    : []
  if (cardIds.length === 0) {
    return NextResponse.json({ error: 'no cards curated yet' }, { status: 400 })
  }

  // Render against the share surface — the /story/<slug>/share route is gated
  // by signed-URL middleware on the render origin, not by anything on admin's
  // host. Admin signs each ratio URL just below. Follows the `share` flip
  // (RENDER_SURFACE_URL_SHARE), vizmaya.fyi default.
  const baseUrl = renderSurfaceUrl('share')
  const supabase = createServiceClient()

  if (isShareDispatchConfigured()) {
    try {
      await dispatchShareRenderJob({
        target: { mode: 'demo', demoId: id },
        baseUrl,
      })
      return NextResponse.json({ mode: 'dispatched' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'dispatch failed'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // Sync (local dev) path.
  try {
    const source = getContentSource()
    const contentRevisionHash = await computeContentRevisionHash(source, demo.story_slug)
    const result = await renderShareAssets({
      supabase,
      demoId: id,
      storySlug: demo.story_slug,
      shareUrlFor: (ratio) =>
        signOutputUrl({
          baseUrl,
          path: `/story/${demo.story_slug}/share`,
          query: { ratio },
          ttlSeconds: 10 * 60,
        }),
      cardIds,
      contentRevisionHash,
      log: (m) => console.log(`[storyShareRender] ${m}`),
    })
    return NextResponse.json({ mode: 'sync', ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'render failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
