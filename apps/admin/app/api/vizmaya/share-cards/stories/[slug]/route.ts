import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { getStoryContent } from '@vismay/content-source/content'
import { loadStoryConfig, hasStoryConfig } from '@vismay/content-source/storyConfig'
import { resolveUnits } from '@vismay/content-source/resolveUnits'

export const dynamic = 'force-dynamic'

/**
 * Serialized story content for the share-card composer. Returns the story's
 * theme + vertical + title, the map-related `defaults`, and the resolved units
 * (sections) the composer renders cards from. Mirrors how CanvasPage loads a
 * story, but ships a plain-JSON slice to the client rather than mounting it.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  try {
    if (!(await hasStoryConfig(slug))) {
      return NextResponse.json({ error: 'story has no config' }, { status: 404 })
    }
    const [story, config] = await Promise.all([
      getStoryContent(slug),
      loadStoryConfig(slug),
    ])
    const { units, shareUnits, hasShareOverrides } = resolveUnits(
      slug,
      story.sections,
      config,
    )
    return NextResponse.json({
      ok: true,
      slug,
      title: story.frontmatter.title,
      vertical: story.frontmatter.vertical ?? null,
      theme: story.frontmatter.theme,
      defaults: config.defaults,
      units: hasShareOverrides ? shareUnits : units,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to load story' },
      { status: 500 },
    )
  }
}
