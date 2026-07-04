import { NextResponse } from 'next/server'
import { listDataCenters } from '@vismay/content-source/epics'

export const dynamic = 'force-dynamic'

export async function GET() {
  const facilities = await listDataCenters()
  return NextResponse.json(
    { facilities },
    { headers: { 'cache-control': 's-maxage=3600, stale-while-revalidate=86400' } },
  )
}
