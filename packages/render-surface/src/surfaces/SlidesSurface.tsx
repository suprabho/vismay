import { notFound } from 'next/navigation'
import { getContentSource } from '@vismay/content-source/contentSource'
import { getStoryContent } from '@vismay/content-source/content'
import { loadStoryConfig, hasStoryConfig } from '@vismay/content-source/storyConfig'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import type { ResolvedUnit } from '@vismay/viz-engine'
import { themeToMapPalette } from '../lib/themeToMapPalette'
import { themedLogoDataUrl } from '../lib/themeLogo'
import {
  applyReportOverrides,
  parseReportConfig,
} from '../lib/storyReportConfig'
import ThemeProvider from '../story/ThemeProvider'
import VerticalLoader from '../story/VerticalLoader'
import SlidesShell from '../pdf/SlidesShell'

function filterBySection(units: ResolvedUnit[], sectionId: string): ResolvedUnit[] {
  return units.filter(
    (u) =>
      u.parentConfig.id === sectionId ||
      `section-${u.parentIndex}` === sectionId
  )
}

export interface SlidesSurfaceProps {
  slug: string
  searchParams: { print?: string; embed?: string; section?: string }
  mapboxToken: string
}

export async function SlidesSurface({
  slug,
  searchParams,
  mapboxToken,
}: SlidesSurfaceProps) {
  const sp = searchParams
  const print = sp.print === '1'
  const embed = sp.embed === '1'
  const sectionFilter = typeof sp.section === 'string' ? sp.section : null

  // Auth handled by middleware (signed URL token).

  let story
  let config
  try {
    story = await getStoryContent(slug)
    if (!(await hasStoryConfig(slug))) notFound()
    config = await loadStoryConfig(slug)
  } catch {
    notFound()
  }

  const { units, shareUnits, hasShareOverrides } = resolveUnits(
    slug,
    story.sections,
    config
  )
  const baseSlideUnits = hasShareOverrides ? shareUnits : units
  const reportConfigRaw = await getContentSource().readReportYaml(slug)
  const reportConfig = parseReportConfig(reportConfigRaw, 'slides')
  const allSlideUnits = applyReportOverrides(baseSlideUnits, reportConfig)
  // `?section=<id>` scopes the deck to one slide — the canvas embeds this
  // route to preview a single section's slide. Run the filter AFTER report
  // overrides so include:false units are correctly excluded first.
  const slideUnits = sectionFilter
    ? filterBySection(allSlideUnits, sectionFilter)
    : allSlideUnits

  const configWithDefaults = {
    ...config,
    defaults: {
      ...config.defaults,
      mapPalette:
        config.defaults.mapPalette ?? themeToMapPalette(story.frontmatter.theme),
    },
  }

  const fontImportUrl = getFontImportUrl(story.frontmatter.theme.fonts)
  const logo = await themedLogoDataUrl(undefined, story.frontmatter.theme)

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
        <SlidesShell
          slug={slug}
          title={story.frontmatter.title}
          units={slideUnits}
          config={configWithDefaults}
          format={story.frontmatter.format ?? 'map'}
          aura={story.frontmatter.aura}
          accessToken={mapboxToken}
          logo={logo}
          print={print}
          embed={embed}
        />
      </VerticalLoader>
    </ThemeProvider>
  )
}
