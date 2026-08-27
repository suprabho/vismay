import { notFound } from 'next/navigation'
import { getContentSource } from '@vismay/content-source/contentSource'
import { getStoryContent } from '@vismay/content-source/content'
import { loadStoryConfig, hasStoryConfig } from '@vismay/content-source/storyConfig'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import {
  parseNewsletterConfig,
  resolveNewsletterBlocks,
} from '@vismay/content-source/storyNewsletterConfig'
import { themeToMapPalette } from '../lib/themeToMapPalette'
import ThemeProvider from '../story/ThemeProvider'
import VerticalLoader from '../story/VerticalLoader'
import NewsletterShell from '../newsletter/NewsletterShell'

export interface NewsletterSurfaceProps {
  slug: string
  searchParams: { print?: string }
  mapboxToken: string
}

/**
 * Capture stage for the HTML newsletter render — mounts only the visual
 * blocks (maps / charts / deck panels) the newsletter config selects, each
 * behind a `[data-newsletter-visual]` marker the render worker screenshots.
 * The newsletter HTML itself is assembled server-side by the worker
 * (storyNewsletterRender.ts); this surface never shows prose.
 *
 * Drafts render here on purpose: the route is signed-URL-gated (same policy
 * as the canvas frame) and editors prep the newsletter before publishing.
 */
export async function NewsletterSurface({
  slug,
  searchParams,
  mapboxToken,
}: NewsletterSurfaceProps) {
  const print = searchParams.print === '1'

  // Auth handled by middleware (signed URL token).

  let story
  let config
  try {
    story = await getStoryContent(slug, { allowDraft: true })
    if (!(await hasStoryConfig(slug))) notFound()
    config = await loadStoryConfig(slug)
  } catch {
    notFound()
  }

  const { units } = resolveUnits(slug, story.sections, config)
  const newsletterCfg = parseNewsletterConfig(
    await getContentSource().readNewsletterYaml(slug)
  )
  const blocks = resolveNewsletterBlocks(
    units,
    newsletterCfg,
    story.frontmatter.format ?? 'map'
  ).filter((b) => b.visuals.length > 0)

  const configWithDefaults = {
    ...config,
    defaults: {
      ...config.defaults,
      mapPalette:
        config.defaults.mapPalette ?? themeToMapPalette(story.frontmatter.theme),
    },
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
        <NewsletterShell
          slug={slug}
          blocks={blocks}
          config={configWithDefaults}
          format={story.frontmatter.format ?? 'map'}
          accessToken={mapboxToken}
          print={print}
        />
      </VerticalLoader>
    </ThemeProvider>
  )
}
