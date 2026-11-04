import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { adminEmail } from '@/lib/adminIdentity'
import { listClaimsForReview, reviewClaim, type ReviewAction } from '@vismay/curious-pipeline/store'

/**
 * PATCH /api/vizmaya/curious/claims/[id] { action: 'approve'|'send_back'|'reject', note?, text? }
 * → { claim }. The review gate: approve is the only transition into the
 * desk's pool. Admin-auth gated, same-origin only, stamps the reviewer.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' }
const MAX_NOTE = 4000
const MAX_TEXT = 500
const ACTIONS: ReviewAction[] = ['approve', 'send_back', 'reject']

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: PRIVATE_HEADERS })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return fail('unauthorized', 401)
  if (req.headers.get('origin') !== new URL(req.url).origin) return fail('Invalid request origin', 403)
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail('Invalid claim id', 400)
  let body: { action?: unknown; note?: unknown; text?: unknown }
  try {
    body = await req.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body')
  } catch {
    return fail('Expected a JSON object', 400)
  }
  if (!ACTIONS.includes(body.action as ReviewAction)) return fail('action must be approve, send_back or reject', 400)
  const action = body.action as ReviewAction
  let note: string | null = null
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string' || body.note.length > MAX_NOTE) return fail(`note must be text up to ${MAX_NOTE} characters`, 400)
    note = body.note.trim() || null
  }
  if (action === 'send_back' && !note) return fail('Send back needs a note saying what to fix', 400)
  let text: string | null = null
  if (body.text !== undefined && body.text !== null) {
    if (typeof body.text !== 'string' || body.text.length > MAX_TEXT) return fail(`text must be up to ${MAX_TEXT} characters`, 400)
    text = body.text
  }
  try {
    await reviewClaim(id, { action, note, text, by: (await adminEmail()) ?? 'admin' })
    const { claims } = await listClaimsForReview({ ids: [id], limit: 1 })
    return NextResponse.json({ claim: claims[0] ?? null }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Could not save', 500)
  }
}
