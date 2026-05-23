/**
 * GET / PUT the per-story report.yaml that drives /report and /slides
 * overrides. Mirrors the tts and map admin endpoints — opaque YAML body,
 * admin-auth gated, no schema validation here (parse failures at render
 * time fall through to no-override, not a crash).
 *
 * Vizmaya-fyi also has a /api/story-report-config/[slug] route, but
 * that's gated by same-origin referer and isn't reachable cross-app from
 * admin. Keeping admin's save path self-contained is simpler than
 * proxying.
 */

import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { getContentSource } from '@vismay/content-source/contentSource'

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
  const raw = await getContentSource().readReportYaml(slug)
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

  await getContentSource().writeReportYaml(slug, raw === '' ? null : (raw as string | null))
  return NextResponse.json({ ok: true })
}
