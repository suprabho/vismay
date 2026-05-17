'use client'

import { useState } from 'react'
import type { AssetRef, Channel, PostStatus, SocialPostPlan } from '@/lib/socialPostPlans'

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

export function PostCard({
  post,
  storyTitle,
  onOpen,
  onChange,
}: {
  post: SocialPostPlan
  storyTitle: string
  onOpen: () => void
  onChange: () => void
}) {
  const [busy, setBusy] = useState(false)

  async function patch(patch: { status?: PostStatus }) {
    setBusy(true)
    try {
      await fetch(`/api/admin/social/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
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
    } finally {
      setBusy(false)
    }
  }

  function stop(handler: (e: React.MouseEvent) => void) {
    return (e: React.MouseEvent) => {
      e.stopPropagation()
      handler(e)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className="border border-white/10 rounded-lg p-3 space-y-2 bg-white/[0.02] cursor-pointer hover:bg-white/[0.04] focus:outline-none focus:ring-1 focus:ring-white/20"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${CHANNEL_COLORS[post.channel]}`}
        >
          {post.channel}
        </span>
        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${STATUS_STYLES[post.status]}`}>
          {post.status}
        </span>
        {post.scheduledTime && (
          <span className="text-[11px] text-neutral-500">{post.scheduledTime.slice(0, 5)}</span>
        )}
      </div>
      <div className="text-sm font-medium text-neutral-100">{storyTitle}</div>
      <div className="text-[11px] text-neutral-500">{describeAsset(post.assetRef)}</div>
      {post.postText && (
        <div className="text-xs text-neutral-300 whitespace-pre-wrap line-clamp-3">
          {post.postText}
        </div>
      )}
      <div className="flex items-center gap-2 pt-1">
        {post.status !== 'posted' && (
          <button
            onClick={stop(() => patch({ status: 'posted' }))}
            disabled={busy}
            className="px-2 py-1 text-xs bg-emerald-600/30 text-emerald-100 hover:bg-emerald-600/40 rounded"
          >
            Mark posted
          </button>
        )}
        {post.status === 'posted' && (
          <button
            onClick={stop(() => patch({ status: 'scheduled' }))}
            disabled={busy}
            className="px-2 py-1 text-xs border border-white/10 rounded hover:bg-white/5"
          >
            Un-post
          </button>
        )}
        <button
          onClick={stop(() => remove())}
          disabled={busy}
          className="ml-auto px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 rounded"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
