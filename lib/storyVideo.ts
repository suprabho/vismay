import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export type VideoAspect = '9:16' | '16:9'

interface ChunkRow {
  chunk_index: number
  public_url: string
  duration_ms: number
}

interface CueRow {
  unit_index: number
  chunk_index: number
  start_ms: number
  end_ms: number
}

/**
 * Cache key over both chunk identity (URLs + durations) and per-cue timings
 * (unit_index/chunk_index/start_ms/end_ms). Mutating cues via the tune panel
 * writes back to story_audio_cues directly with no version flag, so the only
 * way to detect tuning is to hash the timings themselves.
 */
export function computeAudioRevisionHash(chunks: ChunkRow[], cues: CueRow[]): string {
  const payload = JSON.stringify({
    chunks: chunks.map((c) => [c.chunk_index, c.public_url, c.duration_ms]),
    cues: cues.map((c) => [c.unit_index, c.chunk_index, c.start_ms, c.end_ms]),
  })
  return crypto.createHash('sha256').update(payload).digest('hex')
}

export async function loadChunksAndCues(
  supabase: SupabaseClient,
  slug: string
): Promise<{ chunks: ChunkRow[]; cues: CueRow[] }> {
  const [chunksRes, cuesRes] = await Promise.all([
    supabase
      .from('story_audio_chunks')
      .select('chunk_index, public_url, duration_ms')
      .eq('slug', slug)
      .order('chunk_index'),
    supabase
      .from('story_audio_cues')
      .select('unit_index, chunk_index, start_ms, end_ms')
      .eq('slug', slug)
      .order('unit_index'),
  ])
  if (chunksRes.error) throw new Error(`load chunks: ${chunksRes.error.message}`)
  if (cuesRes.error) throw new Error(`load cues: ${cuesRes.error.message}`)
  return {
    chunks: (chunksRes.data ?? []) as ChunkRow[],
    cues: (cuesRes.data ?? []) as CueRow[],
  }
}

export interface CachedVideo {
  public_url: string
  audio_revision_hash: string
  duration_ms: number | null
  /** Set when an async render is dispatched and not yet completed. */
  dispatched_at: string | null
}

export async function getCachedVideo(
  supabase: SupabaseClient,
  slug: string,
  aspect: VideoAspect,
  preview: boolean = false
): Promise<CachedVideo | null> {
  const { data, error } = await supabase
    .from('story_videos')
    .select('public_url, audio_revision_hash, duration_ms, dispatched_at')
    .eq('slug', slug)
    .eq('aspect', aspect)
    .eq('preview', preview)
    .maybeSingle()
  if (error) {
    console.error(`[storyVideo] cache lookup failed: ${error.message}`)
    return null
  }
  return (data as CachedVideo | null) ?? null
}

/**
 * Window during which a stub row counts as "render in progress" — beyond
 * this we assume the workflow died (CI failure, timeout, secret rotation,
 * etc.) and let the next poll re-dispatch. Comfortably longer than any
 * legitimate render: a 17-min audio + ~3 min CI overhead = 20 min worst
 * case. Using 30 here gives a 10-min cushion.
 */
export const DISPATCH_STALE_MS = 30 * 60 * 1000

/**
 * What a `story_videos` row tells us right now.
 *
 *   - `ready`        cached MP4 exists for the current audio_revision_hash.
 *   - `rendering`    a stub row was written within DISPATCH_STALE_MS and the
 *                    real MP4 hasn't landed yet. Don't re-dispatch.
 *   - `stale`        a stub row exists but is older than DISPATCH_STALE_MS;
 *                    treat as a failed render and dispatch fresh.
 *   - `missing`      no row, or row's hash doesn't match — needs a render.
 */
export type VideoState =
  | { kind: 'ready'; row: CachedVideo }
  | { kind: 'rendering' }
  | { kind: 'stale' }
  | { kind: 'missing' }

export function classifyVideoState(
  row: CachedVideo | null,
  expectedHash: string,
  now: number = Date.now()
): VideoState {
  if (!row || row.audio_revision_hash !== expectedHash) return { kind: 'missing' }
  if (row.public_url) return { kind: 'ready', row }
  if (row.dispatched_at) {
    const age = now - new Date(row.dispatched_at).getTime()
    return age < DISPATCH_STALE_MS ? { kind: 'rendering' } : { kind: 'stale' }
  }
  return { kind: 'missing' }
}

/**
 * Insert/update a stub row marking the (slug, aspect) as in flight. Called
 * right before dispatching the GitHub Actions workflow. The renderer then
 * overwrites this row with the real `public_url` + `duration_ms` on
 * completion (see lib/storyVideoRender.ts).
 */
export async function markDispatched(
  supabase: SupabaseClient,
  args: {
    slug: string
    aspect: VideoAspect
    audioRevisionHash: string
    preview?: boolean
  }
): Promise<void> {
  const aspectKey = args.aspect === '9:16' ? '9x16' : '16x9'
  const preview = args.preview ?? false
  const storagePath = `${args.slug}/${aspectKey}${preview ? '__preview' : ''}.mp4`
  const { error } = await supabase.from('story_videos').upsert(
    {
      slug: args.slug,
      aspect: args.aspect,
      preview,
      storage_path: storagePath,
      public_url: '',
      audio_revision_hash: args.audioRevisionHash,
      duration_ms: null,
      dispatched_at: new Date().toISOString(),
    },
    { onConflict: 'slug,aspect,preview' }
  )
  if (error) throw new Error(`mark dispatched: ${error.message}`)
}
