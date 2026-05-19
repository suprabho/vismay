import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { isAuthed } from '@/lib/adminAuth'
import { getEpicForAdmin, updateEpicTheme } from '@vismay/content-source/epics'
import { getThemeMeta } from '@/app/vizmaya/epics/themeRegistry.server'

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
// Map style URLs are either Mapbox-hosted (mapbox://styles/owner/id) or a
// raw http(s) URL to a style JSON. Cap length so a paste-bomb can't blow up
// the JSONB row.
const MAP_STYLE = /^(mapbox:\/\/styles\/[\w-]+\/[\w-]+|https?:\/\/[^\s]+)$/
const MAX_FONT_LEN = 60
const MAX_MAP_STYLE_LEN = 500
const FONT_KEYS = ['serif', 'sans', 'mono'] as const

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
    fontDefaults: meta.fontDefaults,
    mapStyleDefault: meta.mapStyleDefault,
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
  const allowedColorKeys = Object.keys(meta.defaults)

  const body = (await req.json().catch(() => null)) as { theme?: unknown } | null
  if (!body || typeof body.theme !== 'object' || body.theme === null) {
    return NextResponse.json({ error: 'expected { theme: {...} }' }, { status: 400 })
  }

  // Known color keys must be hex; `fonts` must be { serif?, sans?, mono? } strings;
  // `mapStyle` must be a mapbox:// or http(s) URL. Empty values clear the override.
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body.theme as Record<string, unknown>)) {
    if (key === 'fonts') {
      if (value === '' || value == null) continue
      if (typeof value !== 'object' || Array.isArray(value)) {
        return NextResponse.json({ error: 'fonts: expected { serif?, sans?, mono? }' }, { status: 400 })
      }
      const fonts: Record<string, string> = {}
      for (const fk of FONT_KEYS) {
        const fv = (value as Record<string, unknown>)[fk]
        if (fv === '' || fv == null) continue
        if (typeof fv !== 'string' || fv.length > MAX_FONT_LEN) {
          return NextResponse.json({ error: `fonts.${fk}: expected non-empty string ≤${MAX_FONT_LEN} chars` }, { status: 400 })
        }
        fonts[fk] = fv
      }
      if (Object.keys(fonts).length > 0) sanitized.fonts = fonts
      continue
    }
    if (key === 'mapStyle') {
      if (value === '' || value == null) continue
      if (typeof value !== 'string' || value.length > MAX_MAP_STYLE_LEN || !MAP_STYLE.test(value)) {
        return NextResponse.json({ error: 'mapStyle: expected a mapbox:// or http(s) URL' }, { status: 400 })
      }
      sanitized.mapStyle = value
      continue
    }
    if (!allowedColorKeys.includes(key)) continue
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
