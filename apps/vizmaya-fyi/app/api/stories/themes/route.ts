import { getViewableStorySlugs, getStoryContent } from '@/lib/content'
import { NextResponse } from 'next/server'

export async function GET() {
  const slugs = await getViewableStorySlugs()
  const stories = await Promise.all(
    slugs.map(async (slug) => {
      const { frontmatter } = await getStoryContent(slug)
      return {
        slug,
        title: frontmatter.title,
        theme: frontmatter.theme,
      }
    })
  )
  return NextResponse.json(stories)
}
