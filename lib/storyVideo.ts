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
 * Bump when the render pipeline changes the visual output of cached MP4s
 * (composition, layout, capture URL, render-script behavior). All existing
 * `story_videos` rows will mismatch on the next request and re-render.
 *
 *   v1 — initial pipeline
 *   v2 — 9:16 composes content into a 4:5 central band with the story's
 *        aura behind, via ?compose=vertical (storyVideoRender.ts). The
 *        inner story is embedded in an iframe so its `h-svh` sections lay
 *        out for the 4:5 viewport instead of clipping a 9:16 layout.
 *   v3 — cache key shifts from (slug, aspect, preview) to
 *        (slug, aspect, range_start_ms, range_end_ms). Any backfilled rows
 *        with placeholder range_end_ms=0 fall through to a fresh render.
 */
export const RENDER_PIPELINE_VERSION = 'v3'

export interface VideoRange {
  startMs: number
  endMs: number
}

export interface Timeline {
  totalMs: number
  /** Absolute offset (in ms) from t=0 to the start of each chunk. */
  chunkOffsetMs: Map<number, number>
}

/**
 * Prefix-sum the chunk durations into a cumulative timeline. Cue absolute
 * positions are `chunkOffsetMs[cue.chunk_index] + cue.start_ms` and similarly
 * for end_ms; `totalMs` is the sum of all chunk durations. Used by the
 * renderer's walk loop, by the API route for range validation, and by the
 * `/timeline` admin endpoint.
 */
export function computeTimeline(chunks: ChunkRow[]): Timeline {
  const offset = new Map<number, number>()
  let total = 0
  for (const c of [...chunks].sort((a, b) => a.chunk_index - b.chunk_index)) {
    offset.set(c.chunk_index, total)
    total += c.duration_ms
  }
  return { totalMs: total, chunkOffsetMs: offset }
}

/**
 * Cache key over chunk identity (URLs + durations), per-cue timings, and
 * the current pipeline version. Mutating cues via the tune panel writes back
 * to story_audio_cues directly with no version flag, so the only way to
 * detect tuning is to hash the timings themselves; the pipeline-version
 * suffix lets composition/render changes invalidate the cache too.
 */
export function computeAudioRevisionHash(chunks: ChunkRow[], cues: CueRow[]): string {
  const payload = JSON.stringify({
    pipeline: RENDER_PIPELINE_VERSION,
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

/**
 * Convenience for callers that just want the canonical full-length render
 * (e.g. the admin video panel, the Canva push). Loads chunks to compute
 * `totalMs`, then looks up the `(slug, aspect, 0, totalMs)` row. Returns
 * `null` if no audio exists for the slug or no matching row is cached.
 */
export async function getFullVideo(
  supabase: SupabaseClient,
  slug: string,
  aspect: VideoAspect
): Promise<CachedVideo | null> {
  const { chunks } = await loadChunksAndCues(supabase, slug)
  if (chunks.length === 0) return null
  const { totalMs } = computeTimeline(chunks)
  return getCachedVideo(supabase, slug, aspect, { startMs: 0, endMs: totalMs })
}

export async function getCachedVideo(
  supabase: SupabaseClient,
  slug: string,
  aspect: VideoAspect,
  range: VideoRange
): Promise<CachedVideo | null> {
  const { data, error } = await supabase
    .from('story_videos')
    .select('public_url, audio_revision_hash, duration_ms, dispatched_at')
    .eq('slug', slug)
    .eq('aspect', aspect)
    .eq('range_start_ms', range.startMs)
    .eq('range_end_ms', range.endMs)
    .maybeSingle()
  if (error) {
    console.error(`[storyVideo] cache lookup failed: ${error.message}`)
    return null
  }
  return (data as CachedVideo | null) ?? null
}

/**
 * List range renders (i.e. non-full sub-clips) for a slug. The "full" render
 * is the row whose range covers the whole timeline — we identify it by
 * `range_start_ms = 0 AND range_end_ms = totalMs`. Anything else is a variant
 * surfaced in the admin Range-renders panel.
 */
export interface RangeRenderRow {
  aspect: VideoAspect
  range_start_ms: number
  range_end_ms: number
  public_url: string
  duration_ms: number | null
  audio_revision_hash: string
  dispatched_at: string | null
  created_at: string | null
}

export async function listRangeRenders(
  supabase: SupabaseClient,
  slug: string,
  fullEndMs: number
): Promise<RangeRenderRow[]> {
  const { data, error } = await supabase
    .from('story_videos')
    .select(
      'aspect, range_start_ms, range_end_ms, public_url, duration_ms, audio_revision_hash, dispatched_at, created_at'
    )
    .eq('slug', slug)
    .order('range_start_ms', { ascending: true })
  if (error) {
    console.error(`[storyVideo] list ranges failed: ${error.message}`)
    return []
  }
  const rows = (data as RangeRenderRow[]) ?? []
  return rows.filter(
    (r) => !(r.range_start_ms === 0 && r.range_end_ms === fullEndMs)
  )
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
 * Storage path for a render. Full renders use the legacy `<slug>/<aspect>.mp4`
 * shape so existing public URLs stay readable; sub-range renders get a
 * `__<startMs>-<endMs>` suffix.
 */
export function videoStoragePath(
  slug: string,
  aspect: VideoAspect,
  range: VideoRange,
  totalMs: number
): string {
  const aspectKey = aspect === '9:16' ? '9x16' : '16x9'
  const isFull = range.startMs === 0 && range.endMs === totalMs
  if (isFull) return `${slug}/${aspectKey}.mp4`
  return `${slug}/${aspectKey}__${range.startMs}-${range.endMs}.mp4`
}

/**
 * Insert/update a stub row marking the (slug, aspect, range) as in flight.
 * Called right before dispatching the GitHub Actions workflow. The renderer
 * then overwrites this row with the real `public_url` + `duration_ms` on
 * completion (see lib/storyVideoRender.ts).
 */
export async function markDispatched(
  supabase: SupabaseClient,
  args: {
    slug: string
    aspect: VideoAspect
    audioRevisionHash: string
    range: VideoRange
    totalMs: number
  }
): Promise<void> {
  const storagePath = videoStoragePath(args.slug, args.aspect, args.range, args.totalMs)
  const { error } = await supabase.from('story_videos').upsert(
    {
      slug: args.slug,
      aspect: args.aspect,
      range_start_ms: args.range.startMs,
      range_end_ms: args.range.endMs,
      storage_path: storagePath,
      public_url: '',
      audio_revision_hash: args.audioRevisionHash,
      duration_ms: null,
      dispatched_at: new Date().toISOString(),
    },
    { onConflict: 'slug,aspect,range_start_ms,range_end_ms' }
  )
  if (error) throw new Error(`mark dispatched: ${error.message}`)
}
