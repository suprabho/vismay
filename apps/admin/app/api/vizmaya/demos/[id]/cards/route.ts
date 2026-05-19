import { NextResponse } from 'next/server'
import { parse as parseYaml } from 'yaml'
import { isAuthed } from '@/lib/adminAuth'
import { getDemoById } from '@vismay/content-source/demos'
import { getStoryContent } from '@vismay/content-source/content'
import { loadStoryConfig, hasStoryConfig } from '@vismay/content-source/storyConfig'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { buildShareCardList } from '@vismay/content-source/shareCardList'
import { getContentSource } from '@vismay/content-source/contentSource'
import type { ShareConfig } from '@vismay/viz-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id: idParam } = await params
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'bad id' }, { status: 400 })
  }
  const demo = await getDemoById(id)
  if (!demo) return NextResponse.json({ error: 'not found' }, { status: 404 })

  if (!(await hasStoryConfig(demo.story_slug))) {
    return NextResponse.json({ cards: [], reason: 'story has no config' })
  }

  try {
    const story = await getStoryContent(demo.story_slug)
    const config = await loadStoryConfig(demo.story_slug)
    const { mobileUnits } = resolveUnits(demo.story_slug, story.sections, config)

    const src = getContentSource()
    const shareYaml = await src.readShareYaml(demo.story_slug)
    let shareOverrides: ShareConfig['sections'] | null = null
    if (shareYaml) {
      try {
        const parsed = parseYaml(shareYaml) as ShareConfig | null
        shareOverrides = parsed?.sections ?? null
      } catch {
        shareOverrides = null
      }
    }

    const cards = buildShareCardList(mobileUnits, shareOverrides)
    return NextResponse.json({ cards })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'cards failed' },
      { status: 500 }
    )
  }
}
