import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { listSessions } from '../shared'

/** List saved compose sessions (newest first) for the reload-resume picker. */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const sessions = await listSessions()
  return NextResponse.json({ ok: true, sessions })
}
