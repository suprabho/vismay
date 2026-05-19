import { NextResponse } from 'next/server'
import { getIeaCountryProfile } from '@vismay/content-source/epics'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: codeParam } = await params
  const code = codeParam.toUpperCase()
  const profile = await getIeaCountryProfile(code)
  if (!profile) {
    return NextResponse.json({ error: 'not_found', code }, { status: 404 })
  }
  return NextResponse.json(profile, {
    headers: { 'cache-control': 's-maxage=3600, stale-while-revalidate=86400' },
  })
}
