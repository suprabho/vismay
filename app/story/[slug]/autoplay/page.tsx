// Was `revalidate = 60`. The admin check below reads cookies, which
// implicitly marks each request dynamic — the page no longer benefits
// from ISR caching. Set `force-dynamic` so that's explicit and there's
// no surprise when Next tries to (and can't) cache a per-cookie response.
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getStoryContent, getViewableStorySlugs } from '@/lib/content'
import { loadStoryConfig, hasStoryConfig } from '@/lib/storyConfig'
import { resolveUnits } from '@/lib/resolveUnits'
import { isAuthed } from '@/lib/adminAuth'
import { getContentSource } from '@/lib/contentSource'
import { buildMapTargets } from '@/lib/storyMapOverrides'
import ThemeProvider from '@/components/story/ThemeProvider'
import AutoplayShell from '@/components/autoplay/AutoplayShell'

interface RouteParams {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const slugs = await getViewableStorySlugs()
  const withConfig = await Promise.all(
    slugs.map(async (slug) => ((await hasStoryConfig(slug)) ? slug : null))
  )
  return withConfig.filter((s): s is string => s !== null).map((slug) => ({ slug }))
}

export default async function AutoplayPage({ params }: RouteParams) {
  const { slug } = await params

  let story
  let config
  try {
    story = await getStoryContent(slug)
    if (!(await hasStoryConfig(slug))) notFound()
    config = await loadStoryConfig(slug)
  } catch {
    notFound()
  }

  const { units, mobileUnits, desktopToMobile, hasMobileOverrides } = resolveUnits(
    slug,
    story.sections,
    config
  )

  // Admin viewers see the Map editor side panel. Public viewers never get
  // the toggle or the map state, so the page payload stays small for them.
  // The map_yaml override itself still applies to everyone in autoplay
  // mode — that's read by the inner story page via StoryMapShell.
  const admin = await isAuthed()
  let mapTargets: ReturnType<typeof buildMapTargets> = []
  let initialMapYaml: string | null = null
  if (admin) {
    mapTargets = buildMapTargets(config)
    initialMapYaml = await getContentSource().readMapYaml(slug)
  }

  return (
    <ThemeProvider theme={story.frontmatter.theme}>
      <AutoplayShell
        slug={slug}
        title={story.frontmatter.title}
        units={units}
        mobileUnits={hasMobileOverrides ? mobileUnits : undefined}
        desktopToMobile={desktopToMobile}
        accessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''}
        defaults={config.defaults}
        isAdmin={admin}
        mapTargets={mapTargets}
        mapStyle={config.defaults.mapStyle}
        initialMapYaml={initialMapYaml}
      />
    </ThemeProvider>
  )
}
