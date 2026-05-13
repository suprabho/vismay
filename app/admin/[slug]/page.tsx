import { redirect, notFound } from 'next/navigation'
import { parse as parseYaml } from 'yaml'
import { isAuthed } from '@/lib/adminAuth'
import { getContentSource } from '@/lib/contentSource'
import EditorClient from '@/components/admin/EditorClient'
import { getStoryContent } from '@/lib/content'
import { loadStoryConfig, hasStoryConfig } from '@/lib/storyConfig'
import { buildMapTargets, type MapTarget } from '@/lib/storyMapOverrides'
import { resolveUnits } from '@/lib/resolveUnits'
import { defaultNarrationText } from '@/lib/storyTts'
import { getCachedVideo, type CachedVideo } from '@/lib/storyVideo'
import { getCanvaDesign, type CanvaDesignRow } from '@/lib/canva'
import { createServiceClient } from '@/lib/supabase'
import type { NarrationUnit } from '@/components/admin/NarrationEditor'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

// Walk a parsed YAML tree and collect every `chart:` string. A bare id
// (e.g. `stock-candlestick`) renders via a hardcoded React component;
// a `data:`-prefixed id (e.g. `data:foo`) is backed by an editable JSON file.
function extractChartRefs(configYaml: string | null): string[] {
  if (!configYaml) return []
  let cfg: unknown
  try {
    cfg = parseYaml(configYaml)
  } catch {
    return []
  }
  const refs = new Set<string>()
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const x of node) walk(x)
      return
    }
    const obj = node as Record<string, unknown>
    if (typeof obj.chart === 'string') refs.add(obj.chart)
    for (const v of Object.values(obj)) walk(v)
  }
  walk(cfg)
  return Array.from(refs)
}

export default async function EditStoryPage({ params }: Props) {
  const { slug } = await params
  if (!(await isAuthed())) redirect(`/admin/login?next=/admin/${slug}`)

  const src = getContentSource()
  const [videoCache, canvaCache] = await Promise.all([
    loadVideoCache(slug),
    loadCanvaCache(slug),
  ])
  const [markdown, config_yaml, share_yaml, jsonChartIds, tts_yaml, map_yaml] =
    await Promise.all([
      src.readMarkdown(slug),
      src.readConfigYaml(slug),
      src.readShareYaml(slug),
      src.listChartIds(slug),
      src.readTtsYaml(slug),
      src.readMapYaml(slug),
    ])
  if (markdown == null) notFound()

  // Merge editable JSON-backed charts with YAML chart refs so stories whose
  // charts are hardcoded React components (no JSON file) still surface here
  // instead of showing an empty list.
  const jsonSet = new Set(jsonChartIds)
  const charts = [
    ...jsonChartIds.map((id) => ({ id, editable: true as const })),
    ...extractChartRefs(config_yaml).flatMap((ref) => {
      const id = ref.startsWith('data:') ? ref.slice('data:'.length) : ref
      if (jsonSet.has(id)) return []
      return [{ id, editable: ref.startsWith('data:') }]
    }),
  ]

  // Build narration units for the Narration tab and map targets for the
  // Map tab. Both depend on a parsed StoryConfig — load it once. Stories
  // without a config (or with an invalid one) silently skip; both tabs
  // handle the empty state.
  let narrationUnits: NarrationUnit[] = []
  let mapTargets: MapTarget[] = []
  let mapStyle = 'mapbox://styles/mapbox/dark-v11'
  try {
    if (await hasStoryConfig(slug)) {
      const story = await getStoryContent(slug)
      // Map editor needs the BASE config (no overrides applied) so the
      // "currently overridden vs default" comparison in the editor is
      // meaningful — applyMapOverrides off keeps `section.map` as the
      // ground truth.
      const config = await loadStoryConfig(slug)
      mapStyle = config.defaults.mapStyle
      const { mobileUnits } = resolveUnits(slug, story.sections, config)
      narrationUnits = mobileUnits.map((u) => {
        const sliceIndex = u.sliceIndex ?? 0
        const kindLabel = u.parentConfig.kind ?? 'text'
        const headlineSnippet =
          u.heading || u.subheading || u.paragraphs[0]?.replace(/\*+/g, '') || '(no heading)'
        return {
          parentIndex: u.parentIndex,
          subIndex: u.subIndex,
          sliceIndex,
          sectionId: u.parentConfig.id,
          label: `${kindLabel} · ${headlineSnippet.slice(0, 80)}`,
          defaultScript: defaultNarrationText({
            heading: u.heading,
            paragraphs: u.paragraphs,
            parentConfig: { kind: u.parentConfig.kind },
            heroPart: u.heroPart,
          }),
          preview: [u.heading, u.paragraphs[0]?.replace(/\*+/g, '')].filter(Boolean).join(' — '),
        }
      })
      mapTargets = buildMapTargets(config)
    }
  } catch {
    // Leave both empty; the tabs handle the empty state.
  }

  return (
    <EditorClient
      slug={slug}
      initial={{
        markdown,
        config_yaml: config_yaml ?? '',
        share_yaml: share_yaml ?? '',
        charts,
        narrationUnits,
        tts_yaml: tts_yaml ?? null,
        map_yaml: map_yaml ?? null,
        mapTargets,
        mapStyle,
        videoCache,
        canvaCache,
      }}
    />
  )
}

export type VideoCache = {
  '9:16': CachedVideo | null
  '16:9': CachedVideo | null
}

// Best-effort cache lookup. If Supabase isn't reachable (fs-only dev, env
// missing) we just return nulls so the panel renders an "idle" state
// instead of failing the whole admin page.
async function loadVideoCache(slug: string): Promise<VideoCache> {
  try {
    const supabase = createServiceClient()
    const [vert, horiz] = await Promise.all([
      getCachedVideo(supabase, slug, '9:16', false),
      getCachedVideo(supabase, slug, '16:9', false),
    ])
    return { '9:16': vert, '16:9': horiz }
  } catch {
    return { '9:16': null, '16:9': null }
  }
}

export type CanvaCache = {
  '9:16': CanvaDesignRow | null
  '16:9': CanvaDesignRow | null
}

async function loadCanvaCache(slug: string): Promise<CanvaCache> {
  try {
    const supabase = createServiceClient()
    const [vert, horiz] = await Promise.all([
      getCanvaDesign(supabase, slug, '9:16'),
      getCanvaDesign(supabase, slug, '16:9'),
    ])
    return { '9:16': vert, '16:9': horiz }
  } catch {
    return { '9:16': null, '16:9': null }
  }
}
