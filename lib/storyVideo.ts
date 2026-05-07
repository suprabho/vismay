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
}

export async function getCachedVideo(
  supabase: SupabaseClient,
  slug: string,
  aspect: VideoAspect
): Promise<CachedVideo | null> {
  const { data, error } = await supabase
    .from('story_videos')
    .select('public_url, audio_revision_hash, duration_ms')
    .eq('slug', slug)
    .eq('aspect', aspect)
    .maybeSingle()
  if (error) {
    console.error(`[storyVideo] cache lookup failed: ${error.message}`)
    return null
  }
  return (data as CachedVideo | null) ?? null
}
