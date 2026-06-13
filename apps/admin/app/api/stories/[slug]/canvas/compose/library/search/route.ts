import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { searchLibrary } from '@/lib/libraryProviders'

/**
 * Dynamic dataset search for the compose "from library" picker. The large
 * corpora (IEA news, Epstein documents, Coke Studio) can't be listed wholesale,
 * so the modal queries them on demand: `GET …/library/search?q=…` runs every
 * applicable search-based provider (app-scoped to the draft) and returns their
 * groups. Attach goes through the same `{ providerKey, itemId }` path as the
 * listed groups. Shares its query layer with the AI research tool.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  const q = new URL(req.url).searchParams.get('q') ?? ''
  const groups = await searchLibrary(slug, q)
  return NextResponse.json({ ok: true, groups })
}
