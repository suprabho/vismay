import { NextResponse } from 'next/server'
import {
  checkRateLimit,
  setDemoCookie,
  verifyPassword,
} from '@vismay/content-source/demoAuth'
import { getTravelTrip, isValidTripSlug } from '@vismay/content-source/travelTrips'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Clone of vizmaya's /api/demo/[clientSlug]/auth — same crypto, cookie, and
// no-enumeration posture, against the travel_trips table.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  if (!isValidTripSlug(slug)) {
    return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  }

  const blocked = checkRateLimit(slug)
  if (blocked != null) {
    return NextResponse.json(
      { error: `too many attempts, retry in ${blocked}s` },
      { status: 429 }
    )
  }

  const body = (await req.json().catch(() => null)) as { password?: string } | null
  const password = body?.password
  if (typeof password !== 'string' || password.length === 0) {
    return NextResponse.json({ error: 'password required' }, { status: 400 })
  }

  let trip
  try {
    trip = await getTravelTrip(slug)
  } catch {
    trip = null
  }
  // Missing and archived collapse into the same generic 401 as a wrong
  // password so there's no trip-slug enumeration channel. Must agree with
  // requireTripAuth's redirect logic or we get a login loop.
  if (!trip || trip.status === 'archived') {
    return NextResponse.json({ error: 'invalid password' }, { status: 401 })
  }

  if (!verifyPassword(password, trip.password_hash)) {
    return NextResponse.json({ error: 'invalid password' }, { status: 401 })
  }

  await setDemoCookie(slug, trip.password_hash)
  return NextResponse.json({ ok: true })
}
