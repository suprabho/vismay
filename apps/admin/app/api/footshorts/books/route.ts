import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { adminEmail } from '@/lib/adminIdentity'
import { BookStoreError, createSeasonBook, listSeasonBooks } from '@/lib/seasonBooks/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' }

function errorResponse(error: unknown) {
  const status = error instanceof BookStoreError ? error.status : 500
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status, headers: PRIVATE_HEADERS })
}

/** The season-book series: one row per book. */
export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  try {
    return NextResponse.json({ books: await listSeasonBooks() }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    return errorResponse(error)
  }
}

/** Start a book: `{ seasonStart: 2003, title? }` → the 2003-04 book with its cover and intro spreads. */
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  if (req.headers.get('origin') !== new URL(req.url).origin) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403, headers: PRIVATE_HEADERS })
  }
  const body = (await req.json().catch(() => null)) as { seasonStart?: unknown; title?: unknown } | null
  const start = body?.seasonStart
  if (typeof start !== 'number' || !Number.isInteger(start) || start < 2002 || start > new Date().getUTCFullYear()) {
    return NextResponse.json({ error: 'seasonStart must be a year from 2002 on' }, { status: 400, headers: PRIVATE_HEADERS })
  }
  const title = typeof body?.title === 'string' ? body.title.slice(0, 200) : undefined
  try {
    return NextResponse.json({ book: await createSeasonBook(start, title, await adminEmail()) }, { status: 201, headers: PRIVATE_HEADERS })
  } catch (error) {
    return errorResponse(error)
  }
}
