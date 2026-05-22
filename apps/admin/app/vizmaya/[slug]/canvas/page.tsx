import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { getStoryContent } from '@vismay/content-source/content'
import {
  loadStoryConfig,
  hasStoryConfig,
} from '@vismay/content-source/storyConfig'
import { getContentSource } from '@vismay/content-source/contentSource'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import { parseMapOverrides } from '@vismay/viz-engine'
import { themeToMapPalette } from '@/lib/themeToMapPalette'
import CanvasClient from '@/components/vizmaya/canvas/CanvasClient'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function CanvasPage({ params }: Props) {
  const { slug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/vizmaya/${slug}/canvas`)
  if (!(await hasStoryConfig(slug))) notFound()

  const [story, config, mapYaml] = await Promise.all([
    getStoryContent(slug),
    loadStoryConfig(slug),
    getContentSource().readMapYaml(slug),
  ])

  const { units } = resolveUnits(slug, story.sections, config)
  const mapOverrides = parseMapOverrides(mapYaml)
  const accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

  // Mirror the public story page's defaults wiring — yaml-set mapPalette wins,
  // otherwise fall back to the theme-derived palette. Without this maps render
  // against vizmaya-fyi's stock palette instead of the story's theme.
  const defaults = {
    ...config.defaults,
    mapPalette:
      config.defaults.mapPalette ?? themeToMapPalette(story.frontmatter.theme),
  }

  const fontImportUrl = getFontImportUrl(story.frontmatter.theme.fonts)

  return (
    <CanvasClient
      slug={slug}
      units={units}
      defaults={defaults}
      mapOverrides={mapOverrides}
      accessToken={accessToken}
      theme={story.frontmatter.theme}
      vertical={story.frontmatter.vertical}
      fontImportUrl={fontImportUrl}
    />
  )
}
