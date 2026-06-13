import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  getStoryContent,
  getViewableStorySlugs,
} from '@vismay/content-source/content'
import { hasStoryConfig, loadStoryConfig } from '@vismay/content-source/storyConfig'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'

import KidzovoStoryShell from '@/components/KidzovoStoryShell'
import ThemeProvider from '@/components/ThemeProvider'
import VerticalLoader from '@/components/VerticalLoader'

export const revalidate = 60

interface RouteParams {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const slugs = await getViewableStorySlugs()
  const withConfig = await Promise.all(
    slugs.map(async (slug) => ((await hasStoryConfig(slug)) ? slug : null))
  )
  return withConfig.filter((s): s is string => s !== null).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params
  try {
    const { frontmatter } = await getStoryContent(slug)
    const title = frontmatter.subtitle
      ? `${frontmatter.title} — ${frontmatter.subtitle}`
      : frontmatter.title
    return {
      title,
      description: frontmatter.subtitle,
      authors: frontmatter.byline ? [{ name: frontmatter.byline }] : undefined,
      openGraph: {
        type: 'article',
        title: frontmatter.title,
        description: frontmatter.subtitle,
        url: `/story/${slug}`,
        siteName: 'Kidzovo',
        locale: 'en_US',
        publishedTime: frontmatter.date,
      },
    }
  } catch {
    return {}
  }
}

export default async function KidzovoStoryPage({ params }: RouteParams) {
  const { slug } = await params

  let story
  let config
  try {
    story = await getStoryContent(slug)
    if (!(await hasStoryConfig(slug))) notFound()
    config = await loadStoryConfig(slug)
  } catch {
    notFound()
  }

  if (story.frontmatter.vertical !== 'kidzovo') {
    // Surface a clear 404 rather than rendering a story whose modules
    // aren't registered in this host. Cross-vertical stories live in
    // vizmaya-fyi (or their own host).
    notFound()
  }

  const { units } = resolveUnits(slug, story.sections, config)

  // Kidzovo never mounts a Mapbox background, so `config.defaults` is
  // passed through untouched. The parser fills in mapStyle/mapOpacity/etc.
  // with placeholder values from packages/content-source/src/storyConfig.ts
  // when the YAML omits a `defaults:` block — harmless because no map
  // module reads them in this host.
  const defaults = config.defaults

  const fontImportUrl = getFontImportUrl(story.frontmatter.theme.fonts)

  return (
    <ThemeProvider theme={story.frontmatter.theme}>
      {fontImportUrl && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link href={fontImportUrl} rel="stylesheet" />
        </>
      )}
      <VerticalLoader vertical={story.frontmatter.vertical}>
        <KidzovoStoryShell units={units} slug={slug} defaults={defaults} />
      </VerticalLoader>
    </ThemeProvider>
  )
}
