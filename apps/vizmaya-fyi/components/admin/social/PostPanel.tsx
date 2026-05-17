'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Channel, PostStatus, SocialPostPlan } from '@/lib/socialPostPlans'
import { PostEditForm } from './PostEditForm'
import { PostOverview } from './PostOverview'
import { SharePostRenderPanel } from './SharePostRenderPanel'
import { VideoPostRenderPanel } from './VideoPostRenderPanel'
import { SlidesPostRenderPanel } from './SlidesPostRenderPanel'
import type { StoryOption } from './PlannerClient'

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

export type PanelTab = 'details' | 'edit' | 'render'

export type PanelState =
  | { mode: 'new'; date: string }
  | { mode: 'existing'; postId: string; initialTab: PanelTab }

export function PostPanel({
  panel,
  posts,
  stories,
  onClose,
  onChange,
}: {
  panel: PanelState
  posts: SocialPostPlan[]
  stories: StoryOption[]
  onClose: () => void
  onChange: () => void
}) {
  const post = useMemo<SocialPostPlan | null>(() => {
    if (panel.mode !== 'existing') return null
    return posts.find((p) => p.id === panel.postId) ?? null
  }, [panel, posts])

  const [activeTab, setActiveTab] = useState<PanelTab>(
    panel.mode === 'new' ? 'edit' : panel.initialTab,
  )
  const [busy, setBusy] = useState(false)

  // If the post we're viewing was deleted (refresh returned without it), close.
  useEffect(() => {
    if (panel.mode === 'existing' && !post) {
      onClose()
    }
  }, [panel.mode, post, onClose])

  const storyTitle = useMemo(() => {
    if (!post) return ''
    if (!post.storySlug) return '(story removed)'
    return stories.find((s) => s.slug === post.storySlug)?.title ?? post.storySlug
  }, [post, stories])

  async function patch(p: { status?: PostStatus }) {
    if (!post) return
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
    if (!post) return
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

  function handleSaved() {
    if (panel.mode === 'new') {
      onChange()
      onClose()
    } else {
      onChange()
      setActiveTab('details')
    }
  }

  const header = post ? (
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
  ) : (
    <h2 className="text-sm font-semibold">New post</h2>
  )

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-stretch justify-end"
      onClick={onClose}
    >
      <div
        className="bg-neutral-950 border-l border-white/10 w-full max-w-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
          {header}
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white text-xl leading-none px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {panel.mode === 'existing' && (
          <div className="shrink-0 px-2 pt-2 border-b border-white/5 flex items-center gap-1">
            <TabButton active={activeTab === 'details'} onClick={() => setActiveTab('details')}>
              Details
            </TabButton>
            <TabButton active={activeTab === 'edit'} onClick={() => setActiveTab('edit')}>
              Edit
            </TabButton>
            <TabButton active={activeTab === 'render'} onClick={() => setActiveTab('render')}>
              Render
            </TabButton>
          </div>
        )}

        {/* Tab bodies — keep Edit mounted so user doesn't lose draft state when switching tabs */}
        <div className="flex-1 min-h-0 flex flex-col">
          {panel.mode === 'existing' && post && activeTab === 'details' && (
            <>
              <PostOverview post={post} storyTitle={storyTitle} />
              <div className="shrink-0 px-4 py-3 border-t border-white/5 flex items-center gap-2">
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
            </>
          )}

          {activeTab === 'edit' && (
            <PostEditForm
              stories={stories}
              initialDate={panel.mode === 'new' ? panel.date : (post?.scheduledDate ?? '')}
              editing={post}
              onSaved={handleSaved}
            />
          )}

          {panel.mode === 'existing' && post && activeTab === 'render' && (
            <div className="flex-1 overflow-auto p-4">
              <RenderTab post={post} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs rounded-t border-b-2 -mb-px ${
        active
          ? 'border-white text-white'
          : 'border-transparent text-neutral-400 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function RenderTab({ post }: { post: SocialPostPlan }) {
  if (!post.storySlug) {
    return (
      <div className="text-[11px] text-neutral-500 border border-dashed border-white/10 rounded p-3">
        No story is linked to this post — render and editor links are unavailable.
      </div>
    )
  }
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
    return <VideoPostRenderPanel slug={post.storySlug} aspect={ref.aspect} />
  }
  if (ref.kind === 'slides_pdf') {
    return <SlidesPostRenderPanel slug={post.storySlug} />
  }
  return null
}
