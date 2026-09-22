import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { adminEmail } from '@/lib/adminIdentity'
import { holdDraftEdition } from '@vismay/content-source/dcEditions'

export const dynamic = 'force-dynamic'

// Hold: extend the review window by 30 minutes, once. The 09:30 UTC publish
// run picks the draft up afterwards.
export async function POST() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const edition = await holdDraftEdition({ editor: await adminEmail() })
    return NextResponse.json({ ok: true, autoPublishAt: edition.autoPublishAt, holdCount: edition.holdCount })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'hold failed'
    return NextResponse.json({ error: msg }, { status: /already|no draft/.test(msg) ? 409 : 500 })
  }
}
