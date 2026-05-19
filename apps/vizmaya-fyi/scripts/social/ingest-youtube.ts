/**
 * YouTube comment ingest — pulls top-level comments + replies on the
 * configured channel's recent uploads, normalises them into the
 * engagement_event shape, and upserts.
 *
 * Run locally:  pnpm social:ingest-youtube
 * Run in CI:    .github/workflows/social-ingest-youtube.yml (every 30 min)
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   YOUTUBE_API_KEY        — Data API v3 key (read-only is fine)
 *   YOUTUBE_CHANNEL_ID     — the channel whose comments we ingest
 *
 * Quota:
 *   commentThreads.list = 1 unit/call. Per run: 1 channels.list, 1
 *   playlistItems.list, up to N commentThreads.list (one per video that
 *   has comments). At our scale this is ~30 units/run, well under the
 *   10k daily quota.
 *
 * Idempotency:
 *   `(platform, external_id)` is unique. Comment IDs are stable, so
 *   re-runs are no-ops. New replies on existing threads are picked up
 *   because each reply has its own ID.
 */

import { createServiceClient } from '@vismay/content-source/supabase'
import { upsertEvents, type NormalizedEvent } from '@vismay/content-source/socialEngagement'

const API = 'https://www.googleapis.com/youtube/v3'

interface YtComment {
  id: string
  snippet: {
    textOriginal: string
    authorDisplayName: string
    authorChannelUrl?: string
    authorChannelId?: { value: string }
    likeCount?: number
    publishedAt: string
    parentId?: string
  }
}

interface YtCommentThread {
  id: string
  snippet: {
    videoId: string
    totalReplyCount: number
    topLevelComment: YtComment
  }
  replies?: { comments: YtComment[] }
}

interface YtVideo {
  videoId: string
  title: string
  publishedAt: string
}

async function ytFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const u = new URL(`${API}/${path}`)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  u.searchParams.set('key', process.env.YOUTUBE_API_KEY!)
  const res = await fetch(u.toString())
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`YT ${path} ${res.status}: ${body.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

async function getUploadsPlaylist(channelId: string): Promise<string> {
  const r = await ytFetch<{ items: { contentDetails: { relatedPlaylists: { uploads: string } } }[] }>(
    'channels',
    { part: 'contentDetails', id: channelId }
  )
  const uploads = r.items[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!uploads) throw new Error(`No uploads playlist for channel ${channelId}`)
  return uploads
}

async function listRecentVideos(uploadsPlaylistId: string, limit = 50): Promise<YtVideo[]> {
  const r = await ytFetch<{
    items: { snippet: { resourceId: { videoId: string }; title: string; publishedAt: string } }[]
  }>('playlistItems', {
    part: 'snippet',
    playlistId: uploadsPlaylistId,
    maxResults: String(Math.min(limit, 50)),
  })
  return r.items.map((it) => ({
    videoId: it.snippet.resourceId.videoId,
    title: it.snippet.title,
    publishedAt: it.snippet.publishedAt,
  }))
}

async function listCommentThreadsForVideo(videoId: string): Promise<YtCommentThread[]> {
  const all: YtCommentThread[] = []
  let pageToken: string | undefined
  // Cap at 2 pages (200 comments / video) so a viral video doesn't blow quota.
  for (let page = 0; page < 2; page++) {
    const params: Record<string, string> = {
      part: 'snippet,replies',
      videoId,
      order: 'time',
      maxResults: '100',
    }
    if (pageToken) params.pageToken = pageToken
    try {
      const r = await ytFetch<{ items: YtCommentThread[]; nextPageToken?: string }>(
        'commentThreads',
        params
      )
      all.push(...r.items)
      if (!r.nextPageToken) break
      pageToken = r.nextPageToken
    } catch (err) {
      // commentsDisabled videos throw 403 — skip silently.
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('commentsDisabled') || msg.includes('403')) return all
      throw err
    }
  }
  return all
}

function normalizeComment(c: YtComment, video: YtVideo): NormalizedEvent {
  const channelId = c.snippet.authorChannelId?.value
  return {
    platform: 'youtube',
    external_id: c.id,
    type: c.snippet.parentId ? 'reply' : 'comment',
    source_url: `https://www.youtube.com/watch?v=${video.videoId}&lc=${c.id}`,
    author_handle: c.snippet.authorDisplayName,
    author_metadata: {
      channel_url: c.snippet.authorChannelUrl,
      channel_id: channelId,
      like_count: c.snippet.likeCount,
    },
    content: c.snippet.textOriginal,
    created_at: c.snippet.publishedAt,
    parent_external_id: video.videoId,
    parent_url: `https://www.youtube.com/watch?v=${video.videoId}`,
    parent_content: video.title,
  }
}

async function main() {
  const apiKey = process.env.YOUTUBE_API_KEY
  const channelId = process.env.YOUTUBE_CHANNEL_ID
  if (!apiKey) throw new Error('YOUTUBE_API_KEY not set')
  if (!channelId) throw new Error('YOUTUBE_CHANNEL_ID not set')

  const sb = createServiceClient()

  console.log(`Channel: ${channelId}`)
  const uploadsId = await getUploadsPlaylist(channelId)
  const videos = await listRecentVideos(uploadsId, 50)
  console.log(`Found ${videos.length} recent uploads`)

  let totalEvents = 0
  let totalWritten = 0
  for (const v of videos) {
    const threads = await listCommentThreadsForVideo(v.videoId)
    const events: NormalizedEvent[] = []
    for (const t of threads) {
      events.push(normalizeComment(t.snippet.topLevelComment, v))
      for (const r of t.replies?.comments ?? []) {
        events.push(normalizeComment(r, v))
      }
    }
    if (events.length === 0) continue

    // Upsert in batches of 100 to stay well under PostgREST's payload cap.
    const BATCH = 100
    let written = 0
    for (let i = 0; i < events.length; i += BATCH) {
      written += await upsertEvents(events.slice(i, i + BATCH), sb)
    }
    totalEvents += events.length
    totalWritten += written
    console.log(`  ${v.videoId}: ${events.length} comments (${written} written) — ${v.title}`)
  }

  console.log(`\nDone. ${totalWritten}/${totalEvents} rows upserted across ${videos.length} videos.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
