import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import {
  isPrimaryColorHex,
  updateEntityPrimaryColor,
} from '@vismay/content-source/footshortsData'

/**
 * Set (or clear) an entity's primary brand color.
 *   PATCH /api/footshorts/assets/entities/:id  body: { primary_color: "#RRGGBB" | null }
 * Writes `entities.primary_color`, which the live footshorts app + recaps read.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  const raw = (body as { primary_color?: unknown })?.primary_color
  if (raw !== null && !isPrimaryColorHex(raw)) {
    return NextResponse.json(
      { error: 'primary_color must be a #RRGGBB hex string or null' },
      { status: 400 },
    )
  }

  try {
    const entity = await updateEntityPrimaryColor(id, raw as string | null)
    return NextResponse.json({ ok: true, entity })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to update color' },
      { status: 500 },
    )
  }
}
