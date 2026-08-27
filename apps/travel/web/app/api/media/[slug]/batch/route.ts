import { NextResponse } from 'next/server'
import { updateTripMedia } from '@vismay/content-source/travelMedia'
import type { TravelTripMediaPatch } from '@vismay/content-source/travelMedia'
import { uploadAuth } from '@/lib/uploadAuth'
import { SAFE_FILENAME, SAFE_SLUG } from '@/lib/assetFiles'
import { readTrip } from '@/lib/trips'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BATCH = 100

/** Multi-select tagging: one patch applied to up to 100 files. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  if (!(await uploadAuth.isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { slug } = await ctx.params
  if (!SAFE_SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })

  let body: { files?: unknown; set?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }

  const files = Array.isArray(body.files) ? body.files.filter((f) => typeof f === 'string') : []
  if (files.length === 0 || files.length > MAX_BATCH) {
    return NextResponse.json({ error: `files must be 1..${MAX_BATCH}` }, { status: 400 })
  }
  if (files.some((f) => !SAFE_FILENAME.test(f))) {
    return NextResponse.json({ error: 'bad filename in batch' }, { status: 400 })
  }

  const set = body.set ?? {}
  const patch: TravelTripMediaPatch = {}
  if (set.selected !== undefined) patch.selected = !!set.selected
  if (set.stop !== undefined) {
    if (set.stop == null) {
      patch.stop = null
      if (set.day !== undefined) patch.day = set.day == null ? null : Number(set.day)
    } else {
      const stopSlug = String(set.stop)
      const trip = readTrip(slug)
      const owner = trip?.days.find((d) => d.stops.some((s) => s.slug === stopSlug))
      if (!owner) return NextResponse.json({ error: `unknown stop "${stopSlug}"` }, { status: 400 })
      patch.stop = stopSlug
      patch.day = owner.n
    }
  } else if (set.day !== undefined) {
    patch.day = set.day == null ? null : Number(set.day)
    if (patch.day == null) patch.stop = null
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'empty patch' }, { status: 400 })
  }

  try {
    const updated = await updateTripMedia(slug, files, patch)
    return NextResponse.json({ updated })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'batch update failed' },
      { status: 500 }
    )
  }
}
