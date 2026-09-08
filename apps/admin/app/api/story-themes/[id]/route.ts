import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import {
  deleteStoryTheme,
  setDefaultStoryTheme,
  updateStoryTheme,
} from '@vismay/content-source/storyThemes'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

function errorStatus(message: string): number {
  if (/not found/i.test(message)) return 404
  return /required|invalid|must |cannot/i.test(message) ? 400 : 500
}

/**
 * Update a saved theme: rename, replace its palette/fonts, or make it the
 * default for its app (`isDefault: true` — clears the app's previous default).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  const body = (await request.json().catch(() => ({}))) as {
    name?: string
    theme?: unknown
    isDefault?: boolean
  }
  try {
    let theme = await updateStoryTheme(id, { name: body.name, theme: body.theme })
    if (body.isDefault === true) theme = await setDefaultStoryTheme(id)
    return NextResponse.json({ ok: true, theme })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update theme'
    const status = errorStatus(message)
    if (status === 500) console.error('[story-themes] update failed:', message)
    return NextResponse.json({ error: message }, { status })
  }
}

/** Delete a saved theme. Built-in rows refuse (400) — edit them instead. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  try {
    await deleteStoryTheme(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to delete theme'
    const status = errorStatus(message)
    if (status === 500) console.error('[story-themes] delete failed:', message)
    return NextResponse.json({ error: message }, { status })
  }
}
