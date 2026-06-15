import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'
import { listHeygenRenders } from '@vismay/content-source/heygenRenders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/

/** List existing HeyGen renders attached to a story slug. */
export async function GET(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const slug = new URL(req.url).searchParams.get('slug')?.trim() ?? ''
  if (!slug || !SAFE_SLUG.test(slug)) {
    return NextResponse.json({ error: 'missing or invalid "slug"' }, { status: 400 })
  }

  let supabase
  try {
    supabase = createServiceClient()
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'supabase init failed' },
      { status: 500 },
    )
  }

  try {
    const renders = await listHeygenRenders(supabase, slug)
    return NextResponse.json({ renders })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to list renders' },
      { status: 500 },
    )
  }
}
