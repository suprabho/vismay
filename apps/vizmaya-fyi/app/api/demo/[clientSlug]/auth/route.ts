import { NextResponse } from 'next/server'
import {
  checkRateLimit,
  setDemoCookie,
  verifyPassword,
} from '@/lib/demoAuth'
import { getDemoByClientSlug, isValidClientSlug } from '@/lib/demos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientSlug: string }> }
) {
  const { clientSlug } = await params
  if (!isValidClientSlug(clientSlug)) {
    return NextResponse.json({ error: 'bad client_slug' }, { status: 400 })
  }

  const blocked = checkRateLimit(clientSlug)
  if (blocked != null) {
    return NextResponse.json(
      { error: `too many attempts, retry in ${blocked}s` },
      { status: 429 }
    )
  }

  const body = (await req.json().catch(() => null)) as { password?: string } | null
  const password = body?.password
  if (typeof password !== 'string' || password.length === 0) {
    return NextResponse.json({ error: 'password required' }, { status: 400 })
  }

  const demo = await getDemoByClientSlug(clientSlug)
  // Drafts are reachable with the right password — `status` is a label,
  // not an extra gate. Archived/missing collapse into the same generic
  // 401 as wrong-password to avoid leaking which slugs exist. Must agree
  // with the page + login-redirect checks below or we get a redirect loop.
  if (!demo || demo.status === 'archived') {
    return NextResponse.json({ error: 'invalid password' }, { status: 401 })
  }

  if (!verifyPassword(password, demo.password_hash)) {
    return NextResponse.json({ error: 'invalid password' }, { status: 401 })
  }

  await setDemoCookie(clientSlug, demo.password_hash)
  return NextResponse.json({ ok: true })
}
