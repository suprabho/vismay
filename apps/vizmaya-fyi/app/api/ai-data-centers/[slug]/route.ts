import { NextResponse } from 'next/server'
import { getDataCenterProfile } from '@vismay/content-source/epics'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const profile = await getDataCenterProfile(slug.toLowerCase())
  if (!profile) {
    return NextResponse.json({ error: 'not_found', slug }, { status: 404 })
  }
  return NextResponse.json(profile, {
    headers: { 'cache-control': 's-maxage=3600, stale-while-revalidate=86400' },
  })
}
