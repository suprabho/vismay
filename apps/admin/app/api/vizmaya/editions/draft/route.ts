import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { adminEmail } from '@/lib/adminIdentity'
import { getDraftEdition, saveDraftEdition, type EditionTextPatch } from '@vismay/content-source/dcEditions'
import { composerStatus, draftPreviewUrl, isRecomposeConfigured } from '@/lib/editionsAdmin'

export const dynamic = 'force-dynamic'

// The current draft with its content plus the composer's candidates (so
// dropped items can be restored), the signed preview URL and whether
// Recompose can dispatch the workflow from here.
export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const [draft, status] = await Promise.all([getDraftEdition(), composerStatus()])
    return NextResponse.json({
      draft,
      previewUrl: draft ? draftPreviewUrl() : null,
      recomposeConfigured: isRecomposeConfigured(),
      composerLastRun: status?.lastRun ?? null,
      now: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'read failed' }, { status: 500 })
  }
}

// Patch the draft's prose: headline, sub, the six key notes (metric, unit,
// label, text, sources picked from the window's stories, energy), each
// layer's headline / sub / notes, the research headline / sub. Sources are
// validated server-side against the edition's own stories and papers; every
// save is audited in ai_generations (kind edition_edit).
export async function PUT(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as EditionTextPatch | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'expected a JSON patch' }, { status: 400 })
  try {
    const draft = await saveDraftEdition(body, { editor: await adminEmail() })
    return NextResponse.json({ ok: true, draft })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'save failed'
    const status = /no draft/.test(msg) ? 404 : /expected|longer than|must be/.test(msg) ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
