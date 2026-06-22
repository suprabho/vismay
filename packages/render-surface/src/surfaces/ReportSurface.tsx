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
import ReportShell from '../pdf/ReportShell'

function filterBySection(units: ResolvedUnit[], sectionId: string): ResolvedUnit[] {
  return units.filter(
    (u) =>
      u.parentConfig.id === sectionId ||
      `section-${u.parentIndex}` === sectionId
  )
}

export interface ReportSurfaceProps {
  slug: string
  searchParams: { print?: string; embed?: string; section?: string }
  mapboxToken: string
}

export async function ReportSurface({
  slug,
  searchParams,
  mapboxToken,
}: ReportSurfaceProps) {
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

  const { units } = resolveUnits(slug, story.sections, config)
  const reportConfigRaw = await getContentSource().readReportYaml(slug)
  const reportConfig = parseReportConfig(reportConfigRaw, 'report')
  const allReportUnits = applyReportOverrides(units, reportConfig)
  // `?section=<id>` scopes the report to a single page — the canvas embeds
  // this route to preview a single section's page. Run AFTER overrides so
  // include:false units are correctly excluded first.
  const reportUnits = sectionFilter
    ? filterBySection(allReportUnits, sectionFilter)
    : allReportUnits

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
        <ReportShell
          slug={slug}
          title={story.frontmatter.title}
          units={reportUnits}
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
