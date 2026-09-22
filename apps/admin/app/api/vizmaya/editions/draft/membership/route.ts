import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { adminEmail } from '@/lib/adminIdentity'
import { setDraftMembership } from '@vismay/content-source/dcEditions'

export const dynamic = 'force-dynamic'

// Membership: the story and paper ids that stay in the edition. Dropped
// items stay in dc_news / dc_papers, just not in the frozen arrays; every
// numeric part of the draft is re-derived from what remains.
export async function PUT(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { storyIds?: unknown; paperIds?: unknown } | null
  if (!body) return NextResponse.json({ error: 'expected { storyIds?, paperIds? }' }, { status: 400 })
  const storyIds = Array.isArray(body.storyIds) ? body.storyIds.map(Number).filter(Number.isInteger) : undefined
  const paperIds = Array.isArray(body.paperIds) ? body.paperIds.filter((x): x is string => typeof x === 'string') : undefined
  if (!storyIds && !paperIds) return NextResponse.json({ error: 'nothing to change' }, { status: 400 })
  try {
    const draft = await setDraftMembership({ storyIds, paperIds }, { editor: await adminEmail() })
    return NextResponse.json({ ok: true, draft })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'update failed'
    return NextResponse.json({ error: msg }, { status: /no draft/.test(msg) ? 404 : 500 })
  }
}
