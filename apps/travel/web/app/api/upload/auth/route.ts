import { NextResponse } from 'next/server'
import { uploadAuth } from '@/lib/uploadAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { password?: string } | null
  const password = body?.password
  if (typeof password !== 'string' || password.length === 0) {
    return NextResponse.json({ error: 'password required' }, { status: 400 })
  }
  if (!uploadAuth.checkPassword(password)) {
    return NextResponse.json({ error: 'invalid password' }, { status: 401 })
  }
  await uploadAuth.setAuthCookie()
  return NextResponse.json({ ok: true })
}
