import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import {
  createStoryTheme,
  isValidAppSlug,
  listStoryThemes,
} from '@vismay/content-source/storyThemes'

export const dynamic = 'force-dynamic'

/**
 * Saved story themes (the theme editor's "Presets" strip).
 *
 * `GET ?appSlug=<slug>` lists the shared rows plus the app's own. A DB/env
 * failure answers 503 (not 500) so the client can tell "library unavailable"
 * (fs-mode dev, missing service key) apart from a bug and fall back to the
 * built-in presets compiled into `@vismay/viz-engine`.
 */
export async function GET(request: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const appSlug = request.nextUrl.searchParams.get('appSlug')
  if (!isValidAppSlug(appSlug)) {
    return NextResponse.json({ error: 'appSlug query param is required' }, { status: 400 })
  }
  try {
    const themes = await listStoryThemes(appSlug)
    return NextResponse.json({ ok: true, themes })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to list themes'
    console.error('[story-themes] list failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}

/** Save the current theme under a name, scoped to one app or shared. */
export async function POST(request: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as {
    name?: string
    appSlug?: string | null
    theme?: unknown
    isDefault?: boolean
  }
  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (body.theme == null) return NextResponse.json({ error: 'theme is required' }, { status: 400 })
  const appSlug = body.appSlug ?? null
  if (appSlug !== null && !isValidAppSlug(appSlug)) {
    return NextResponse.json({ error: 'invalid appSlug' }, { status: 400 })
  }
  if (body.isDefault && appSlug === null) {
    return NextResponse.json({ error: 'a shared theme cannot be an app default' }, { status: 400 })
  }
  try {
    const theme = await createStoryTheme({
      name,
      appSlug,
      theme: body.theme,
      isDefault: Boolean(body.isDefault),
    })
    return NextResponse.json({ ok: true, theme }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to save theme'
    // Validation failures from the writer are the caller's problem, not ours.
    const status = /required|invalid|must |cannot/i.test(message) ? 400 : 500
    if (status === 500) console.error('[story-themes] save failed:', message)
    return NextResponse.json({ error: message }, { status })
  }
}
