import { notFound } from 'next/navigation'
import { getStoryContent } from '@vismay/content-source/content'
import { loadStoryConfig, hasStoryConfig } from '@vismay/content-source/storyConfig'
import { hydrateFootshortsConfig } from '@vismay/content-source/hydrateFootshortsConfig'
import { hydrateTravelConfig } from '@vismay/content-source/travelScrapbook'
import { getContentSource } from '@vismay/content-source/contentSource'
import { parseMapOverrides } from '@vismay/viz-engine'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import { themeToMapPalette } from '../lib/themeToMapPalette'
import ThemeProvider from '../story/ThemeProvider'
import StoryShell from '../story/StoryShell'
import VerticalLoader from '../story/VerticalLoader'

export interface StoryTimelineFrameSurfaceProps {
  slug: string
  mapboxToken: string
}

/**
 * Full-story render target for the admin stage-timeline editor (E1). Mounts
 * the same StoryShell the public /story/[slug] page mounts — same providers,
 * same rendering — but with the WHOLE resolved `units[]` (no section filter,
 * unlike `CanvasFrameSurface`'s "story of one"), so the editor's beats-axis
 * timeline can seek across every beat in one preview.
 *
 * Headless: no homepage logo, no aura/capture chrome, no nav — the editor
 * IS the chrome. `StoryShell` itself reads `?editor=1` off the URL to enable
 * the `viz-story-seek` postMessage bridge; this surface needs no extra prop
 * for that.
 *
 * Draft-safe like the canvas frame: `getStoryContent(slug, { allowDraft: true })`
 * — the public /story/[slug] page omits `allowDraft` and 404s a draft story
 * in production, but authors need to scrub a story while it's still a draft.
 */
export async function StoryTimelineFrameSurface({
  slug,
  mapboxToken,
}: StoryTimelineFrameSurfaceProps) {
  let story
  let config
  let mapYaml: string | null = null
  try {
    story = await getStoryContent(slug, { allowDraft: true })
    if (!(await hasStoryConfig(slug))) notFound()
    config = await loadStoryConfig(slug)
    if (story.frontmatter.vertical === 'footshorts') {
      try {
        config = await hydrateFootshortsConfig(config)
      } catch {
        // Hydration must never block rendering — fall back silently.
      }
    }
    if (story.frontmatter.vertical === 'travel') {
      try {
        config = await hydrateTravelConfig(slug, config, story.frontmatter)
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
          units={units}
          accessToken={mapboxToken}
          defaults={defaults}
          slug={slug}
          mapOverrides={mapOverrides}
          format={story.frontmatter.format ?? 'map'}
        />
      </VerticalLoader>
    </ThemeProvider>
  )
}
