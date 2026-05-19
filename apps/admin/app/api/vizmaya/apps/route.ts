import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { listAppsWithCounts } from '@vismay/content-source/apps'

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const apps = await listAppsWithCounts()
  return NextResponse.json(apps)
}
