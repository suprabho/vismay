import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { getDraftEdition } from '@vismay/content-source/dcEditions'
import { editionDateFor } from '@vismay/content-source/dcEditionTypes'
import { dispatchRecompose, isRecomposeConfigured } from '@/lib/editionsAdmin'

export const dynamic = 'force-dynamic'

// Re-run the composer on the same window via the compose-dc-edition
// workflow. The run appends to composer_runs and keeps editor edits unless
// `clearEdits` is set. The workflow takes a minute or two; the tab polls the
// draft for the new generated_at.
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isRecomposeConfigured()) {
    return NextResponse.json(
      { error: 'GITHUB_DISPATCH_TOKEN / GITHUB_DISPATCH_REPO are not set — run `pnpm ai-data-centers:compose-edition` or dispatch compose-dc-edition.yml by hand' },
      { status: 503 },
    )
  }
  const body = (await req.json().catch(() => ({}))) as { clearEdits?: unknown }
  try {
    const draft = await getDraftEdition()
    const date = draft?.date ?? editionDateFor(new Date())
    await dispatchRecompose({ date, clearEdits: body.clearEdits === true })
    return NextResponse.json({ ok: true, date, dispatched: true }, { status: 202 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'dispatch failed' }, { status: 500 })
  }
}
