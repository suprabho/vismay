import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getStoryContent } from '@vismay/content-source/content'
import { hasStoryConfig, loadStoryConfig } from '@vismay/content-source/storyConfig'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import { StoryShell, ThemeProvider } from '@vismay/story-reader'

import { hydrateTravelConfig } from '@vismay/content-source/travelScrapbook'

import VerticalLoader from '@/components/VerticalLoader'
import { requireTripAuth } from '@/lib/gate'
import { getCuratedDayMedia } from '@/lib/scrapbookMedia'
import { readTrip } from '@/lib/trips'

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

  // Resolve the owning trip BEFORE the gate: a trip can carry one scrapbook
  // story per day (story slug ≠ trip slug, `trip:` frontmatter), and the
  // password gate, itinerary, and curated media are all keyed on the trip.
  // Falling back to the URL slug keeps the gate's redirect-to-login posture
  // for unknown slugs (no story ⇒ gate on the slug itself).
  let story: Awaited<ReturnType<typeof getStoryContent>> | null = null
  try {
    // Trip stories stay `status: draft` / `listed: false` forever — the
    // password gate below is the real access boundary, so the reader must
    // opt in to drafts.
    story = await getStoryContent(slug, { allowDraft: true })
  } catch {
    story = null
  }
  const tripSlug = story?.frontmatter.trip ?? slug
  const day = story?.frontmatter.day ?? 3

  await requireTripAuth(tripSlug)
  if (!story) notFound()

  let config
  try {
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

  // Scrapbook injection: curated photos become foreground layers on sections
  // carrying a `scrapbook:` block. The shared module (also behind the admin
  // canvas frames) gets this app's fallback-aware loads: the fs `.trip.yaml`
  // shipped with the build (DB-mirrored itinerary as fallback inside
  // hydrate) and DB-first-manifest-fallback curated media.
  config = await hydrateTravelConfig(slug, config, story.frontmatter, {
    trip: readTrip(tripSlug),
    mediaByStop: await getCuratedDayMedia(tripSlug, day),
  })

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
      {/* Paper grain between the map (z-0) and the foreground (z-10).
          data-scrapbook scopes the story-only root font-size in globals.css. */}
      <div aria-hidden data-scrapbook className="paper-grain" />
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
