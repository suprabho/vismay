/**
 * Rete.js parallel of the custom canvas at /vizmaya/[slug]/canvas. Same
 * data inputs, same iframe-per-section idea — but the pan/zoom area,
 * node placements and connection wires are driven by Rete v2 instead of
 * our hand-rolled CanvasClient.
 *
 * Lives at a separate URL so we can A/B between implementations without
 * touching production routes. The data layer (canvasInputs/canvasOutputs)
 * stays shared.
 */
import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { getStoryContent } from '@vismay/content-source/content'
import {
  loadStoryConfig,
  hasStoryConfig,
} from '@vismay/content-source/storyConfig'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { getContentSource } from '@vismay/content-source/contentSource'
import CanvasReteClient from '@/components/vizmaya/canvas-rete/CanvasReteClient'
import type { CanvasSources } from '@/components/vizmaya/canvas/canvasInputs'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function CanvasRetePage({ params }: Props) {
  const { slug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/vizmaya/${slug}/canvas-rete`)
  if (!(await hasStoryConfig(slug))) notFound()

  const [story, config] = await Promise.all([
    getStoryContent(slug),
    loadStoryConfig(slug),
  ])

  const { units } = resolveUnits(slug, story.sections, config)

  const cs = getContentSource()
  const chartIds = Array.from(
    new Set(
      units
        .map((u) => u.parentConfig.chart)
        .filter((id): id is string => typeof id === 'string')
    )
  )
  const [shareYaml, reportYaml, mapYaml, ttsYaml, chartEntries] = await Promise.all([
    cs.readShareYaml(slug).catch(() => null),
    cs.readReportYaml(slug).catch(() => null),
    cs.readMapYaml(slug).catch(() => null),
    cs.readTtsYaml(slug).catch(() => null),
    Promise.all(
      chartIds.map(
        async (id) => [id, await cs.readChart(slug, id).catch(() => null)] as const
      )
    ),
  ])

  const sources: CanvasSources = {
    chartsById: Object.fromEntries(chartEntries.filter(([, v]) => v != null)),
    shareYaml,
    reportYaml,
    mapYaml,
    ttsYaml,
  }

  const publicSiteUrl =
    process.env.NEXT_PUBLIC_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  return (
    <CanvasReteClient
      slug={slug}
      units={units}
      sources={sources}
      publicSiteUrl={publicSiteUrl}
    />
  )
}
