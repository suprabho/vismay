/**
 * `story_sources` table + `story-sources` bucket accessors (migration 056).
 *
 * One row per uploaded file / pasted text / link feeding a compose draft, plus
 * the private-bucket helpers for the file originals (retained so extraction can
 * be re-run later). DB-only, like `composeState` — talks straight to the service
 * client. Columns are snake_case in Postgres; these map to/from camelCase.
 */

import { createServiceClient } from './supabase'

const BUCKET = 'story-sources'

export type SourceKind = 'file' | 'link' | 'text'
export type SourceStatus = 'pending' | 'extracted' | 'failed'

export interface StorySource {
  id: string
  storySlug: string
  kind: SourceKind
  filename: string | null
  storagePath: string | null
  sourceUrl: string | null
  mime: string | null
  title: string | null
  byline: string | null
  extractedText: string | null
  status: SourceStatus
  error: string | null
  createdAt: string
}

/** Fields a caller supplies when inserting; the rest are defaulted/generated. */
export interface NewStorySource {
  storySlug: string
  kind: SourceKind
  filename?: string | null
  storagePath?: string | null
  sourceUrl?: string | null
  mime?: string | null
  title?: string | null
  byline?: string | null
  extractedText?: string | null
  status?: SourceStatus
  error?: string | null
}

/** Mutable fields after insert — used by the extraction step. */
export type StorySourcePatch = Partial<
  Pick<StorySource, 'title' | 'byline' | 'extractedText' | 'status' | 'error' | 'storagePath' | 'mime'>
>

function fromRow(row: any): StorySource {
  return {
    id: row.id,
    storySlug: row.story_slug,
    kind: row.kind,
    filename: row.filename ?? null,
    storagePath: row.storage_path ?? null,
    sourceUrl: row.source_url ?? null,
    mime: row.mime ?? null,
    title: row.title ?? null,
    byline: row.byline ?? null,
    extractedText: row.extracted_text ?? null,
    status: row.status,
    error: row.error ?? null,
    createdAt: row.created_at,
  }
}

/**
 * Lightweight metadata for the compose "from library" picker — every
 * already-extracted source across all OTHER drafts, without the (potentially
 * large) `extractedText` payload. The attach step re-reads the full text by id
 * (`getStorySourceById`) when one is chosen.
 */
export interface SourceListItem {
  id: string
  storySlug: string
  kind: SourceKind
  filename: string | null
  sourceUrl: string | null
  mime: string | null
  title: string | null
  byline: string | null
  createdAt: string
}

/**
 * Extracted sources from every draft EXCEPT `slug` (you reuse other stories'
 * research, not your own draft's rows), newest first. Metadata only — the text
 * is fetched on attach so this stays cheap even with many drafts.
 */
export async function listExtractedSourcesExcept(
  slug: string,
  limit = 200,
): Promise<SourceListItem[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('story_sources')
    .select('id, story_slug, kind, filename, source_url, mime, title, byline, created_at')
    .eq('status', 'extracted')
    .neq('story_slug', slug)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listExtractedSourcesExcept ${slug}: ${error.message}`)
  return (data ?? []).map((row: any) => ({
    id: row.id,
    storySlug: row.story_slug,
    kind: row.kind,
    filename: row.filename ?? null,
    sourceUrl: row.source_url ?? null,
    mime: row.mime ?? null,
    title: row.title ?? null,
    byline: row.byline ?? null,
    createdAt: row.created_at,
  }))
}

export async function listStorySources(slug: string): Promise<StorySource[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('story_sources')
    .select('*')
    .eq('story_slug', slug)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`listStorySources ${slug}: ${error.message}`)
  return (data ?? []).map(fromRow)
}

/** One source row by id, or null if it doesn't exist. Used by the async worker. */
export async function getStorySourceById(id: string): Promise<StorySource | null> {
  const sb = createServiceClient()
  const { data, error } = await sb.from('story_sources').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getStorySourceById ${id}: ${error.message}`)
  return data ? fromRow(data) : null
}

/** All sources for a slug in a given status — drives the worker's pending sweep. */
export async function listStorySourcesByStatus(status: SourceStatus): Promise<StorySource[]> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('story_sources')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`listStorySourcesByStatus ${status}: ${error.message}`)
  return (data ?? []).map(fromRow)
}

export async function insertStorySource(input: NewStorySource): Promise<StorySource> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('story_sources')
    .insert({
      story_slug: input.storySlug,
      kind: input.kind,
      filename: input.filename ?? null,
      storage_path: input.storagePath ?? null,
      source_url: input.sourceUrl ?? null,
      mime: input.mime ?? null,
      title: input.title ?? null,
      byline: input.byline ?? null,
      extracted_text: input.extractedText ?? null,
      status: input.status ?? 'pending',
      error: input.error ?? null,
    })
    .select('*')
    .single()
  if (error) throw new Error(`insertStorySource ${input.storySlug}: ${error.message}`)
  return fromRow(data)
}

export async function updateStorySource(id: string, patch: StorySourcePatch): Promise<void> {
  const sb = createServiceClient()
  const row: Record<string, unknown> = {}
  if (patch.title !== undefined) row.title = patch.title
  if (patch.byline !== undefined) row.byline = patch.byline
  if (patch.extractedText !== undefined) row.extracted_text = patch.extractedText
  if (patch.status !== undefined) row.status = patch.status
  if (patch.error !== undefined) row.error = patch.error
  if (patch.storagePath !== undefined) row.storage_path = patch.storagePath
  if (patch.mime !== undefined) row.mime = patch.mime
  const { error } = await sb.from('story_sources').update(row).eq('id', id)
  if (error) throw new Error(`updateStorySource ${id}: ${error.message}`)
}

export async function deleteStorySource(id: string): Promise<void> {
  const sb = createServiceClient()
  const { error } = await sb.from('story_sources').delete().eq('id', id)
  if (error) throw new Error(`deleteStorySource ${id}: ${error.message}`)
}

// ── Bucket helpers (private `story-sources`) ───────────────────────────────

/** Bucket path for a source file: `<slug>/<id>-<filename>`. */
export function sourceStoragePath(slug: string, id: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, '_')
  return `${slug}/${id}-${safe}`
}

export async function uploadSourceFile(
  storagePath: string,
  bytes: Uint8Array | ArrayBuffer | Buffer,
  contentType: string,
): Promise<void> {
  const sb = createServiceClient()
  const body = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(storagePath, body, { contentType, upsert: true })
  if (error) throw new Error(`uploadSourceFile ${storagePath}: ${error.message}`)
}

/** Download a stored original (for re-extraction). */
export async function downloadSourceFile(storagePath: string): Promise<Uint8Array> {
  const sb = createServiceClient()
  const { data, error } = await sb.storage.from(BUCKET).download(storagePath)
  if (error) throw new Error(`downloadSourceFile ${storagePath}: ${error.message}`)
  return new Uint8Array(await data.arrayBuffer())
}

export async function removeSourceFile(storagePath: string): Promise<void> {
  const sb = createServiceClient()
  const { error } = await sb.storage.from(BUCKET).remove([storagePath])
  if (error) throw new Error(`removeSourceFile ${storagePath}: ${error.message}`)
}
