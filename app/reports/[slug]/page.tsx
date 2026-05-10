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
import { createServiceClient } from '@/lib/supabase'
import { type CachedPdf, getCachedPdf } from '@/lib/storyPdf'
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

  // Surface the stable Supabase URL for any render that exists so the
  // builder can link to it even when the saved content has drifted past
  // the rendered hash. The storage path is `<slug>/<format>.pdf` and
  // uploads upsert, so the URL never changes — we just append a short
  // `?v=<hash>` cache-buster so a fresh render shows up immediately even
  // when Supabase's CDN still has the old bytes.
  const supabase = createServiceClient()
  const [reportRow, slidesRow] = await Promise.all([
    getCachedPdf(supabase, slug, 'report'),
    getCachedPdf(supabase, slug, 'slides'),
  ])
  const initialPdfs = {
    report: cacheBustedUrl(reportRow),
    slides: cacheBustedUrl(slidesRow),
  }

  const fontImportUrl = getFontImportUrl(story.frontmatter.theme.fonts)

  // Each unit gets a stable index = (parentIndex, subIndex). The builder
  // serializes from this, so even if markdown changes order later the
  // overrides stay attached to the correct unit identity.
  const builderUnits = units.map((u) => {
    const m = u.parentConfig.map
    const parentMap =
      m && m.center && typeof m.zoom === 'number'
        ? {
            center: m.center as [number, number],
            zoom: m.zoom,
            pitch: m.pitch ?? 0,
            bearing: m.bearing ?? 0,
          }
        : null
    return {
      parentIndex: u.parentIndex,
      subIndex: u.subIndex,
      heading: u.heading,
      subheading: u.subheading,
      paragraphs: u.paragraphs,
      eyebrow: u.parentConfig.eyebrow,
      chartId: u.parentConfig.chart,
      parentMap,
    }
  })

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
        initialPdfs={initialPdfs}
      />
    </ThemeProvider>
  )
}

function cacheBustedUrl(row: CachedPdf | null): string | null {
  if (!row || !row.public_url) return null
  const sep = row.public_url.includes('?') ? '&' : '?'
  return `${row.public_url}${sep}v=${row.content_revision_hash.slice(0, 12)}`
}
