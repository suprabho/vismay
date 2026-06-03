import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'

/**
 * List past assistant conversations for the history panel, newest first.
 *
 * Optional `?slug=` narrows to the conversations that started while editing a
 * given story. Returns lightweight rows (no message bodies) — the full thread
 * is fetched lazily from `conversations/[id]` when one is opened.
 */

export const dynamic = 'force-dynamic'

const LIMIT = 50

export async function GET(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const slug = req.nextUrl.searchParams.get('slug')?.trim()
  const supabase = createServiceClient()

  let query = supabase
    .from('assistant_conversations')
    .select('id, title, story_slug, updated_at')
    .order('updated_at', { ascending: false })
    .limit(LIMIT)
  if (slug) query = query.eq('story_slug', slug)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, conversations: data ?? [] })
}
