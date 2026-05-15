import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import {
  listEvents,
  summarize,
  PLATFORMS,
  STATUSES,
  type Platform,
  type Status,
} from '@/lib/socialEngagement'

export const dynamic = 'force-dynamic'

function parseList<T extends string>(raw: string | null, valid: readonly T[]): T[] | undefined {
  if (!raw) return undefined
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as T[]
  const filtered = parts.filter((p) => valid.includes(p))
  return filtered.length > 0 ? filtered : undefined
}

export async function GET(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const platforms = parseList<Platform>(req.nextUrl.searchParams.get('platform'), PLATFORMS)
  const statuses = parseList<Status>(req.nextUrl.searchParams.get('status'), STATUSES)
  const [events, summary] = await Promise.all([
    listEvents({ platforms, statuses, limit: 300 }),
    summarize(),
  ])
  return NextResponse.json({ events, summary })
}
