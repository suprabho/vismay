import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import {
  isHeygenConfigured,
  listTemplates,
  HeygenApiError,
} from '@vismay/content-source/heygenTemplate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** List the HeyGen templates available to the account (gallery source). */
export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!isHeygenConfigured()) {
    return NextResponse.json({ error: 'HeyGen not configured' }, { status: 503 })
  }

  try {
    const templates = await listTemplates()
    return NextResponse.json({ templates })
  } catch (e) {
    const status = e instanceof HeygenApiError ? 502 : 500
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to list templates' },
      { status },
    )
  }
}
