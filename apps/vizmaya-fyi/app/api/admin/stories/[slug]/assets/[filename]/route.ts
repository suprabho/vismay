import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/
const SAFE_FILENAME = /^[a-zA-Z0-9._-]+$/
const BUCKET = 'story-assets'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string; filename: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug, filename } = await params
  if (!SAFE_SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  if (!SAFE_FILENAME.test(filename)) {
    return NextResponse.json({ error: 'bad filename' }, { status: 400 })
  }

  let supabase
  try {
    supabase = createServiceClient()
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'supabase init failed' },
      { status: 500 }
    )
  }

  const key = `${slug}/${filename}`
  const { error } = await supabase.storage.from(BUCKET).remove([key])
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
