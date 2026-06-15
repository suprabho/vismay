import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import {
  isHeygenConfigured,
  getTemplate,
  HeygenApiError,
} from '@vismay/content-source/heygenTemplate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Fetch a single template's detail — `variables` drives the dynamic form. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!isHeygenConfigured()) {
    return NextResponse.json({ error: 'HeyGen not configured' }, { status: 503 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'missing template id' }, { status: 400 })
  }

  try {
    const template = await getTemplate(id)
    return NextResponse.json({ template })
  } catch (e) {
    const status = e instanceof HeygenApiError ? 502 : 500
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to load template' },
      { status },
    )
  }
}
