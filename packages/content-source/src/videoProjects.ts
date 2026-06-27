import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from './supabase'
import { RENDER_PIPELINE_VERSION } from './storyVideo'

/**
 * Freeform video-editor projects — the library behind the admin "Video" mode
 * ( apps/admin/components/vizmaya/video/ ) and the headless render surface.
 *
 * A project is an opaque snapshot (`config`, typed `VideoProjectSnapshot` in
 * @vismay/viz-admin but treated as JSON here, exactly like vizmayaShareCards)
 * plus a little metadata for listing. `video_project_renders` caches MP4 output
 * keyed on a content hash of the snapshot, mirroring `story_videos`. See
 * migration `063_video_projects.sql`.
 */

export type VideoProjectAspect = '9:16' | '16:9'

/** Reuse the story-video bucket — no new storage infra needed. */
const VIDEO_BUCKET = 'story-video'

export interface SavedVideoProject {
  id: string
  name: string
  aspect: string | null
  config: unknown
  durationMs: number | null
  thumbUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface NewVideoProject {
  name: string
  aspect?: string | null
  config: unknown
  durationMs?: number | null
}

export interface UpdateVideoProject {
  name?: string
  aspect?: string | null
  config?: unknown
  durationMs?: number | null
}

interface Row {
  id: string
  name: string
  aspect: string | null
  config: unknown
  duration_ms: number | null
  thumb_url: string | null
  created_at: string
  updated_at: string
}

function rowToProject(r: Row): SavedVideoProject {
  return {
    id: r.id,
    name: r.name,
    aspect: r.aspect,
    config: r.config,
    durationMs: r.duration_ms,
    thumbUrl: r.thumb_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/* ─── CRUD ───────────────────────────────────────────────────────────── */

export async function listVideoProjects(opts: { limit?: number } = {}): Promise<SavedVideoProject[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('video_projects')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100)
  if (error) throw new Error(`listVideoProjects: ${error.message}`)
  return (data as Row[]).map(rowToProject)
}

export async function getVideoProject(id: string): Promise<SavedVideoProject | null> {
  const sb = createServiceClient()
  const { data, error } = await sb.from('video_projects').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getVideoProject: ${error.message}`)
  return data ? rowToProject(data as Row) : null
}

export async function createVideoProject(input: NewVideoProject): Promise<SavedVideoProject> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('video_projects')
    .insert({
      name: input.name,
      aspect: input.aspect ?? null,
      config: input.config,
      duration_ms: input.durationMs ?? null,
    })
    .select('*')
    .single()
  if (error) throw new Error(`createVideoProject: ${error.message}`)
  return rowToProject(data as Row)
}

export async function updateVideoProject(id: string, patch: UpdateVideoProject): Promise<SavedVideoProject> {
  const sb = createServiceClient()
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name
  if (patch.aspect !== undefined) update.aspect = patch.aspect
  if (patch.config !== undefined) update.config = patch.config
  if (patch.durationMs !== undefined) update.duration_ms = patch.durationMs
  const { data, error } = await sb
    .from('video_projects')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(`updateVideoProject: ${error.message}`)
  return rowToProject(data as Row)
}

export async function deleteVideoProject(id: string): Promise<void> {
  const sb = createServiceClient()
  const { error } = await sb.from('video_projects').delete().eq('id', id)
  if (error) throw new Error(`deleteVideoProject: ${error.message}`)
}

/* ─── Render cache ───────────────────────────────────────────────────── */

/**
 * Content hash over the snapshot + pipeline version. Any edit to the project
 * (clips, transforms, anims, audio) changes the hash and invalidates the cache,
 * exactly like `computeAudioRevisionHash` for stories.
 */
export function computeProjectHash(config: unknown, aspect: VideoProjectAspect): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ pipeline: RENDER_PIPELINE_VERSION, aspect, config }))
    .digest('hex')
}

export interface CachedProjectRender {
  public_url: string
  snapshot_hash: string
  duration_ms: number | null
  dispatched_at: string | null
}

export async function getCachedProjectRender(
  supabase: SupabaseClient,
  projectId: string,
  aspect: VideoProjectAspect,
  snapshotHash: string,
): Promise<CachedProjectRender | null> {
  const { data, error } = await supabase
    .from('video_project_renders')
    .select('public_url, snapshot_hash, duration_ms, dispatched_at')
    .eq('project_id', projectId)
    .eq('aspect', aspect)
    .eq('snapshot_hash', snapshotHash)
    .maybeSingle()
  if (error) {
    console.error(`[videoProjects] cache lookup failed: ${error.message}`)
    return null
  }
  return (data as CachedProjectRender | null) ?? null
}

/** Storage path for a project render: `projects/<id>/<aspect>__<hash>.mp4`. */
export function projectVideoStoragePath(
  projectId: string,
  aspect: VideoProjectAspect,
  snapshotHash: string,
): string {
  const aspectKey = aspect === '9:16' ? '9x16' : '16x9'
  return `projects/${projectId}/${aspectKey}__${snapshotHash.slice(0, 16)}.mp4`
}

export function projectVideoBucket(): string {
  return VIDEO_BUCKET
}

async function upsertRenderRow(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('video_project_renders')
    .upsert(row, { onConflict: 'project_id,aspect,snapshot_hash' })
  if (error) throw new Error(`upsert project render: ${error.message}`)
}

/** Mark a render in flight before dispatching to GitHub Actions. */
export async function markProjectDispatched(
  supabase: SupabaseClient,
  args: { projectId: string; aspect: VideoProjectAspect; snapshotHash: string },
): Promise<void> {
  await upsertRenderRow(supabase, {
    project_id: args.projectId,
    aspect: args.aspect,
    snapshot_hash: args.snapshotHash,
    storage_path: projectVideoStoragePath(args.projectId, args.aspect, args.snapshotHash),
    public_url: '',
    duration_ms: null,
    dispatched_at: new Date().toISOString(),
  })
}

/** Record a completed render (called by the renderer after upload). */
export async function recordProjectRender(
  supabase: SupabaseClient,
  args: {
    projectId: string
    aspect: VideoProjectAspect
    snapshotHash: string
    storagePath: string
    publicUrl: string
    durationMs: number
  },
): Promise<void> {
  await upsertRenderRow(supabase, {
    project_id: args.projectId,
    aspect: args.aspect,
    snapshot_hash: args.snapshotHash,
    storage_path: args.storagePath,
    public_url: args.publicUrl,
    duration_ms: args.durationMs,
    dispatched_at: null,
  })
}

/** Same staleness window + classification as story videos. */
export const DISPATCH_STALE_MS = 30 * 60 * 1000

export type ProjectRenderState =
  | { kind: 'ready'; row: CachedProjectRender }
  | { kind: 'rendering' }
  | { kind: 'stale' }
  | { kind: 'missing' }

export function classifyProjectRenderState(
  row: CachedProjectRender | null,
  expectedHash: string,
  now: number = Date.now(),
): ProjectRenderState {
  if (!row || row.snapshot_hash !== expectedHash) return { kind: 'missing' }
  if (row.public_url) return { kind: 'ready', row }
  if (row.dispatched_at) {
    const age = now - new Date(row.dispatched_at).getTime()
    return age < DISPATCH_STALE_MS ? { kind: 'rendering' } : { kind: 'stale' }
  }
  return { kind: 'missing' }
}
