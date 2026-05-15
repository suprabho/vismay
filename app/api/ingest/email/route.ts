/**
 * Inbound email ingest for LinkedIn / X notifications.
 *
 * Flow:
 *   Notification arrives at social-ingest@<your-subdomain> →
 *   Cloudflare Email Worker forwards raw RFC822 here →
 *   we parse with mailparser → extract fields with Gemini →
 *   upsert into engagement_event.
 *
 * Auth: shared secret in `Authorization: Bearer <SOCIAL_INGEST_SECRET>`.
 * The Worker holds the secret; nothing else should call this route.
 *
 * Body: raw email bytes as text/plain or application/octet-stream.
 *
 * Response shape:
 *   201 { ok: true, platform, external_id }   on insert
 *   200 { ok: true, status: 'skipped', reason } on unknown platform / no-op
 *   401 { ok: false, error: 'unauthorized' }
 *   500 { ok: false, error: '...' }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { emailToEvent } from '@/lib/socialEmailParse'
import { upsertEvents } from '@/lib/socialEngagement'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function checkSecret(req: NextRequest): boolean {
  const expected = process.env.SOCIAL_INGEST_SECRET
  if (!expected) return false
  const header = req.headers.get('authorization') ?? ''
  const got = header.replace(/^Bearer\s+/i, '').trim()
  if (!got || got.length !== expected.length) return false
  // Constant-time-ish compare. JS doesn't expose timingSafeEqual for
  // arbitrary strings without Buffer, so do it manually.
  let diff = 0
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

export async function POST(req: NextRequest) {
  if (!checkSecret(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let raw: string
  try {
    raw = await req.text()
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `failed to read body: ${err instanceof Error ? err.message : err}` },
      { status: 400 }
    )
  }
  if (!raw || raw.length < 50) {
    return NextResponse.json({ ok: false, error: 'empty body' }, { status: 400 })
  }

  try {
    const event = await emailToEvent(raw)
    if (!event) {
      return NextResponse.json({ ok: true, status: 'skipped', reason: 'unknown platform' })
    }
    await upsertEvents([event])
    return NextResponse.json(
      { ok: true, platform: event.platform, external_id: event.external_id },
      { status: 201 }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ingest/email]', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
