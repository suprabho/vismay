import { NextResponse } from 'next/server'
import { getViewableStorySlugs, getStoryContent } from '@/lib/content'
import { hasStoryConfig, loadStoryConfig, loadShareConfig } from '@/lib/storyConfig'
import { resolveUnits } from '@/lib/resolveUnits'

export async function GET() {
  const allSlugs = await getViewableStorySlugs()
  const eligible = await Promise.all(
    allSlugs.map(async (slug) => ((await hasStoryConfig(slug)) ? slug : null))
  )
  const slugs = eligible.filter((s): s is string => s !== null)

  const stories = await Promise.all(
    slugs.map(async (slug) => {
      const config = await loadStoryConfig(slug)
      const shareConfig = await loadShareConfig(slug)
      const story = await getStoryContent(slug)
      const { units, mobileUnits, shareUnits } = resolveUnits(
        slug,
        story.sections,
        config
      )
      return { slug, config, shareConfig, units, mobileUnits, shareUnits }
    })
  )
  return NextResponse.json(stories)
}
