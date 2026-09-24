export const revalidate = 60

import { notFound } from 'next/navigation'
import { getStoryContent } from '@vismay/content-source/content'
import { loadStoryConfig, hasStoryConfig } from '@vismay/content-source/storyConfig'
import { hydrateFootshortsConfig } from '@vismay/content-source/hydrateFootshortsConfig'
import { getContentSource } from '@vismay/content-source/contentSource'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import { parseMapOverrides, resolveSectionLogoPalettes } from '@vismay/viz-engine'
import { themeToMapPalette } from '@vismay/render-surface'
import { StoryShell, ThemeProvider, VerticalLoader } from '@vismay/render-surface/story'
import StoryBackgroundSlot, { StoryBackgroundOverlay } from '@/components/story/StoryBackgroundSlot'
import VerticalCaptureFrame from '@/components/story/VerticalCaptureFrame'
import { mapboxToken } from '@/lib/env'

interface RouteParams {
  params: Promise<{ slug: string }>
}

// No slugs are prerendered at build time; each story renders on first request
// and is then cached for `revalidate` seconds (ISR).
export async function generateStaticParams() {
  return []
}

/**
 * Public interactive story reader — the "general Viz story view" that consumer
 * apps (vizf1, footshorts, umami, …) embed via `@vismay/story-embed`
 * (`/story/<slug>?embed=1`). Unlike the other routes on this app it is NOT
 * behind the signed-URL middleware: it serves published stories only (drafts
 * 404) to anyone, like vizmaya.fyi's own reader.
 *
 * Mirrors the body of vizmaya-fyi's `app/story/[slug]/page.tsx`, minus the
 * vizmaya.fyi-only concerns: SEO metadata / JSON-LD (canonical stays on
 * vizmaya.fyi; this app is `noindex`), Amplitude reading-depth analytics, and
 * the topic-cluster links (hosts provide their own navigation).
 */
export default async function StoryReaderPage({ params }: RouteParams) {
  const { slug } = await params

  let story
  let config
  let mapYaml: string | null = null
  try {
    story = await getStoryContent(slug)
    if (!(await hasStoryConfig(slug))) notFound()
    config = await loadStoryConfig(slug)
    if (story.frontmatter.vertical === 'footshorts') {
      try {
        config = await hydrateFootshortsConfig(config)
      } catch {
        // Hydration must never block rendering — fall back silently.
      }
    }
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

  const logoPalettes = resolveSectionLogoPalettes(
    story.frontmatter.theme,
    config.defaults,
    config.sections
  )

  const fontImportUrl = getFontImportUrl(story.frontmatter.theme.fonts)

  let assetOrigin: string | null = null
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (supabaseUrl) assetOrigin = new URL(supabaseUrl).origin
  } catch {
    assetOrigin = null
  }

  // Deck stories get the page-level aura/background backdrop; map stories own
  // their backdrop through Mapbox per section.
  const isDeck = story.frontmatter.format === 'deck'
  const backgroundConfig = config.defaults.storyBackground
  const hasBackdrop = isDeck && (backgroundConfig != null || !!story.frontmatter.aura)

  return (
    <ThemeProvider theme={story.frontmatter.theme}>
      {fontImportUrl && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link href={fontImportUrl} rel="stylesheet" />
        </>
      )}
      {assetOrigin && <link rel="preconnect" href={assetOrigin} crossOrigin="" />}
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
        <VerticalLoader vertical={story.frontmatter.vertical}>
          <StoryShell
            units={units}
            mobileUnits={hasMobileOverrides ? mobileUnits : undefined}
            accessToken={mapboxToken()}
            defaults={defaults}
            slug={slug}
            mapOverrides={mapOverrides}
            format={story.frontmatter.format ?? 'map'}
            logoPalettes={logoPalettes}
            hideLogoInAutoplay={!!story.frontmatter.vertical}
          />
        </VerticalLoader>
      </VerticalCaptureFrame>
    </ThemeProvider>
  )
}
