import { getViewableStorySlugs, getStoryContent } from '@vismay/content-source/content'
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
