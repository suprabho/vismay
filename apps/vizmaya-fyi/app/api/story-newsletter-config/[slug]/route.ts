/**
 * GET / POST the per-story newsletter.yaml that drives the /newsletters
 * builder and the newsletter render.
 *
 * GET  → 200 { raw: string | null }
 * POST → 200 { ok: true }   body: { raw: string }
 *
 * Both behind the same-origin referer check (lightweight; see
 * lib/requireSameOriginReferer.ts). The body is opaque YAML — parsing
 * happens at read time in `parseNewsletterConfig`, so a malformed save just
 * means the next render sees the inclusive defaults rather than a crash.
 */

import { NextResponse } from 'next/server'
import { getContentSource } from '@vismay/content-source/contentSource'
import { checkSameOriginReferer } from '@/lib/requireSameOriginReferer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const blocked = checkSameOriginReferer(req)
  if (blocked) return blocked

  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) {
    return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  }
  const raw = await getContentSource().readNewsletterYaml(slug)
  return NextResponse.json({ raw })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const blocked = checkSameOriginReferer(req)
  if (blocked) return blocked

  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) {
    return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  }

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

  await getContentSource().writeNewsletterYaml(slug, raw === '' ? null : (raw as string | null))
  return NextResponse.json({ ok: true })
}
