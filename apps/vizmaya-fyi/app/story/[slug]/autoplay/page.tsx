// Middleware gates this route via signed URL; anyone reaching the page
// is an admin viewer. Dynamic because the signed URL is per-request and
// the page reads override yaml unconditionally.
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getStoryContent, getViewableStorySlugs } from '@vismay/content-source/content'
import { loadStoryConfig, hasStoryConfig } from '@vismay/content-source/storyConfig'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { getContentSource } from '@vismay/content-source/contentSource'
import { buildMapTargets } from '@vismay/viz-engine'
import ThemeProvider from '@/components/story/ThemeProvider'
import AutoplayShell from '@/components/autoplay/AutoplayShell'

interface RouteParams {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ aspect?: string; start?: string }>
}

export async function generateStaticParams() {
  const slugs = await getViewableStorySlugs()
  const withConfig = await Promise.all(
    slugs.map(async (slug) => ((await hasStoryConfig(slug)) ? slug : null))
  )
  return withConfig.filter((s): s is string => s !== null).map((slug) => ({ slug }))
}

export default async function AutoplayPage({ params, searchParams }: RouteParams) {
  const { slug } = await params
  const sp = (await searchParams) ?? {}
  const initialRatio: '9:16' | '16:9' = sp.aspect === '16:9' ? '16:9' : '9:16'
  const initialSectionId = typeof sp.start === 'string' ? sp.start : null

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

  // The middleware gate guarantees anyone reaching this page is an admin
  // viewer (signed URL required). Always load the map editor side panel
  // payload — there's no public-viewer case anymore.
  const mapTargets = buildMapTargets(config)
  const initialMapYaml = await getContentSource().readMapYaml(slug)

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
        isAdmin={true}
        mapTargets={mapTargets}
        mapStyle={config.defaults.mapStyle}
        initialMapYaml={initialMapYaml}
        initialRatio={initialRatio}
        initialSectionId={initialSectionId}
      />
    </ThemeProvider>
  )
}
