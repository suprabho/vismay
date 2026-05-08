/**
 * Internal-tooling builder for the per-story report + slides exports.
 *
 * Loads the story, the regular `units`, the existing report.yaml (if any),
 * and the available chart ids — hands them to the client builder which
 * owns the format toggle, override controls, iframe preview, and download
 * triggers.
 *
 * Gated by the same admin password as /admin (lib/adminAuth.ts cookie).
 */

import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { getContentSource } from '@/lib/contentSource'
import { getStoryContent } from '@/lib/content'
import { loadStoryConfig, hasStoryConfig } from '@/lib/storyConfig'
import { resolveUnits } from '@/lib/resolveUnits'
import { getFontImportUrl } from '@/lib/getFontImports'
import ThemeProvider from '@/components/story/ThemeProvider'
import ReportsBuilder from '@/components/reports/ReportsBuilder'

interface RouteParams {
  params: Promise<{ slug: string }>
}

export const dynamic = 'force-dynamic'

export default async function ReportsBuilderPage({ params }: RouteParams) {
  const { slug } = await params
  if (!(await isAuthed()))
    redirect(`/admin/login?next=${encodeURIComponent(`/reports/${slug}`)}`)

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
  const source = getContentSource()
  const [reportYaml, chartIds] = await Promise.all([
    source.readReportYaml(slug),
    source.listChartIds(slug),
  ])

  const fontImportUrl = getFontImportUrl(story.frontmatter.theme.fonts)

  // Each unit gets a stable index = (parentIndex, subIndex). The builder
  // serializes from this, so even if markdown changes order later the
  // overrides stay attached to the correct unit identity.
  const builderUnits = units.map((u) => ({
    parentIndex: u.parentIndex,
    subIndex: u.subIndex,
    heading: u.heading,
    subheading: u.subheading,
    paragraphs: u.paragraphs,
    eyebrow: u.parentConfig.eyebrow,
    chartId: u.parentConfig.chart,
  }))

  return (
    <ThemeProvider theme={story.frontmatter.theme}>
      {fontImportUrl && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link href={fontImportUrl} rel="stylesheet" />
        </>
      )}
      <ReportsBuilder
        slug={slug}
        title={story.frontmatter.title}
        units={builderUnits}
        chartIds={chartIds}
        initialYaml={reportYaml}
      />
    </ThemeProvider>
  )
}
