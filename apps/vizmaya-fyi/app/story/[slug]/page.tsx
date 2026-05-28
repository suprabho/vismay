export const revalidate = 60

import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getStoryContent, getViewableStorySlugs } from '@vismay/content-source/content'
import { loadStoryConfig, hasStoryConfig } from '@vismay/content-source/storyConfig'
import { hydrateFootshortsConfig } from '@vismay/content-source/hydrateFootshortsConfig'
import { getContentSource } from '@vismay/content-source/contentSource'
import { parseMapOverrides } from '@vismay/viz-engine'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { themeToMapPalette } from '@/lib/themeToMapPalette'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import ThemeProvider from '@/components/story/ThemeProvider'
import StoryMapShell from '@/components/story/StoryMapShell'
import StoryBackgroundSlot, { StoryBackgroundOverlay } from '@/components/story/StoryBackgroundSlot'
import VerticalLoader from '@/components/VerticalLoader'
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
    // Hydrate footshorts stories with real team data from Supabase
    // (`entities` table). YAML-explicit overrides win; Supabase fills the
    // gaps; the bundled palette is the final fallback at render time. A
    // missing Supabase config is a no-op, so dev without env vars still
    // renders the story with monogram placeholders.
    if (story.frontmatter.vertical === 'footshorts') {
      try {
        config = await hydrateFootshortsConfig(config)
      } catch {
        // Hydration must never block rendering — fall back silently.
      }
    }
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

  // Page-level backdrop. Mount only for deck-format stories — map stories
  // own their backdrop through Mapbox per section, and adding a fixed aura
  // behind a live map composes oddly. `frontmatter.aura` doubles as the
  // home tile background; only deck stories promote it into a story-page
  // backdrop. VerticalCaptureFrame owns its own backdrop in 9:16 compose
  // mode but renders client-side, so harmless overlap is acceptable.
  const isDeck = story.frontmatter.format === 'deck'
  const backgroundConfig = config.defaults.storyBackground
  const hasBackdrop = isDeck && (backgroundConfig != null || !!story.frontmatter.aura)

  return (
    <ThemeProvider theme={story.frontmatter.theme} transparent={hasBackdrop}>
      {fontImportUrl && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link href={fontImportUrl} rel="stylesheet" />
        </>
      )}
      {hasBackdrop && (
        <>
          <StoryBackgroundSlot
            config={backgroundConfig}
            frontmatterAura={story.frontmatter.aura}
          />
          <StoryBackgroundOverlay config={config.defaults.overlay} />
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
            format={story.frontmatter.format ?? 'map'}
          />
        </VerticalLoader>
      </VerticalCaptureFrame>
    </ThemeProvider>
  )
}
