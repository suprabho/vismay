/**
 * Bespoke 16:9 slide-deck layout for headless PDF capture.
 *
 * One unit per slide at 1920×1080. When the story has share-mode overrides
 * we lean on `shareUnits` (their slicing tends to be tighter and more
 * presentation-shaped); otherwise the regular `units`. Playwright hits this
 * route with `?print=1`, waits for `window.__pdfReady__` (Phase 2), and
 * calls `page.pdf({ landscape: true, width: 1920px, height: 1080px })`.
 */

import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { getContentSource } from '@vismay/content-source/contentSource'
import { getStoryContent } from '@vismay/content-source/content'
import { loadStoryConfig, hasStoryConfig } from '@vismay/content-source/storyConfig'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { themeToMapPalette } from '@/lib/themeToMapPalette'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import { themedLogoDataUrl } from '@/lib/themeLogo'
import type { ResolvedUnit } from '@vismay/viz-engine'
import {
  applyReportOverrides,
  parseReportConfig,
} from '@/lib/storyReportConfig'
import ThemeProvider from '@/components/story/ThemeProvider'
import SlidesShell from '@/components/pdf/SlidesShell'

interface RouteParams {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ print?: string; embed?: string; section?: string }>
}

function filterBySection(units: ResolvedUnit[], sectionId: string): ResolvedUnit[] {
  return units.filter(
    (u) =>
      u.parentConfig.id === sectionId ||
      `section-${u.parentIndex}` === sectionId
  )
}

export const dynamic = 'force-dynamic'

export default async function StorySlidesPage({ params, searchParams }: RouteParams) {
  const { slug } = await params
  const sp = (await searchParams) ?? {}
  const print = sp.print === '1'
  const embed = sp.embed === '1'
  const sectionFilter = typeof sp.section === 'string' ? sp.section : null

  if (!(await isAuthed()))
    redirect(`/admin/login?next=${encodeURIComponent(`/story/${slug}/slides${print ? '?print=1' : ''}`)}`)

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
      <SlidesShell
        slug={slug}
        title={story.frontmatter.title}
        units={slideUnits}
        config={configWithDefaults}
        accessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''}
        logo={logo}
        print={print}
        embed={embed}
      />
    </ThemeProvider>
  )
}
