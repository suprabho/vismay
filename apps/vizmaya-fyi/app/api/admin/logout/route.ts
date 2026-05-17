import { NextResponse } from 'next/server'
import { clearAuthCookie } from '@/lib/adminAuth'

export async function POST() {
  await clearAuthCookie()
  return NextResponse.json({ ok: true })
}
