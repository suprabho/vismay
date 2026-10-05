import { NextResponse } from 'next/server'
import { reviewSpin, saveSpinResearch, SpinError } from '@vismay/randomizer/spins'
import { isAuthed } from '@/lib/adminAuth'
import { adminEmail } from '@/lib/adminIdentity'

/**
 * The hero insight gate (decision D4) and research edits for one spin.
 *
 *   PATCH { action: 'approve' | 'send_back', note? }   review the hero insight
 *   PATCH { research: "<markdown>" }                    replace the research file
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'expected a JSON object' }, { status: 400 })
  try {
    if (typeof b.research === 'string') return NextResponse.json({ spin: await saveSpinResearch(id, b.research) })
    if (b.action !== 'approve' && b.action !== 'send_back') {
      return NextResponse.json({ error: 'action must be approve or send_back' }, { status: 400 })
    }
    const spin = await reviewSpin(id, {
      action: b.action,
      note: typeof b.note === 'string' ? b.note : null,
      by: (await adminEmail()) ?? 'admin',
    })
    return NextResponse.json({ spin })
  } catch (e) {
    const status = e instanceof SpinError ? e.status : 500
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status })
  }
}
