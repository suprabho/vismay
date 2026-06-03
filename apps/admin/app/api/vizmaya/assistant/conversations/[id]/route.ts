import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'

/**
 * Fetch one conversation with all its turns (GET), or delete it (DELETE).
 *
 * GET returns the messages in send order so the panel can rehydrate the thread
 * exactly as it was. DELETE removes the conversation; the messages cascade.
 */

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: conversation, error: convErr } = await supabase
    .from('assistant_conversations')
    .select('id, title, story_slug, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (convErr) {
    return NextResponse.json({ error: convErr.message }, { status: 500 })
  }
  if (!conversation) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const { data: messages, error: msgErr } = await supabase
    .from('assistant_messages')
    .select('id, role, content, meta, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })
  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, conversation, messages: messages ?? [] })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('assistant_conversations')
    .delete()
    .eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
