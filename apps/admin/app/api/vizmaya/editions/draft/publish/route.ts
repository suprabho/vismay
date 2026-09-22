import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { adminEmail } from '@/lib/adminIdentity'
import { publishDraftEdition } from '@vismay/content-source/dcEditions'
import { editionPublicUrl, pingEditionRevalidate } from '@/lib/editionsAdmin'

export const dynamic = 'force-dynamic'

// Publish now: freeze the draft regardless of a hold, then ask vizmaya.fyi to
// re-render the public routes. The revalidate ping is best-effort — /daily
// also refreshes on a 15-minute timer.
export async function POST() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const res = await publishDraftEdition({ reviewedBy: await adminEmail(), onlyIfDue: false })
    if (!res.published || !res.edition) {
      return NextResponse.json({ error: res.reason ?? 'nothing to publish' }, { status: 409 })
    }
    const revalidate = await pingEditionRevalidate(res.edition.date)
    return NextResponse.json({ ok: true, edition: res.edition, publicUrl: editionPublicUrl(res.edition.date), revalidate })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'publish failed' }, { status: 500 })
  }
}
