import { NextResponse } from 'next/server'
import { createServiceClient } from '@vismay/content-source/supabase'
import { listTripMedia } from '@vismay/content-source/travelMedia'
import type { TravelTripMediaRow } from '@vismay/content-source/travelMedia'
import { buildAssetRef, resolveAssetUrl } from '@vismay/viz-engine'
import { uploadAuth } from '@/lib/uploadAuth'
import { ASSETS_BUCKET, SAFE_SLUG } from '@/lib/assetFiles'
import { readTrip } from '@/lib/trips'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface CurationItem {
  file: string
  url: string
  kind: 'image' | 'video'
  day: number | null
  stop: string | null
  caption: string | null
  selected: boolean
  sortOrder: number | null
  takenAt: string | null
  match: 'auto' | 'manual'
  /** In the bucket but not in the DB — tag it to register it. */
  orphan?: boolean
  /** In the DB but missing from the bucket. */
  missing?: boolean
}

export interface CurationVocabulary {
  days: Array<{ n: number | null; label: string; stops: Array<{ slug: string; name: string }> }>
}

/**
 * The curation surface's single hydration call: DB rows reconciled against
 * the bucket listing, plus the tagging vocabulary from the trip itinerary.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  if (!(await uploadAuth.isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { slug } = await ctx.params
  if (!SAFE_SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })

  let rows: TravelTripMediaRow[] = []
  let dbError: string | null = null
  try {
    rows = await listTripMedia(slug)
  } catch (e) {
    // Table not migrated yet / env missing — still show the bucket contents.
    dbError = e instanceof Error ? e.message : 'db unavailable'
  }

  const inBucket = new Set<string>()
  try {
    const supabase = createServiceClient()
    let offset = 0
    for (;;) {
      const { data, error } = await supabase.storage
        .from(ASSETS_BUCKET)
        .list(slug, { limit: 100, offset })
      if (error) throw new Error(error.message)
      for (const o of data ?? []) {
        if (o.name && !o.name.startsWith('.') && o.name !== '.emptyFolderPlaceholder') {
          inBucket.add(o.name)
        }
      }
      if (!data || data.length < 100) break
      offset += 100
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'bucket list failed' },
      { status: 500 }
    )
  }

  const items: CurationItem[] = rows.map((r) => ({
    file: r.file,
    url: resolveAssetUrl(buildAssetRef(slug, r.file)),
    kind: r.kind,
    day: r.day,
    stop: r.stop,
    caption: r.caption,
    selected: r.selected,
    sortOrder: r.sort_order,
    takenAt: r.taken_at,
    match: r.match,
    ...(inBucket.has(r.file) ? {} : { missing: true }),
  }))
  const known = new Set(rows.map((r) => r.file))
  for (const file of inBucket) {
    if (known.has(file)) continue
    items.push({
      file,
      url: resolveAssetUrl(buildAssetRef(slug, file)),
      kind: file.toLowerCase().endsWith('.mp4') ? 'video' : 'image',
      day: null,
      stop: null,
      caption: null,
      selected: true,
      sortOrder: null,
      takenAt: null,
      match: 'manual',
      orphan: true,
    })
  }

  const trip = readTrip(slug)
  const vocabulary: CurationVocabulary = {
    days: (trip?.days ?? []).map((d) => ({
      n: d.n,
      label: d.label ?? d.heading,
      stops: d.stops.map((s) => ({ slug: s.slug, name: s.name })),
    })),
  }

  return NextResponse.json({ slug, items, ...vocabulary, ...(dbError ? { dbError } : {}) })
}
