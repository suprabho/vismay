import { NextRequest, NextResponse } from 'next/server'
import { listEditions } from '@vismay/content-source/dcEditions'
import { SERIES_HREF, editionHref } from '../components/editionUtils'

export const dynamic = 'force-dynamic'

/**
 * A stable "today's edition" link: a temporary redirect to the latest
 * published edition's dated page, or to the series landing before the first
 * one. Temporary so crawlers index the dated page, never this alias.
 */
export async function GET(req: NextRequest) {
  const [latest] = await listEditions(1).catch(() => [])
  const target = latest ? editionHref(latest.date) : SERIES_HREF
  return NextResponse.redirect(new URL(target, req.nextUrl), 307)
}
