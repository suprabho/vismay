import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import {
  isPrimaryColorHex,
  updateEntityPrimaryColor,
  updateEntityAvatarBgColor,
  updateEntityStoryStyle,
  type AssetEntity,
  type AssetStoryStyle,
} from '@vismay/content-source/footshortsData'
import { parseEntityStyle, type EntityStyle } from '@vismay/html-stories/styles'

/**
 * Set (or clear) an entity's colors. Send whichever field(s) you're editing:
 *   PATCH /api/footshorts/assets/entities/:id
 *     body: { primary_color?: "#RRGGBB" | null, avatar_bg_color?: "#RRGGBB" | null,
 *             story_style?: { palette, fonts } | null }
 * `primary_color` drives card glow + match tiles; `avatar_bg_color` is the
 * dedicated feed avatar-disc background. Both are read by the live footshorts app.
 * `story_style` (competitions and teams) is the palette + font trio the
 * HTML-stories brief offers as that competition's or team's style.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  const b = (body ?? {}) as { primary_color?: unknown; avatar_bg_color?: unknown; story_style?: unknown }
  const hasPrimary = 'primary_color' in b
  const hasAvatar = 'avatar_bg_color' in b
  const hasStyle = 'story_style' in b
  if (!hasPrimary && !hasAvatar && !hasStyle) {
    return NextResponse.json(
      { error: 'provide primary_color, avatar_bg_color and/or story_style' },
      { status: 400 },
    )
  }
  let storyStyle: EntityStyle | null = null
  if (hasStyle && b.story_style !== null) {
    const parsed = parseEntityStyle(b.story_style)
    if ('error' in parsed) return NextResponse.json({ error: `story_style: ${parsed.error}` }, { status: 400 })
    storyStyle = parsed.style
  }
  for (const [key, raw] of [
    ['primary_color', b.primary_color] as const,
    ['avatar_bg_color', b.avatar_bg_color] as const,
  ]) {
    if (!(key in b)) continue
    if (raw !== null && !isPrimaryColorHex(raw)) {
      return NextResponse.json(
        { error: `${key} must be a #RRGGBB hex string or null` },
        { status: 400 },
      )
    }
  }

  try {
    let entity: AssetEntity | undefined
    if (hasPrimary) entity = await updateEntityPrimaryColor(id, b.primary_color as string | null)
    if (hasAvatar) entity = await updateEntityAvatarBgColor(id, b.avatar_bg_color as string | null)
    if (hasStyle) entity = await updateEntityStoryStyle(id, storyStyle as AssetStoryStyle | null)
    return NextResponse.json({ ok: true, entity })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to update entity' },
      { status: 500 },
    )
  }
}
