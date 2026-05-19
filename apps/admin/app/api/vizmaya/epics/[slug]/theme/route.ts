import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { isAuthed } from '@/lib/adminAuth'
import { getEpicForAdmin, updateEpicTheme } from '@/lib/epics'
import { getThemeMeta } from '@/app/vizmaya/epics/themeRegistry.server'

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  const meta = getThemeMeta(slug)
  if (!meta) return NextResponse.json({ error: 'no theme registered for this epic' }, { status: 404 })
  const epic = await getEpicForAdmin(slug)
  if (!epic) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({
    slug: epic.slug,
    name: epic.name,
    defaults: meta.defaults,
    labels: meta.labels,
    theme: epic.theme,
  })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })

  const meta = getThemeMeta(slug)
  if (!meta) return NextResponse.json({ error: 'no theme registered for this epic' }, { status: 404 })
  const allowedKeys = Object.keys(meta.defaults)

  const body = (await req.json().catch(() => null)) as { theme?: unknown } | null
  if (!body || typeof body.theme !== 'object' || body.theme === null) {
    return NextResponse.json({ error: 'expected { theme: {...} }' }, { status: 400 })
  }

  // Validate: only known keys, only hex strings. Empty string clears the key.
  const sanitized: Record<string, string> = {}
  for (const [key, value] of Object.entries(body.theme as Record<string, unknown>)) {
    if (!allowedKeys.includes(key)) continue
    if (value === '' || value == null) continue
    if (typeof value !== 'string' || !HEX.test(value)) {
      return NextResponse.json({ error: `${key}: expected hex like #aabbcc` }, { status: 400 })
    }
    sanitized[key] = value
  }

  try {
    await updateEpicTheme(slug, sanitized)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'write failed' },
      { status: 500 }
    )
  }

  // Flush the public epic page so the new palette appears immediately.
  revalidatePath(`/${slug}`)
  return NextResponse.json({ ok: true, theme: sanitized })
}
