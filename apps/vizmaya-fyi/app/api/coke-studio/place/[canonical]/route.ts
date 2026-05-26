import { NextResponse } from 'next/server'
import { getCokeStudioPlace } from '@/lib/coke-studio/data'

export const dynamic = 'force-dynamic'

// Place lookup for the /coke-studio detail sheet. The `canonical` segment is
// the gazetteer's natural key — usually ASCII (e.g. "lahore") but it can hold
// any UTF-8 (e.g. transliterations with diacritics). Next decodes URL escapes
// in `params` for us, so the route handler gets the canonical as it appears
// in the table.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ canonical: string }> },
) {
  const { canonical } = await params
  const place = await getCokeStudioPlace(canonical)
  if (!place) {
    return NextResponse.json({ error: 'not_found', canonical }, { status: 404 })
  }
  return NextResponse.json(place, {
    headers: { 'cache-control': 's-maxage=3600, stale-while-revalidate=86400' },
  })
}
