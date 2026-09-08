import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { fetchFootshortsNews } from '@vismay/content-source/footshortsData'
import { imageOnly } from '@footshorts/shared/media'

/**
 * Recent summarised news for the share-card creator. `?entity=<slug>` narrows to
 * a single team/league; `?limit=<n>` caps the page. Reads the same `articles`
 * table the footshorts web feed uses (one row per cluster lead), joined to its
 * tagged entities. The picker turns a row into a news-image or news-article card.
 *
 * Some publishers put an HLS video manifest (`.m3u8`) in `image_url`. Every
 * admin surface that reads this list treats the field as a still — thumbnail
 * grids, the news-image card body, and the AI reference-image pickers — so
 * video URLs are blanked here, at the one place the list enters the admin.
 * The apps' feeds keep the raw column and play those as video.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const entitySlug = url.searchParams.get('entity')?.trim() || undefined
  const limitRaw = url.searchParams.get('limit')?.trim()
  const limit = limitRaw ? Number(limitRaw) : undefined
  try {
    const items = await fetchFootshortsNews({
      entitySlug,
      limit: Number.isFinite(limit) ? limit : undefined,
    })
    return NextResponse.json({
      ok: true,
      items: items.map((it) => ({ ...it, image_url: imageOnly(it.image_url) })),
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to fetch news' },
      { status: 500 },
    )
  }
}
