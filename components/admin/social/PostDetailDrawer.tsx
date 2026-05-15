'use client'

import { useState } from 'react'
import type { AssetRef, Channel, PostStatus, SocialPostPlan } from '@/lib/socialPostPlans'
import { SharePostRenderPanel } from './SharePostRenderPanel'
import { VideoPostRenderPanel } from './VideoPostRenderPanel'
import { SlidesPostRenderPanel } from './SlidesPostRenderPanel'

const CHANNEL_COLORS: Record<Channel, string> = {
  x: 'bg-sky-500/15 text-sky-200 border-sky-500/30',
  linkedin: 'bg-blue-600/20 text-blue-200 border-blue-600/30',
  youtube: 'bg-red-500/20 text-red-200 border-red-500/30',
}

const STATUS_STYLES: Record<PostStatus, string> = {
  draft: 'bg-white/5 text-neutral-300 border border-dashed border-white/20',
  scheduled: 'bg-amber-500/20 text-amber-200',
  posted: 'bg-emerald-500/20 text-emerald-200',
  cancelled: 'bg-neutral-500/20 text-neutral-400 line-through',
}

function describeAsset(ref: AssetRef): string {
  if (ref.kind === 'share_card') return `Share card · ${ref.cardId} (${ref.ratio})`
  if (ref.kind === 'share_card_carousel')
    return `Carousel · ${ref.cardIds.length} cards (${ref.ratio})`
  if (ref.kind === 'slides_pdf') return `Slides PDF`
  if (ref.kind === 'autoplay_video') return `Autoplay video · ${ref.aspect}`
  return ''
}

export function PostDetailDrawer({
  post,
  storyTitle,
  onClose,
  onEdit,
  onChange,
}: {
  post: SocialPostPlan
  storyTitle: string
  onClose: () => void
  onEdit: () => void
  onChange: () => void
}) {
  const [busy, setBusy] = useState(false)

  async function patch(p: { status?: PostStatus }) {
    setBusy(true)
    try {
      await fetch(`/api/admin/social/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(p),
      })
      onChange()
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm('Delete this post?')) return
    setBusy(true)
    try {
      await fetch(`/api/admin/social/posts/${post.id}`, { method: 'DELETE' })
      onChange()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-stretch justify-end" onClick={onClose}>
      <div
        className="bg-neutral-950 border-l border-white/10 w-full max-w-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <div className="min-w-0 flex items-center gap-2 flex-wrap">
            <span
              className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${CHANNEL_COLORS[post.channel]}`}
            >
              {post.channel}
            </span>
            <span
              className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${STATUS_STYLES[post.status]}`}
            >
              {post.status}
            </span>
            <span className="text-[11px] text-neutral-500">
              {post.scheduledDate}
              {post.scheduledTime ? ` · ${post.scheduledTime.slice(0, 5)}` : ''}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white text-xl leading-none px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Story</div>
            <div className="text-sm text-neutral-100">{storyTitle}</div>
            <div className="text-[11px] text-neutral-500 mt-0.5">{describeAsset(post.assetRef)}</div>
          </div>

          {/* Asset-specific render panel */}
          {post.storySlug ? (
            <RenderPanel post={post} storySlug={post.storySlug} />
          ) : (
            <div className="text-[11px] text-neutral-500 border border-dashed border-white/10 rounded p-3">
              No story is linked to this post — render and editor links are unavailable.
            </div>
          )}

          {post.postText && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Post text</div>
              <div className="text-xs text-neutral-200 whitespace-pre-wrap border border-white/5 rounded p-2 bg-white/[0.02]">
                {post.postText}
              </div>
            </div>
          )}

          {post.notes && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Notes</div>
              <div className="text-xs text-neutral-300 whitespace-pre-wrap">{post.notes}</div>
            </div>
          )}
        </div>

        <div className="shrink-0 px-4 py-3 border-t border-white/5 flex items-center gap-2">
          <button
            onClick={onEdit}
            disabled={busy}
            className="px-3 py-1.5 text-sm border border-white/10 rounded hover:bg-white/5"
          >
            Edit
          </button>
          {post.status !== 'posted' ? (
            <button
              onClick={() => patch({ status: 'posted' })}
              disabled={busy}
              className="px-3 py-1.5 text-sm bg-emerald-600/30 text-emerald-100 hover:bg-emerald-600/40 rounded"
            >
              Mark posted
            </button>
          ) : (
            <button
              onClick={() => patch({ status: 'scheduled' })}
              disabled={busy}
              className="px-3 py-1.5 text-sm border border-white/10 rounded hover:bg-white/5"
            >
              Un-post
            </button>
          )}
          <button
            onClick={remove}
            disabled={busy}
            className="ml-auto px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10 rounded"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

function RenderPanel({ post, storySlug }: { post: SocialPostPlan; storySlug: string }) {
  const ref = post.assetRef
  if (ref.kind === 'share_card') {
    return (
      <SharePostRenderPanel
        postId={post.id}
        expectedCardIds={[ref.cardId]}
        ratio={ref.ratio}
      />
    )
  }
  if (ref.kind === 'share_card_carousel') {
    return (
      <SharePostRenderPanel
        postId={post.id}
        expectedCardIds={ref.cardIds}
        ratio={ref.ratio}
      />
    )
  }
  if (ref.kind === 'autoplay_video') {
    return <VideoPostRenderPanel slug={storySlug} aspect={ref.aspect} />
  }
  if (ref.kind === 'slides_pdf') {
    return <SlidesPostRenderPanel slug={storySlug} />
  }
  return null
}
