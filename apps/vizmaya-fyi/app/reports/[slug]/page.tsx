/**
 * Internal-tooling builder for the per-story report + slides exports.
 *
 * Loads the story, the regular `units`, the existing report.yaml (if any),
 * and the available chart ids — hands them to the client builder which
 * owns the format toggle, override controls, iframe preview, and download
 * triggers.
 *
 * Gated by the signed-URL middleware (`/reports/:slug` is in the matcher in
 * apps/vizmaya-fyi/middleware.ts). Admin opens this via
 * `signReportsBuilderUrl(slug)` — no cookie on vizmaya.fyi. See docs/auth.md.
 */

import { notFound } from 'next/navigation'
import { getContentSource } from '@vismay/content-source/contentSource'
import { getStoryContent } from '@vismay/content-source/content'
import { loadStoryConfig, hasStoryConfig } from '@vismay/content-source/storyConfig'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import { createServiceClient } from '@vismay/content-source/supabase'
import { type CachedPdf, getCachedPdf } from '@vismay/content-source/storyPdf'
import { signOutputUrl } from '@vismay/admin-core/signedUrl'
import ThemeProvider from '@/components/story/ThemeProvider'
import ReportsBuilder from '@/components/reports/ReportsBuilder'

interface RouteParams {
  params: Promise<{ slug: string }>
}

export const dynamic = 'force-dynamic'

export default async function ReportsBuilderPage({ params }: RouteParams) {
  const { slug } = await params
  // Auth handled by middleware (signed-URL gate); no cookie check here.

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
  // readReportYaml / listChartIds talk to Supabase in db mode. Don't crash
  // the page if they throw — fall back to no override + no chart ids so the
  // builder still renders. Saving and rendering will surface the real error.
  let reportYaml: string | null = null
  let chartIds: string[] = []
  try {
    ;[reportYaml, chartIds] = await Promise.all([
      source.readReportYaml(slug),
      source.listChartIds(slug),
    ])
  } catch (err) {
    console.error('[reports/[slug]] content-source read failed:', err)
  }

  // Surface the stable Supabase URL for any render that exists so the
  // builder can link to it even when the saved content has drifted past
  // the rendered hash. The storage path is `<slug>/<format>.pdf` and
  // uploads upsert, so the URL never changes — we just append a short
  // `?v=<hash>` cache-buster so a fresh render shows up immediately even
  // when Supabase's CDN still has the old bytes.
  //
  // Don't let a missing SUPABASE_SERVICE_ROLE_KEY (or any other Supabase
  // failure) crash the whole builder page — the cached-PDF link is a
  // convenience, not a hard requirement. Fall back to null and let the
  // builder's own download button surface the env error directly.
  let initialPdfs: { report: string | null; slides: string | null } = {
    report: null,
    slides: null,
  }
  try {
    const supabase = createServiceClient()
    const [reportRow, slidesRow] = await Promise.all([
      getCachedPdf(supabase, slug, 'report'),
      getCachedPdf(supabase, slug, 'slides'),
    ])
    initialPdfs = {
      report: cacheBustedUrl(reportRow),
      slides: cacheBustedUrl(slidesRow),
    }
  } catch (err) {
    console.error('[reports/[slug]] cached-pdf lookup failed:', err)
  }

  // The builder iframes /story/<slug>/report and /story/<slug>/slides — both
  // gated by the signed-URL middleware. Mint same-origin tokens with a 24h
  // TTL so the iframe loads cleanly across a typical editing session and
  // through Save reloads (which re-key the iframe but keep the same src).
  // Fall back to bare paths if signing fails: in dev without
  // ADMIN_SESSION_SECRET the middleware's passThroughWhenUnconfigured handles
  // it; in prod the iframe will 401 visibly and the page-level error surfaces
  // a configuration miss rather than crashing the whole builder.
  const previewSrcs: Record<'report' | 'slides', string> = {
    report: `/story/${slug}/report?embed=1`,
    slides: `/story/${slug}/slides?embed=1`,
  }
  try {
    const SIGN_TTL_SECONDS = 24 * 60 * 60
    for (const fmt of ['report', 'slides'] as const) {
      // Same-origin sign — baseUrl only seeds the URL parser; we hand the
      // resulting pathname+search back to the iframe.
      const signed = signOutputUrl({
        baseUrl: 'http://placeholder.local',
        path: `/story/${slug}/${fmt}`,
        ttlSeconds: SIGN_TTL_SECONDS,
        query: { embed: '1' },
      })
      const u = new URL(signed)
      previewSrcs[fmt] = `${u.pathname}${u.search}`
    }
  } catch (err) {
    console.error('[reports/[slug]] preview sign failed:', err)
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
    const subMap = u.parentConfig.subsections?.[u.subIndex]?.map
    const sourcePins = subMap?.pins ?? m?.pins ?? []
    const parentPins = sourcePins.map((p) => ({
      coordinates: p.coordinates as [number, number],
      label: p.label,
      labelAnchor: p.labelAnchor,
    }))
    return {
      parentIndex: u.parentIndex,
      subIndex: u.subIndex,
      heading: u.heading,
      subheading: u.subheading,
      paragraphs: u.paragraphs,
      eyebrow: u.parentConfig.eyebrow,
      chartId: u.parentConfig.chart,
      parentMap,
      parentPins,
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
        previewSrcs={previewSrcs}
      />
    </ThemeProvider>
  )
}

function cacheBustedUrl(row: CachedPdf | null): string | null {
  if (!row || !row.public_url) return null
  const sep = row.public_url.includes('?') ? '&' : '?'
  return `${row.public_url}${sep}v=${row.content_revision_hash.slice(0, 12)}`
}
