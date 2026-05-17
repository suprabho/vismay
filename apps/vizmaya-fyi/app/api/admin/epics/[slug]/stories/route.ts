import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { isAuthed } from '@/lib/adminAuth'
import {
  getEpicForAdmin,
  getEpicMemberships,
  setEpicMemberships,
} from '@/lib/epics'

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })

  const epic = await getEpicForAdmin(slug)
  if (!epic) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const stories = await getEpicMemberships(slug)
  return NextResponse.json({
    slug: epic.slug,
    name: epic.name,
    appSlug: epic.appSlug,
    stories,
  })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })

  const epic = await getEpicForAdmin(slug)
  if (!epic) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = (await req.json().catch(() => null)) as
    | { memberships?: unknown }
    | null
  if (!body || !Array.isArray(body.memberships)) {
    return NextResponse.json({ error: 'expected { memberships: [...] }' }, { status: 400 })
  }

  const sanitized: { storySlug: string; position: number | null }[] = []
  const seen = new Set<string>()
  for (const m of body.memberships as unknown[]) {
    if (!m || typeof m !== 'object') {
      return NextResponse.json({ error: 'each membership must be an object' }, { status: 400 })
    }
    const { storySlug, position } = m as { storySlug?: unknown; position?: unknown }
    if (typeof storySlug !== 'string' || !SAFE_SLUG.test(storySlug)) {
      return NextResponse.json({ error: `bad storySlug: ${String(storySlug)}` }, { status: 400 })
    }
    if (seen.has(storySlug)) {
      return NextResponse.json({ error: `duplicate storySlug: ${storySlug}` }, { status: 400 })
    }
    seen.add(storySlug)
    let pos: number | null = null
    if (position != null) {
      if (typeof position !== 'number' || !Number.isFinite(position) || !Number.isInteger(position)) {
        return NextResponse.json({ error: `${storySlug}: position must be an integer or null` }, { status: 400 })
      }
      pos = position
    }
    sanitized.push({ storySlug, position: pos })
  }

  try {
    await setEpicMemberships(slug, sanitized)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'write failed' },
      { status: 500 }
    )
  }

  // Flush the public epic landing page so the new story list appears.
  revalidatePath(`/${slug}`)
  return NextResponse.json({ ok: true, count: sanitized.length })
}
