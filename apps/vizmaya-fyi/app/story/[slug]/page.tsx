export const revalidate = 60

import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getStoryContent, getViewableStorySlugs } from '@vismay/content-source/content'
import { loadStoryConfig, hasStoryConfig } from '@vismay/content-source/storyConfig'
import { hydrateFootshortsConfig } from '@vismay/content-source/hydrateFootshortsConfig'
import { getContentSource } from '@vismay/content-source/contentSource'
import { parseMapOverrides, resolveSectionLogoPalettes } from '@vismay/viz-engine'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { themeToMapPalette } from '@/lib/themeToMapPalette'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import ThemeProvider from '@/components/story/ThemeProvider'
import StoryShell from '@/components/story/StoryShell'
import StoryBackgroundSlot, { StoryBackgroundOverlay } from '@/components/story/StoryBackgroundSlot'
import VerticalLoader from '@/components/VerticalLoader'
import VerticalCaptureFrame from '@/components/story/VerticalCaptureFrame'

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
    // alongside the resolved config; StoryShell only applies them when
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

  // Per-section Vizmaya-logo palettes, resolved server-side from theme tokens
  // (`$accent`, …) to concrete hex. Indexed by section `parentIndex`; the shell
  // re-tints the persistent logo to the active section's palette as the reader
  // scrolls. `config.sections` (not `story.sections`) — that's the array
  // `parentIndex` indexes into (see resolveUnits).
  const logoPalettes = resolveSectionLogoPalettes(
    story.frontmatter.theme,
    config.defaults,
    config.sections
  )

  const fontImportUrl = getFontImportUrl(story.frontmatter.theme.fonts)

  // Story images resolve to the Supabase public bucket in prod (see
  // resolveAssetUrl / the fs→db sync), so warm that connection early — the hero
  // is the LCP and its first byte should land sooner on cold cellular. No-op for
  // stories whose images are same-origin `/content/…` paths.
  let assetOrigin: string | null = null
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (supabaseUrl) assetOrigin = new URL(supabaseUrl).origin
  } catch {
    assetOrigin = null
  }

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
        {/* The persistent Vizmaya logo (home link) is rendered inside
            StoryShell so it can re-tint per active section — see its
            `logoPalettes` prop. */}
        <VerticalLoader vertical={story.frontmatter.vertical}>
          <StoryShell
            units={units}
            mobileUnits={hasMobileOverrides ? mobileUnits : undefined}
            accessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''}
            defaults={defaults}
            slug={slug}
            mapOverrides={mapOverrides}
            format={story.frontmatter.format ?? 'map'}
            logoPalettes={logoPalettes}
          />
        </VerticalLoader>
      </VerticalCaptureFrame>
    </ThemeProvider>
  )
}
