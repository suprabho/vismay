import { NextResponse } from 'next/server'
import { getEdition } from '@vismay/content-source/dcEditions'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// The full edition row plus the stories and papers its membership arrays
// name. Published editions never change, so the response is immutable.
export async function GET(_req: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  if (!DATE_RE.test(date)) return NextResponse.json({ error: 'bad date' }, { status: 400 })
  const edition = await getEdition(date)
  if (!edition) {
    return NextResponse.json(
      { error: 'not_found', date },
      { status: 404, headers: { 'cache-control': 's-maxage=300' } },
    )
  }
  return NextResponse.json(
    { edition },
    { headers: { 'cache-control': 'public, s-maxage=86400, immutable' } },
  )
}
