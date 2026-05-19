/**
 * GET / PUT the per-story tts.yaml that drives narration overrides for
 * `scripts/generate-audio.ts`.
 *
 * GET → 200 { raw: string | null }
 * PUT → 200 { ok: true }   body: { raw: string | null }
 *
 * Admin-auth gated (matches the rest of /api/vizmaya/stories). The body is
 * opaque YAML — parsing happens at script time in `loadTtsOverrides`, so a
 * malformed save just means the next render falls back to default narration
 * rather than crashing.
 */

import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { getContentSource } from '@/lib/contentSource'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  const raw = await getContentSource().readTtsYaml(slug)
  return NextResponse.json({ raw })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }
  const raw = (body as { raw?: unknown })?.raw
  if (raw !== null && typeof raw !== 'string') {
    return NextResponse.json({ error: 'raw must be string or null' }, { status: 400 })
  }

  await getContentSource().writeTtsYaml(slug, raw === '' ? null : (raw as string | null))
  return NextResponse.json({ ok: true })
}
