'use client'

import type { AssetRef, SocialPostPlan } from '@/lib/socialPostPlans'

function describeAsset(ref: AssetRef): string {
  if (ref.kind === 'share_card') return `Share card · ${ref.cardId} (${ref.ratio})`
  if (ref.kind === 'share_card_carousel')
    return `Carousel · ${ref.cardIds.length} cards (${ref.ratio})`
  if (ref.kind === 'slides_pdf') return `Slides PDF`
  if (ref.kind === 'autoplay_video') return `Autoplay video · ${ref.aspect}`
  return ''
}

export function PostOverview({
  post,
  storyTitle,
}: {
  post: SocialPostPlan
  storyTitle: string
}) {
  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Story</div>
        <div className="text-sm text-neutral-100">{storyTitle}</div>
        <div className="text-[11px] text-neutral-500 mt-0.5">{describeAsset(post.assetRef)}</div>
      </div>

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
  )
}
