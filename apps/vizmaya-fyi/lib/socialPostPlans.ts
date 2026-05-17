import { createServiceClient } from './supabase'

export type Channel = 'x' | 'linkedin' | 'youtube'
export type PostStatus = 'draft' | 'scheduled' | 'posted' | 'cancelled'

export type ShareCardRatio = '1:1' | '3:4' | '4:3'
export type VideoAspect = '9:16' | '16:9'

export type AssetRef =
  | { kind: 'share_card'; slug: string; cardId: string; ratio: ShareCardRatio }
  | { kind: 'share_card_carousel'; slug: string; cardIds: string[]; ratio: ShareCardRatio }
  | { kind: 'slides_pdf'; slug: string }
  | { kind: 'autoplay_video'; slug: string; aspect: VideoAspect }

export interface SocialPostPlan {
  id: string
  scheduledDate: string // YYYY-MM-DD
  scheduledTime: string | null // HH:MM:SS
  channel: Channel
  storySlug: string | null
  assetRef: AssetRef
  postText: string
  status: PostStatus
  postedAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface NewSocialPostPlan {
  scheduledDate: string
  scheduledTime?: string | null
  channel: Channel
  storySlug: string
  assetRef: AssetRef
  postText: string
  status?: PostStatus
  notes?: string | null
}

export type UpdateSocialPostPlan = Partial<{
  scheduledDate: string
  scheduledTime: string | null
  channel: Channel
  storySlug: string | null
  assetRef: AssetRef
  postText: string
  status: PostStatus
  notes: string | null
}>

interface Row {
  id: string
  scheduled_date: string
  scheduled_time: string | null
  channel: Channel
  story_slug: string | null
  asset_ref: AssetRef
  post_text: string
  status: PostStatus
  posted_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

function rowToPlan(r: Row): SocialPostPlan {
  return {
    id: r.id,
    scheduledDate: r.scheduled_date,
    scheduledTime: r.scheduled_time,
    channel: r.channel,
    storySlug: r.story_slug,
    assetRef: r.asset_ref,
    postText: r.post_text,
    status: r.status,
    postedAt: r.posted_at,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listPostsInRange(from: string, to: string): Promise<SocialPostPlan[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('social_post_plans')
    .select('*')
    .gte('scheduled_date', from)
    .lte('scheduled_date', to)
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true, nullsFirst: true })
  if (error) throw new Error(`listPostsInRange: ${error.message}`)
  return (data as Row[]).map(rowToPlan)
}

export async function getPost(id: string): Promise<SocialPostPlan | null> {
  const sb = createServiceClient()
  const { data, error } = await sb.from('social_post_plans').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getPost: ${error.message}`)
  return data ? rowToPlan(data as Row) : null
}

export async function createPost(input: NewSocialPostPlan): Promise<SocialPostPlan> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('social_post_plans')
    .insert({
      scheduled_date: input.scheduledDate,
      scheduled_time: input.scheduledTime ?? null,
      channel: input.channel,
      story_slug: input.storySlug,
      asset_ref: input.assetRef,
      post_text: input.postText,
      status: input.status ?? 'scheduled',
      notes: input.notes ?? null,
    })
    .select('*')
    .single()
  if (error) throw new Error(`createPost: ${error.message}`)
  return rowToPlan(data as Row)
}

export async function updatePost(id: string, patch: UpdateSocialPostPlan): Promise<SocialPostPlan> {
  const sb = createServiceClient()
  const update: Record<string, unknown> = {}
  if (patch.scheduledDate !== undefined) update.scheduled_date = patch.scheduledDate
  if (patch.scheduledTime !== undefined) update.scheduled_time = patch.scheduledTime
  if (patch.channel !== undefined) update.channel = patch.channel
  if (patch.storySlug !== undefined) update.story_slug = patch.storySlug
  if (patch.assetRef !== undefined) update.asset_ref = patch.assetRef
  if (patch.postText !== undefined) update.post_text = patch.postText
  if (patch.notes !== undefined) update.notes = patch.notes
  if (patch.status !== undefined) {
    update.status = patch.status
    if (patch.status === 'posted') update.posted_at = new Date().toISOString()
    else update.posted_at = null
  }
  const { data, error } = await sb
    .from('social_post_plans')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(`updatePost: ${error.message}`)
  return rowToPlan(data as Row)
}

export async function deletePost(id: string): Promise<void> {
  const sb = createServiceClient()
  const { error } = await sb.from('social_post_plans').delete().eq('id', id)
  if (error) throw new Error(`deletePost: ${error.message}`)
}

export const CHANNEL_TEXT_LIMITS: Record<Channel, number> = {
  x: 280,
  linkedin: 3000,
  youtube: 5000,
}

export function isAssetAllowedForChannel(channel: Channel, kind: AssetRef['kind']): boolean {
  if (channel === 'x') return kind === 'share_card' || kind === 'autoplay_video'
  if (channel === 'linkedin')
    return kind === 'share_card' || kind === 'share_card_carousel' || kind === 'slides_pdf'
  if (channel === 'youtube') return kind === 'autoplay_video'
  return false
}

export function validateAssetRef(channel: Channel, ref: AssetRef): string | null {
  if (!isAssetAllowedForChannel(channel, ref.kind)) {
    return `${ref.kind} is not allowed on ${channel}`
  }
  if (ref.kind === 'share_card_carousel') {
    if (ref.cardIds.length < 1) return 'Carousel requires at least one card'
    if (ref.cardIds.length > 10) return 'Carousel limit is 10 cards (LinkedIn)'
  }
  if (ref.kind === 'autoplay_video' && channel === 'x' && ref.aspect !== '16:9') {
    return 'X only accepts 16:9 video'
  }
  return null
}
