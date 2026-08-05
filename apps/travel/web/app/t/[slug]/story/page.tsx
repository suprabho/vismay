import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getStoryContent } from '@vismay/content-source/content'
import { hasStoryConfig, loadStoryConfig } from '@vismay/content-source/storyConfig'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import { StoryShell, ThemeProvider } from '@vismay/story-reader'

import VerticalLoader from '@/components/VerticalLoader'
import { requireTripAuth } from '@/lib/gate'

// Password-gated: render per request (the gate reads the visitor's cookie),
// and keep every trip page out of search indexes.
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params
  try {
    const { frontmatter } = await getStoryContent(slug, { allowDraft: true })
    return {
      title: `${frontmatter.title} — the story`,
      robots: { index: false, follow: false, nocache: true },
    }
  } catch {
    return { robots: { index: false, follow: false } }
  }
}

export default async function TripStoryPage({ params }: RouteParams) {
  const { slug } = await params
  await requireTripAuth(slug)

  let story
  let config
  try {
    // Trip stories stay `status: draft` / `listed: false` forever — the
    // password gate above is the real access boundary, so the reader must
    // opt in to drafts.
    story = await getStoryContent(slug, { allowDraft: true })
    if (!(await hasStoryConfig(slug))) notFound()
    config = await loadStoryConfig(slug)
  } catch {
    notFound()
  }

  if (story.frontmatter.vertical !== 'travel') {
    // Only travel stories render in this host — cross-vertical stories live
    // in their own apps and their modules aren't registered here.
    notFound()
  }

  const { units, mobileUnits, hasMobileOverrides } = resolveUnits(
    slug,
    story.sections,
    config
  )

  const fontImportUrl = getFontImportUrl(story.frontmatter.theme.fonts)

  let assetOrigin: string | null = null
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (supabaseUrl) assetOrigin = new URL(supabaseUrl).origin
  } catch {
    assetOrigin = null
  }

  return (
    <ThemeProvider theme={story.frontmatter.theme}>
      {fontImportUrl && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link href={fontImportUrl} rel="stylesheet" />
        </>
      )}
      {assetOrigin && <link rel="preconnect" href={assetOrigin} crossOrigin="" />}
      <VerticalLoader vertical={story.frontmatter.vertical}>
        <StoryShell
          units={units}
          mobileUnits={hasMobileOverrides ? mobileUnits : undefined}
          accessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''}
          defaults={config.defaults}
          slug={slug}
          format={story.frontmatter.format ?? 'map'}
        />
      </VerticalLoader>
    </ThemeProvider>
  )
}
