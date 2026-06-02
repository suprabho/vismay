export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getStoryContent } from '@vismay/content-source/content'
import { loadStoryConfig, hasStoryConfig } from '@vismay/content-source/storyConfig'
import { hydrateFootshortsConfig } from '@vismay/content-source/hydrateFootshortsConfig'
import { getContentSource } from '@vismay/content-source/contentSource'
import { parseMapOverrides } from '@vismay/viz-engine'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { themeToMapPalette } from '@/lib/themeToMapPalette'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import ThemeProvider from '@/components/story/ThemeProvider'
import StoryShell from '@/components/story/StoryShell'
import VerticalLoader from '@/components/VerticalLoader'

interface RouteParams {
  params: Promise<{ slug: string; id: string }>
}

/**
 * Single-section render target for the admin canvas. Mounts the same
 * StoryShell the public /story/[slug] page mounts — same providers,
 * same legacy text card, same hero panel — but with `units` shrunk to the
 * one focused section so the iframe shows exactly that section's render.
 *
 * Headless: no homepage logo, no aura/capture chrome, no nav. The iframe
 * in the admin canvas is meant to BE the section, not host page chrome
 * around it.
 *
 * Section identity: `id` matches `StorySectionConfig.id` when set,
 * otherwise the auto-generated `section-<parentIndex>` slug the canvas
 * uses. Bad ids fall through to a 404.
 */
export default async function CanvasFramePage({ params }: RouteParams) {
  const { slug, id } = await params

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
  const { units } = resolveUnits(slug, story.sections, config)

  // Find the section the admin asked for. Mirror the id derivation the
  // canvas uses (section.id, else `section-<parentIndex>`).
  const focusedUnits = units.filter(
    (u) =>
      u.subIndex === 0 &&
      (u.parentConfig.id === id || `section-${u.parentIndex}` === id)
  )
  if (focusedUnits.length === 0) notFound()

  // StoryShell handles units[] uniformly — passing a length-1 array makes
  // it a story-of-one. The IntersectionObserver, scroll snap, and active-unit
  // tracking all degenerate to "the one unit is always active".
  const focusedUnit = focusedUnits[0]
  // Carry every unit that shares this parent (e.g. subsections) so the unit
  // selector inside StoryShell still has chart/scroll context to work
  // with. The shell will render the first one as active.
  const parentUnits = units.filter((u) => u.parentIndex === focusedUnit.parentIndex)

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
      <VerticalLoader vertical={story.frontmatter.vertical}>
        <StoryShell
          units={parentUnits}
          accessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''}
          defaults={defaults}
          slug={slug}
          mapOverrides={mapOverrides}
          // Match the public /story/[slug] page: a deck-format story must
          // render through the deck foreground layout, not the legacy
          // map chart-panel path. Omitting this defaulted to 'map', which
          // shoved deck vizslots (bigStat, bodyText, …) into the fixed
          // chart panel — drawing a stray gray rounded card behind them.
          format={story.frontmatter.format ?? 'map'}
        />
      </VerticalLoader>
    </ThemeProvider>
  )
}
