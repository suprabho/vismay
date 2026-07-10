import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { listExtractedSourcesExcept } from '@vismay/content-source/storySources'
import { createServiceClient } from '@vismay/content-source/supabase'
import { buildAssetRef, resolveAssetUrl } from '@vismay/viz-engine'
import { ASSETS_BUCKET } from '@/lib/assetFiles'
import { getLibraryGroupPage } from '@/lib/libraryProviders'

/**
 * Compose "from library" picker — ONE PAGE of a single tab.
 *
 * `GET …/library/page?tab=<key>&offset=<n>&limit=<n>&q=<query>` returns
 * `{ ok, items, total }` for the active tab. `total` is the full (query-filtered)
 * match count so the modal can show an accurate count and a "Load more" button
 * (`items.length < total`). The two synthetic tabs are handled here:
 *
 *  - `tab=sources` → paginated `story_sources` rows extracted on OTHER drafts.
 *  - `tab=assets`  → document-type files swept from the `story-assets` bucket.
 *
 * Any other `tab` is a provider key, dispatched to `getLibraryGroupPage`. Attach
 * still goes through `POST …/compose/sources` (`{ providerKey, itemId }` /
 * `{ fromSourceId }` / `{ assetKey }`).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Default / max page size (matches the provider layer's PAGE_LIMIT). */
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

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

/** Sweep the story-assets bucket for document-type files across every story.
 *  Bounded to MAX_ASSET_FOLDERS; degrades to [] on any storage hiccup. */
async function sweepDocumentAssets(): Promise<LibraryAsset[]> {
  try {
    const sb = createServiceClient()
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
    return perFolder.flat()
  } catch {
    return []
  }
}

/** Filter the swept assets by a query across filename / story slug. */
function filterAssets(assets: LibraryAsset[], q: string): LibraryAsset[] {
  const term = q.trim().toLowerCase()
  if (!term) return assets
  return assets.filter((a) => `${a.filename} ${a.storySlug}`.toLowerCase().includes(term))
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  const sp = new URL(req.url).searchParams

  const tab = sp.get('tab') ?? ''
  if (!tab) return NextResponse.json({ error: 'missing tab' }, { status: 400 })
  const offset = Math.max(0, Number(sp.get('offset')) || 0)
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(sp.get('limit')) || DEFAULT_LIMIT))
  const q = sp.get('q') ?? ''

  if (tab === 'sources') {
    const { items, total } = await listExtractedSourcesExcept(slug, { offset, limit, q })
    return NextResponse.json({ ok: true, items, total })
  }

  if (tab === 'assets') {
    // The bucket has no server-side paging, so we sweep the bounded set and
    // slice; the sweep is capped at MAX_ASSET_FOLDERS folders.
    const all = filterAssets(await sweepDocumentAssets(), q)
    return NextResponse.json({ ok: true, items: all.slice(offset, offset + limit), total: all.length })
  }

  const { items, total } = await getLibraryGroupPage(slug, tab, { offset, limit, query: q })
  return NextResponse.json({ ok: true, items, total })
}
