import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { getPost } from '@/lib/socialPostPlans'
import { computeContentRevisionHash } from '@/lib/storyPdf'
import { getContentSource } from '@/lib/contentSource'
import { createServiceClient } from '@/lib/supabase'
import {
  renderShareAssets,
  type ShareRatio,
} from '@/lib/storyShareRender'
import {
  dispatchShareRenderJob,
  isShareDispatchConfigured,
} from '@/lib/storyShareDispatch'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

interface ShareTarget {
  storySlug: string
  cardIds: string[]
  ratio: ShareRatio
}

function shareTargetForPost(
  ref: { kind: string } & Record<string, unknown>,
  storySlug: string
): ShareTarget | null {
  if (ref.kind === 'share_card') {
    const cardId = (ref as { cardId?: string }).cardId
    const ratio = (ref as { ratio?: string }).ratio as ShareRatio | undefined
    if (!cardId || !ratio) return null
    return { storySlug, cardIds: [cardId], ratio }
  }
  if (ref.kind === 'share_card_carousel') {
    const cardIds = (ref as { cardIds?: string[] }).cardIds
    const ratio = (ref as { ratio?: string }).ratio as ShareRatio | undefined
    if (!Array.isArray(cardIds) || cardIds.length === 0 || !ratio) return null
    return { storySlug, cardIds, ratio }
  }
  return null
}

/**
 * POST /api/admin/social/posts/[id]/render-share
 *
 * Renders only the cards this post references, at the post's ratio.
 * Returns `{ mode: 'sync' | 'dispatched' }` matching the demo route shape.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'bad id' }, { status: 400 })

  const post = await getPost(id)
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!post.storySlug) {
    return NextResponse.json({ error: 'post has no story_slug' }, { status: 400 })
  }
  const target = shareTargetForPost(post.assetRef, post.storySlug)
  if (!target) {
    return NextResponse.json(
      { error: `assetRef.kind=${post.assetRef.kind} is not a share asset` },
      { status: 400 }
    )
  }

  const url = new URL(req.url)
  const baseUrl = `${url.protocol}//${url.host}`
  const supabase = createServiceClient()

  if (isShareDispatchConfigured()) {
    try {
      await dispatchShareRenderJob({
        target: { mode: 'post', postId: id },
        baseUrl,
      })
      return NextResponse.json({ mode: 'dispatched' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'dispatch failed'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  try {
    const source = getContentSource()
    const contentRevisionHash = await computeContentRevisionHash(
      source,
      target.storySlug
    )
    const result = await renderShareAssets({
      supabase,
      demoId: null,
      storySlug: target.storySlug,
      baseUrl,
      cardIds: target.cardIds,
      ratios: [target.ratio],
      contentRevisionHash,
      log: (m) => console.log(`[storyShareRender:post] ${m}`),
    })
    return NextResponse.json({ mode: 'sync', ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'render failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET /api/admin/social/posts/[id]/render-share
 *
 * Returns current render state for the cards this post needs:
 *   { status: 'ready' | 'partial' | 'idle',
 *     expected: number, rendered: number,
 *     assets: [{ cardId, ratio, public_url, fresh }] }
 *
 * `fresh = true` iff the row's content_revision_hash equals the current
 * computed hash. A row with a stale hash is reported but counted as not
 * yet rendered for the purpose of the status decision.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'bad id' }, { status: 400 })

  const post = await getPost(id)
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!post.storySlug) {
    return NextResponse.json({ error: 'post has no story_slug' }, { status: 400 })
  }
  const target = shareTargetForPost(post.assetRef, post.storySlug)
  if (!target) {
    return NextResponse.json(
      { error: `assetRef.kind=${post.assetRef.kind} is not a share asset` },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  const source = getContentSource()
  const currentHash = await computeContentRevisionHash(source, target.storySlug)

  const { data, error } = await supabase
    .from('story_share_assets')
    .select('card_id, ratio, public_url, content_revision_hash')
    .eq('story_slug', target.storySlug)
    .in('card_id', target.cardIds)
    .eq('ratio', target.ratio)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as Array<{
    card_id: string
    ratio: string
    public_url: string
    content_revision_hash: string
  }>
  const byCard = new Map(rows.map((r) => [r.card_id, r]))
  const assets = target.cardIds.map((cardId) => {
    const row = byCard.get(cardId)
    return {
      cardId,
      ratio: target.ratio,
      public_url: row?.public_url ?? null,
      fresh: row?.content_revision_hash === currentHash,
    }
  })
  const freshCount = assets.filter((a) => a.fresh).length
  const status: 'ready' | 'partial' | 'idle' =
    freshCount === assets.length
      ? 'ready'
      : freshCount === 0
        ? 'idle'
        : 'partial'

  return NextResponse.json({
    status,
    expected: assets.length,
    rendered: freshCount,
    assets,
  })
}
