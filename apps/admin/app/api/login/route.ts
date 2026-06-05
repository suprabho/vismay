import { NextResponse } from 'next/server'
import { signIn } from '@/lib/adminAuth'

export async function POST(req: Request) {
  const { email, password } = (await req.json().catch(() => ({}))) as {
    email?: string
    password?: string
  }
  if (typeof password !== 'string' || password.length === 0) {
    return NextResponse.json({ error: 'password required' }, { status: 400 })
  }
  const result = await signIn(typeof email === 'string' ? email : '', password)
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'invalid credentials' }, { status: 401 })
  }
  return NextResponse.json({ ok: true })
}
