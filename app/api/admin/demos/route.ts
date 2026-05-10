import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { hashPassword } from '@/lib/demoAuth'
import { createDemo, isValidClientSlug, listDemos } from '@/lib/demos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SAFE_STORY_SLUG = /^[a-zA-Z0-9_-]+$/

interface CreateBody {
  client_slug?: string
  client_name?: string
  story_slug?: string
  password?: string
}

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const demos = await listDemos()
    return NextResponse.json({ demos })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'list failed' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as CreateBody | null
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  const { client_slug, client_name, story_slug, password } = body
  if (!client_slug || !isValidClientSlug(client_slug)) {
    return NextResponse.json(
      { error: 'client_slug must match /^[a-z0-9][a-z0-9_-]{1,63}$/' },
      { status: 400 }
    )
  }
  if (!client_name || typeof client_name !== 'string' || client_name.length === 0) {
    return NextResponse.json({ error: 'client_name required' }, { status: 400 })
  }
  if (!story_slug || !SAFE_STORY_SLUG.test(story_slug)) {
    return NextResponse.json({ error: 'story_slug invalid' }, { status: 400 })
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return NextResponse.json({ error: 'password must be at least 6 chars' }, { status: 400 })
  }
  try {
    const demo = await createDemo({
      client_slug,
      client_name,
      story_slug,
      password_hash: hashPassword(password),
    })
    return NextResponse.json({ demo })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'create failed'
    const status = message.includes('duplicate') || message.includes('unique') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
