import { NextResponse } from 'next/server'
import { getProductExports } from '@vismay/content-source/trade'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ hsCode: string }> },
) {
  const { hsCode } = await params
  if (!/^\d{2}(\d{2})?(\d{2})?$/.test(hsCode)) {
    return NextResponse.json({ error: 'invalid_hs_code', hsCode }, { status: 400 })
  }
  const profile = await getProductExports(hsCode)
  if (!profile) {
    return NextResponse.json({ error: 'not_found', hsCode }, { status: 404 })
  }
  return NextResponse.json(profile, {
    headers: { 'cache-control': 's-maxage=3600, stale-while-revalidate=86400' },
  })
}
