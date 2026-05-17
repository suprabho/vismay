import { redirect, notFound } from 'next/navigation'
import { parse as parseYaml } from 'yaml'
import { isAuthed } from '@/lib/adminAuth'
import { getContentSource } from '@/lib/contentSource'
import EditorClient from '@/components/admin/EditorClient'
import { getStoryContent } from '@/lib/content'
import { loadStoryConfig, hasStoryConfig } from '@/lib/storyConfig'
import { resolveUnits } from '@/lib/resolveUnits'
import { defaultNarrationText } from '@/lib/storyTts'
import { getCachedVideo, type CachedVideo } from '@/lib/storyVideo'
import { createServiceClient } from '@/lib/supabase'
import { buildAssetRef, resolveAssetUrl } from '@/lib/assetUrl'
import type { NarrationUnit } from '@/components/admin/NarrationEditor'
import type { AssetListEntry } from '@/app/api/admin/stories/[slug]/assets/route'

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
  const videoCache = await loadVideoCache(slug)
  const [markdown, config_yaml, jsonChartIds, tts_yaml, assets] = await Promise.all([
    src.readMarkdown(slug),
    src.readConfigYaml(slug),
    src.listChartIds(slug),
    src.readTtsYaml(slug),
    loadAssets(slug),
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

  // Build narration units for the Narration tab. Stories without a config
  // (or with an invalid one) silently skip — the tab will render an empty
  // state rather than 500ing.
  let narrationUnits: NarrationUnit[] = []
  try {
    if (await hasStoryConfig(slug)) {
      const story = await getStoryContent(slug)
      const config = await loadStoryConfig(slug)
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
    }
  } catch {
    // Leave narrationUnits empty; the tab handles the empty state.
  }

  return (
    <EditorClient
      slug={slug}
      initial={{
        markdown,
        config_yaml: config_yaml ?? '',
        charts,
        assets,
        narrationUnits,
        tts_yaml: tts_yaml ?? null,
        videoCache,
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

// Same best-effort pattern as loadVideoCache — if the bucket / env / RLS
// isn't reachable, the Assets tab renders an empty grid rather than failing
// the whole admin page.
async function loadAssets(slug: string): Promise<AssetListEntry[]> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.storage.from('story-assets').list(slug, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error || !data) return []
    return data
      .filter((row) => row.name && row.name !== '.emptyFolderPlaceholder' && (row.metadata?.size ?? 0) > 0)
      .map((row) => {
        const ref = buildAssetRef(slug, row.name)
        return {
          key: `${slug}/${row.name}`,
          filename: row.name,
          assetRef: ref,
          url: resolveAssetUrl(ref),
          size: (row.metadata?.size as number | undefined) ?? null,
          contentType: (row.metadata?.mimetype as string | undefined) ?? null,
          updatedAt: row.updated_at ?? row.created_at ?? null,
        }
      })
  } catch {
    return []
  }
}
