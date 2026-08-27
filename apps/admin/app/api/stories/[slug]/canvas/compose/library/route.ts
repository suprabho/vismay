import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { getLibraryTabs } from '@/lib/libraryProviders'

/**
 * Compose "from library" picker — TAB METADATA.
 *
 * The picker is tabbed and paginated: this route returns just the applicable
 * tabs for a draft (one per in-scope provider, plus the synthetic
 * "Research sources" and "Document assets" tabs), and each tab lazy-loads its
 * own paginated page through `…/library/page`. Building the tab list is cheap —
 * only the app-scope filter runs, no per-provider query.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  const tabs = await getLibraryTabs(slug)
  return NextResponse.json({ ok: true, tabs })
}
