import { NextResponse } from 'next/server'
import { checkPassword, setAuthCookie } from '@/lib/adminAuth'

export async function POST(req: Request) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string }
  if (typeof password !== 'string' || !checkPassword(password)) {
    return NextResponse.json({ error: 'invalid password' }, { status: 401 })
  }
  await setAuthCookie()
  return NextResponse.json({ ok: true })
}
