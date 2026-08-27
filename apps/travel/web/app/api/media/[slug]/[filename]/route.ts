import { NextResponse } from 'next/server'
import { createServiceClient } from '@vismay/content-source/supabase'
import {
  deleteTripMedia,
  listTripMedia,
  updateTripMedia,
  upsertTripMedia,
} from '@vismay/content-source/travelMedia'
import type { TravelTripMediaPatch } from '@vismay/content-source/travelMedia'
import { uploadAuth } from '@/lib/uploadAuth'
import { ASSETS_BUCKET, SAFE_FILENAME, SAFE_SLUG } from '@/lib/assetFiles'
import { readTrip } from '@/lib/trips'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ slug: string; filename: string }>
}

async function guard(params: Params['params']) {
  if (!(await uploadAuth.isAuthed())) {
    return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  }
  const { slug, filename } = await params
  if (!SAFE_SLUG.test(slug)) {
    return { error: NextResponse.json({ error: 'bad slug' }, { status: 400 }) }
  }
  if (!SAFE_FILENAME.test(filename)) {
    return { error: NextResponse.json({ error: 'bad filename' }, { status: 400 }) }
  }
  return { slug, filename }
}

/**
 * Per-item curation edit. Upsert semantics: also registers bucket orphans and
 * freshly-uploaded files as DB rows (match: 'manual', `original` untouched).
 * A non-null `stop` is validated against the itinerary and resolves its
 * owning `day` server-side so day/stop can never disagree.
 */
export async function PATCH(req: Request, { params }: Params) {
  const g = await guard(params)
  if ('error' in g) return g.error
  const { slug, filename } = g

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }

  const patch: TravelTripMediaPatch = {}
  if (body.caption !== undefined) patch.caption = body.caption == null ? null : String(body.caption)
  if (body.selected !== undefined) patch.selected = !!body.selected
  if (body.sort_order !== undefined)
    patch.sort_order = body.sort_order == null ? null : Number(body.sort_order)
  if (body.kind === 'image' || body.kind === 'video') patch.kind = body.kind

  if (body.stop !== undefined) {
    if (body.stop == null) {
      patch.stop = null
      if (body.day !== undefined) patch.day = body.day == null ? null : Number(body.day)
    } else {
      const stopSlug = String(body.stop)
      const trip = readTrip(slug)
      const owner = trip?.days.find((d) => d.stops.some((s) => s.slug === stopSlug))
      if (!owner) return NextResponse.json({ error: `unknown stop "${stopSlug}"` }, { status: 400 })
      patch.stop = stopSlug
      patch.day = owner.n
    }
  } else if (body.day !== undefined) {
    patch.day = body.day == null ? null : Number(body.day)
    if (patch.day == null) patch.stop = null
  }

  try {
    const updated = await updateTripMedia(slug, [filename], patch)
    if (updated === 0) {
      // New row (orphan/new upload): create it with the patch applied.
      await upsertTripMedia(
        [
          {
            trip_slug: slug,
            file: filename,
            kind: patch.kind ?? (filename.toLowerCase().endsWith('.mp4') ? 'video' : 'image'),
            day: patch.day ?? null,
            stop: patch.stop ?? null,
            caption: patch.caption ?? null,
            selected: patch.selected ?? true,
            sort_order: patch.sort_order ?? null,
            taken_at: null,
            match: 'manual',
            original: null,
          },
        ],
        { ignoreDuplicates: false }
      )
    }
    const row = (await listTripMedia(slug)).find((r) => r.file === filename)
    return NextResponse.json({ row })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'update failed' },
      { status: 500 }
    )
  }
}

/** Delete the bucket object first (source of truth), then the DB row. */
export async function DELETE(_req: Request, { params }: Params) {
  const g = await guard(params)
  if ('error' in g) return g.error
  const { slug, filename } = g

  try {
    const supabase = createServiceClient()
    const { error } = await supabase.storage.from(ASSETS_BUCKET).remove([`${slug}/${filename}`])
    if (error) throw new Error(error.message)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'bucket delete failed' },
      { status: 500 }
    )
  }
  try {
    await deleteTripMedia(slug, filename)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'row delete failed (object removed)' },
      { status: 500 }
    )
  }
  return NextResponse.json({ ok: true })
}
