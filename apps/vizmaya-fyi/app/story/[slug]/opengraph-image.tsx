import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { getStoryContent, getViewableStorySlugs } from '@/lib/content'
import { hasStoryConfig } from '@/lib/storyConfig'
import { StoryOgCard } from '@/components/seo/StoryOgCard'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'vizmaya story preview'

export async function generateStaticParams() {
  const slugs = await getViewableStorySlugs()
  const withConfig = await Promise.all(
    slugs.map(async (slug) => ((await hasStoryConfig(slug)) ? slug : null))
  )
  return withConfig.filter((s): s is string => s !== null).map((slug) => ({ slug }))
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  let frontmatter
  try {
    ;({ frontmatter } = await getStoryContent(slug))
  } catch {
    notFound()
  }

  const c = frontmatter.theme.colors
  return new ImageResponse(
    (
      <StoryOgCard
        title={frontmatter.title}
        subtitle={frontmatter.subtitle}
        byline={frontmatter.byline}
        date={frontmatter.date}
        colors={{
          background: c.background,
          text: c.text,
          accent: c.accent,
          accent2: c.accent2,
          surface: c.surface,
          muted: c.muted,
        }}
      />
    ),
    { ...size }
  )
}
