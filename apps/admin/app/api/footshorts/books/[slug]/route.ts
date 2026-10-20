import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { adminEmail } from '@/lib/adminIdentity'
import { parseAnyPlan } from '@/lib/seasonBooks/seasonSpreads'
import { BookStoreError, deleteSeasonBook, getSeasonBook, saveSeasonBook } from '@/lib/seasonBooks/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' }
/** Sketches make plans the biggest thing here; this is far above a full book. */
const MAX_BODY_BYTES = 1_500_000

type Ctx = { params: Promise<{ slug: string }> }

function errorResponse(error: unknown) {
  const status = error instanceof BookStoreError ? error.status : 500
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status, headers: PRIVATE_HEADERS })
}

export async function GET(_req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  const { slug } = await params
  try {
    const book = await getSeasonBook(slug)
    if (!book) return NextResponse.json({ error: 'not found' }, { status: 404, headers: PRIVATE_HEADERS })
    return NextResponse.json({ book }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    return errorResponse(error)
  }
}

/** Save `{ revision, title, plan }` (a v1 or v2 plan, by its `version`); 409 when someone else saved since `revision`. */
export async function PUT(req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  if (req.headers.get('origin') !== new URL(req.url).origin) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403, headers: PRIVATE_HEADERS })
  }
  const raw = await req.text()
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'Plan too large: simplify some sketches' }, { status: 413, headers: PRIVATE_HEADERS })
  let body: { revision?: unknown; title?: unknown; plan?: unknown }
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400, headers: PRIVATE_HEADERS })
  }
  if (typeof body.revision !== 'number' || !Number.isInteger(body.revision)) {
    return NextResponse.json({ error: 'revision is required' }, { status: 400, headers: PRIVATE_HEADERS })
  }
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : ''
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400, headers: PRIVATE_HEADERS })
  const plan = parseAnyPlan(body.plan)
  if (!plan.success) return NextResponse.json({ error: plan.error }, { status: 400, headers: PRIVATE_HEADERS })
  const { slug } = await params
  try {
    const book = await saveSeasonBook(slug, body.revision, { plan: plan.data, title }, await adminEmail())
    return NextResponse.json({ book }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  if (req.headers.get('origin') !== new URL(req.url).origin) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403, headers: PRIVATE_HEADERS })
  }
  const { slug } = await params
  try {
    await deleteSeasonBook(slug)
    return NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    return errorResponse(error)
  }
}
