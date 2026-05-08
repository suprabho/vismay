/**
 * Bespoke portrait report layout for headless PDF capture.
 *
 * Letter-sized booklet, one parent section per "spread" with `break-before:
 * page`. Playwright hits this route with `?print=1`, waits for
 * `window.__pdfReady__` (added in Phase 2), and calls `page.pdf()`. In a
 * normal browser the route is also navigable for dev preview; the `print=1`
 * flag hides any non-print chrome the shell layers on top.
 */

import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { getContentSource } from '@/lib/contentSource'
import { getStoryContent } from '@/lib/content'
import { loadStoryConfig, hasStoryConfig } from '@/lib/storyConfig'
import { resolveUnits } from '@/lib/resolveUnits'
import { themeToMapPalette } from '@/lib/themeToMapPalette'
import { getFontImportUrl } from '@/lib/getFontImports'
import { themedLogoDataUrl } from '@/lib/themeLogo'
import {
  applyReportOverrides,
  parseReportConfig,
} from '@/lib/storyReportConfig'
import ThemeProvider from '@/components/story/ThemeProvider'
import ReportShell from '@/components/pdf/ReportShell'

interface RouteParams {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ print?: string }>
}

export const dynamic = 'force-dynamic'

export default async function StoryReportPage({ params, searchParams }: RouteParams) {
  const { slug } = await params
  const sp = (await searchParams) ?? {}
  const print = sp.print === '1'

  if (!(await isAuthed()))
    redirect(`/admin/login?next=${encodeURIComponent(`/story/${slug}/report${print ? '?print=1' : ''}`)}`)

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
  const reportConfig = parseReportConfig(reportConfigRaw)
  const reportUnits = applyReportOverrides(units, reportConfig)

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
      <ReportShell
        slug={slug}
        title={story.frontmatter.title}
        units={reportUnits}
        config={configWithDefaults}
        accessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''}
        logo={logo}
        print={print}
      />
    </ThemeProvider>
  )
}
