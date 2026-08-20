import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { hashPassword } from '@vismay/content-source/demoAuth'
import {
  getTravelTrip,
  isValidTripSlug,
  upsertTravelTrip,
  type TravelTripStatus,
} from '@vismay/content-source/travelTrips'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_STATUSES: TravelTripStatus[] = ['draft', 'live', 'archived']

interface UpdateBody {
  password?: string
  status?: TravelTripStatus
}

/**
 * Trip status (no password_hash) for the story editor's Settings tab — the
 * per-trip password gate (migration 073) lives here, not on the `stories`
 * row, so a travel story's Settings panel looks this up by the story's
 * `trip:` frontmatter slug.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  if (!isValidTripSlug(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  try {
    const trip = await getTravelTrip(slug)
    if (!trip) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const { password_hash: _ph, ...safe } = trip
    return NextResponse.json({ trip: safe })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'get failed' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  if (!isValidTripSlug(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })

  const body = (await req.json().catch(() => null)) as UpdateBody | null
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: 'bad status' }, { status: 400 })
  }
  if (body.password !== undefined && (typeof body.password !== 'string' || body.password.length < 6)) {
    return NextResponse.json({ error: 'password must be at least 6 chars' }, { status: 400 })
  }

  try {
    const existing = await getTravelTrip(slug)
    if (!existing) {
      return NextResponse.json(
        { error: 'trip row not found — run travel:sync-trip-db first' },
        { status: 404 }
      )
    }
    const trip = await upsertTravelTrip({
      slug,
      name: existing.name,
      password_hash: body.password !== undefined ? hashPassword(body.password) : existing.password_hash,
      status: body.status ?? existing.status,
    })
    const { password_hash: _ph, ...safe } = trip
    return NextResponse.json({ trip: safe })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'update failed' },
      { status: 500 }
    )
  }
}
