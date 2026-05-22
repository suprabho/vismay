import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { getStoryContent } from '@vismay/content-source/content'
import {
  loadStoryConfig,
  hasStoryConfig,
} from '@vismay/content-source/storyConfig'
import { getContentSource } from '@vismay/content-source/contentSource'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { parseMapOverrides } from '@vismay/viz-engine'
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

  return (
    <CanvasClient
      slug={slug}
      units={units}
      defaults={config.defaults}
      mapOverrides={mapOverrides}
      accessToken={accessToken}
    />
  )
}
