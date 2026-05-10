import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { getDemoById } from '@/lib/demos'
import { computeContentRevisionHash } from '@/lib/storyPdf'
import { getContentSource } from '@/lib/contentSource'
import { createServiceClient } from '@/lib/supabase'
import { renderShareAssets } from '@/lib/storyShareRender'
import {
  dispatchShareRenderJob,
  isShareDispatchConfigured,
} from '@/lib/storyShareDispatch'

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

  const url = new URL(req.url)
  const baseUrl = `${url.protocol}//${url.host}`
  const supabase = createServiceClient()

  if (isShareDispatchConfigured()) {
    try {
      await dispatchShareRenderJob({ demoId: id, baseUrl })
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
      baseUrl,
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
