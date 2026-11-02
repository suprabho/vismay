import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { listSpreadPacks } from '@/lib/seasonBooks/packStore'
import { parseSeasonSlug } from '@/lib/seasonBooks/plan'
import { BookStoreError } from '@/lib/seasonBooks/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' }

type Ctx = { params: Promise<{ slug: string }> }

/** The book's newest data pack per spread key. */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  const { slug } = await params
  const seasonStart = parseSeasonSlug(slug)
  if (seasonStart === null) return NextResponse.json({ error: 'not found' }, { status: 404, headers: PRIVATE_HEADERS })
  try {
    return NextResponse.json({ packs: await listSpreadPacks(seasonStart) }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    const status = error instanceof BookStoreError ? error.status : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status, headers: PRIVATE_HEADERS })
  }
}
