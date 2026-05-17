export const revalidate = 60

import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getStoryContent, getViewableStorySlugs } from '@/lib/content'
import { loadStoryConfig, hasStoryConfig } from '@/lib/storyConfig'
import { getContentSource } from '@/lib/contentSource'
import { parseMapOverrides } from '@/lib/storyMapOverrides'
import { resolveUnits } from '@/lib/resolveUnits'
import { themeToMapPalette } from '@/lib/themeToMapPalette'
import { getFontImportUrl } from '@/lib/getFontImports'
import ThemeProvider from '@/components/story/ThemeProvider'
import StoryMapShell from '@/components/story/StoryMapShell'
import VerticalLoader from '@/components/story/viz/VerticalLoader'
import VerticalCaptureFrame from '@/components/story/VerticalCaptureFrame'
import VizmayaLogo from '@/components/VizmayaLogo'

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
    const title = `${frontmatter.title} — ${frontmatter.subtitle}`
    const url = `/story/${slug}`

    return {
      title,
      description: frontmatter.subtitle,
      authors: [{ name: frontmatter.byline }],
      openGraph: {
        type: 'article',
        title: frontmatter.title,
        description: frontmatter.subtitle,
        url,
        siteName: 'vizmaya',
        locale: 'en_US',
        publishedTime: frontmatter.date,
      },
      twitter: {
        card: 'summary_large_image',
        title: frontmatter.title,
        description: frontmatter.subtitle,
      },
      alternates: {
        canonical: url,
      },
    }
  } catch {
    return {}
  }
}

export default async function StoryPage({ params }: RouteParams) {
  const { slug } = await params

  let story
  let config
  let mapYaml: string | null = null
  try {
    story = await getStoryContent(slug)
    if (!(await hasStoryConfig(slug))) notFound()
    config = await loadStoryConfig(slug)
    // Autoplay map overrides — read here so they ship in the SSG bundle
    // alongside the resolved config; StoryMapShell only applies them when
    // it sees `?autoplay=1` in the URL (client-side detection). Scroll
    // mode never sees the override, so this is a no-op for normal readers.
    mapYaml = await getContentSource().readMapYaml(slug)
  } catch {
    notFound()
  }


  const mapOverrides = parseMapOverrides(mapYaml)

  const { units, mobileUnits, hasMobileOverrides } = resolveUnits(
    slug,
    story.sections,
    config
  )

  const defaults = {
    ...config.defaults,
    mapPalette:
      config.defaults.mapPalette ?? themeToMapPalette(story.frontmatter.theme),
  }

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
      <VerticalCaptureFrame slug={slug} auraSlug={story.frontmatter.aura}>
        <Link
          href="/"
          className="fixed top-4 left-4 z-50 w-80 h-16 bg-white/2 rounded-full backdrop-blur-3xl cursor-pointer"
          aria-label="Home"
        >
          <VizmayaLogo
            className="w-full h-full"
            palette={{
              text: story.frontmatter.theme.colors.text,
              teal: story.frontmatter.theme.colors.teal,
              accent: story.frontmatter.theme.colors.accent,
              accent2: story.frontmatter.theme.colors.accent2,
              surface: story.frontmatter.theme.colors.surface,
              muted: story.frontmatter.theme.colors.muted,
              line: story.frontmatter.theme.colors.line,
            }}
          />
        </Link>
        <VerticalLoader vertical={story.frontmatter.vertical}>
          <StoryMapShell
            units={units}
            mobileUnits={hasMobileOverrides ? mobileUnits : undefined}
            accessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''}
            defaults={defaults}
            slug={slug}
            mapOverrides={mapOverrides}
          />
        </VerticalLoader>
      </VerticalCaptureFrame>
    </ThemeProvider>
  )
}
