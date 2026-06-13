import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { listExtractedSourcesExcept } from '@vismay/content-source/storySources'
import { createServiceClient } from '@vismay/content-source/supabase'
import { buildAssetRef, resolveAssetUrl } from '@vismay/viz-engine'
import { ASSETS_BUCKET } from '@/lib/assetFiles'
import { getLibraryGroups } from '@/lib/libraryProviders'

/**
 * Compose "from library" picker source — the existing files already in the DB
 * that can be attached as research for a draft, in two groups:
 *
 *  - `sources` — every already-extracted `story_sources` row from OTHER drafts
 *    (metadata only; the text is copied in on attach). Reuse prior research
 *    instead of re-uploading.
 *  - `assets`  — document-type files in the public `story-assets` bucket across
 *    stories (PDF/CSV/JSON/MD/TXT/HTML/EML). Images/video/.riv are skipped —
 *    they carry no extractable research text.
 *
 * Both are attached through `POST …/compose/sources` (`{ fromSourceId }` /
 * `{ assetKey }`), which snapshots the extracted text into a new row for this
 * draft. See that route.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Folders listed for assets — capped so the parallel sweep stays bounded. */
const MAX_ASSET_FOLDERS = 200

/** Extensions the ingest extractor can read into research text. */
const DOC_EXTS = new Set(['.pdf', '.csv', '.json', '.md', '.markdown', '.txt', '.html', '.htm', '.eml'])

function isDocFile(name: string): boolean {
  const dot = name.lastIndexOf('.')
  return dot > 0 && DOC_EXTS.has(name.slice(dot).toLowerCase())
}

export interface LibraryAsset {
  key: string
  storySlug: string
  filename: string
  assetRef: string
  url: string
  size: number | null
  contentType: string | null
  updatedAt: string | null
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params

  const [sources, groups] = await Promise.all([
    listExtractedSourcesExcept(slug),
    getLibraryGroups(slug),
  ])

  // Assets degrade to [] on any storage hiccup — the sources group is the
  // primary payload and shouldn't be held hostage to a bucket listing.
  let assets: LibraryAsset[] = []
  try {
    const sb = createServiceClient()
    // Root entries are per-story folders (slug names). List each in parallel
    // and keep only the document-type files.
    const { data: folders, error } = await sb.storage
      .from(ASSETS_BUCKET)
      .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw error
    const folderNames = (folders ?? [])
      .map((f) => f.name)
      .filter((n): n is string => !!n && n !== '.emptyFolderPlaceholder')
      .slice(0, MAX_ASSET_FOLDERS)

    const perFolder = await Promise.all(
      folderNames.map(async (folder) => {
        const { data } = await sb.storage
          .from(ASSETS_BUCKET)
          .list(folder, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
        return (data ?? [])
          .filter(
            (r) =>
              r.name &&
              r.name !== '.emptyFolderPlaceholder' &&
              (r.metadata?.size ?? 0) > 0 &&
              isDocFile(r.name),
          )
          .map((r): LibraryAsset => {
            const ref = buildAssetRef(folder, r.name)
            return {
              key: `${folder}/${r.name}`,
              storySlug: folder,
              filename: r.name,
              assetRef: ref,
              url: resolveAssetUrl(ref),
              size: (r.metadata?.size as number | undefined) ?? null,
              contentType: (r.metadata?.mimetype as string | undefined) ?? null,
              updatedAt: r.updated_at ?? r.created_at ?? null,
            }
          })
      }),
    )
    assets = perFolder.flat()
  } catch {
    assets = []
  }

  return NextResponse.json({ ok: true, sources, assets, groups })
}
