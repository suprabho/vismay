/**
 * Internal-tooling builder for the per-story HTML newsletter export.
 *
 * Loads the story, the regular `units`, the existing newsletter.yaml (if
 * any), and the default visual availability per unit — hands them to the
 * client builder which owns section selection, issue framing (subject /
 * intro / outro / CTA), render triggers, the email preview, and the
 * copy-for-Substack action.
 *
 * Gated by the signed-URL middleware (`/newsletters/:slug` is in the matcher
 * in apps/vizmaya-fyi/middleware.ts) — same policy as /reports/:slug.
 */

import { notFound } from 'next/navigation'
import { getContentSource } from '@vismay/content-source/contentSource'
import { getStoryContent } from '@vismay/content-source/content'
import { loadStoryConfig, hasStoryConfig } from '@vismay/content-source/storyConfig'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import { createServiceClient } from '@vismay/content-source/supabase'
import {
  type CachedNewsletter,
  getCachedNewsletter,
} from '@vismay/content-source/storyNewsletter'
import { resolveNewsletterBlocks } from '@vismay/content-source/storyNewsletterConfig'
import ThemeProvider from '@/components/story/ThemeProvider'
import NewsletterBuilder from '@/components/newsletters/NewsletterBuilder'

interface RouteParams {
  params: Promise<{ slug: string }>
}

export const dynamic = 'force-dynamic'

export default async function NewsletterBuilderPage({ params }: RouteParams) {
  const { slug } = await params
  // Auth handled by middleware (signed-URL gate); no cookie check here.

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
  const format = story.frontmatter.format ?? 'map'

  const source = getContentSource()
  let newsletterYaml: string | null = null
  try {
    newsletterYaml = await source.readNewsletterYaml(slug)
  } catch (err) {
    console.error('[newsletters/[slug]] content-source read failed:', err)
  }

  // Default visual availability per unit (no overrides applied) so the
  // builder can show which units carry a map / chart / panel capture.
  const defaultBlocks = resolveNewsletterBlocks(units, { sections: [] }, format)
  const visualsByUnit = new Map<string, { map: boolean; viz: boolean; panel: boolean }>()
  for (const b of defaultBlocks) {
    visualsByUnit.set(`${b.parentIndex}.${b.subIndex}`, {
      map: b.visuals.some((v) => v.kind === 'map'),
      viz: b.visuals.some((v) => v.kind === 'viz'),
      panel: b.visuals.some((v) => v.kind === 'panel'),
    })
  }

  // Surface the stable bucket URLs for any existing render (cache-busted per
  // content hash — uploads upsert so the path never changes).
  let initialUrls: { email: string | null; substack: string | null } = {
    email: null,
    substack: null,
  }
  try {
    const supabase = createServiceClient()
    const row = await getCachedNewsletter(supabase, slug)
    initialUrls = {
      email: cacheBustedUrl(row, row?.public_url ?? null),
      substack: cacheBustedUrl(row, row?.substack_url ?? null),
    }
  } catch (err) {
    console.error('[newsletters/[slug]] cached-newsletter lookup failed:', err)
  }

  const fontImportUrl = getFontImportUrl(story.frontmatter.theme.fonts)

  const builderUnits = units.map((u) => {
    const visuals = visualsByUnit.get(`${u.parentIndex}.${u.subIndex}`) ?? {
      map: false,
      viz: false,
      panel: false,
    }
    return {
      parentIndex: u.parentIndex,
      subIndex: u.subIndex,
      kind: u.parentConfig.kind ?? 'text',
      heading: u.heading,
      subheading: u.subheading,
      paragraphs: u.paragraphs,
      hasMap: visuals.map,
      hasViz: visuals.viz,
      hasPanel: visuals.panel,
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
      <NewsletterBuilder
        slug={slug}
        title={story.frontmatter.title}
        units={builderUnits}
        initialYaml={newsletterYaml}
        initialUrls={initialUrls}
      />
    </ThemeProvider>
  )
}

function cacheBustedUrl(row: CachedNewsletter | null, url: string | null): string | null {
  if (!row || !url) return null
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}v=${row.content_revision_hash.slice(0, 12)}`
}
