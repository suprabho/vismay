import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { adminEmail } from '@/lib/adminIdentity'
import { updateHistoryEvent } from '@/lib/historicalEvents'
import { isHistoryVerdict } from '@footshorts/shared/historicalEvents'

/**
 * PATCH { verified?: '' | 'yes' | 'fixed' | 'no', notes?: string } → { event }
 * Saves one event's fact-check. Admin-auth gated, same-origin only.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' }
const MAX_NOTE = 4000

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: PRIVATE_HEADERS })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return fail('unauthorized', 401)
  if (req.headers.get('origin') !== new URL(req.url).origin) return fail('Invalid request origin', 403)
  const { id } = await params
  if (!/^[0-9a-f]{16}$/.test(id)) return fail('Invalid event id', 400)
  let body: { verified?: unknown; notes?: unknown }
  try {
    body = await req.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body')
  } catch {
    return fail('Expected a JSON object', 400)
  }
  const patch: { verified?: '' | 'yes' | 'fixed' | 'no'; notes?: string } = {}
  if (body.verified !== undefined) {
    if (!isHistoryVerdict(body.verified)) return fail('verified must be "", "yes", "fixed" or "no"', 400)
    patch.verified = body.verified
  }
  if (body.notes !== undefined) {
    if (typeof body.notes !== 'string' || body.notes.length > MAX_NOTE) return fail(`notes must be text up to ${MAX_NOTE} characters`, 400)
    patch.notes = body.notes
  }
  if (!Object.keys(patch).length) return fail('Nothing to save', 400)
  try {
    return NextResponse.json({ event: await updateHistoryEvent(id, patch, await adminEmail()) }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Could not save', 500)
  }
}
