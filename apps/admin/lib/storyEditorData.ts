import { parse as parseYaml } from 'yaml'
import { getContentSource } from '@vismay/content-source/contentSource'
import { getStoryContent } from '@vismay/content-source/content'
import { loadStoryConfig, hasStoryConfig } from '@vismay/content-source/storyConfig'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { defaultNarrationText } from '@vismay/content-source/storyTts'
import { getFullVideo, type CachedVideo } from '@vismay/content-source/storyVideo'
import { readComposeState, type ComposeState } from '@vismay/content-source/composeState'
import { listStorySources, type StorySource } from '@vismay/content-source/storySources'
import { createServiceClient } from '@vismay/content-source/supabase'
import { buildAssetRef, resolveAssetUrl } from '@vismay/viz-engine'
import type { NarrationUnit } from '@/components/vizmaya/NarrationEditor'
import type { AssetListEntry } from '@/app/api/stories/[slug]/assets/route'

export type VideoCache = {
  '9:16': CachedVideo | null
  '16:9': CachedVideo | null
}

export interface StoryEditorData {
  markdown: string
  config_yaml: string
  charts: { id: string; editable: boolean }[]
  assets: AssetListEntry[]
  narrationUnits: NarrationUnit[]
  tts_yaml: string | null
  videoCache: VideoCache
  appSlug: string | null
  /** Compose scaffold for the "Research & outline" tab (null if not composing). */
  composeState: ComposeState | null
  composeSources: StorySource[]
}

// Best-effort compose scaffold load — DB-only, like the video/asset lookups. In
// fs-only dev (no Supabase) both calls throw and we fall back to null/[] so the
// editor still renders; the tab then offers to start a fresh compose.
async function loadCompose(
  slug: string,
): Promise<{ state: ComposeState | null; sources: StorySource[] }> {
  const [state, sources] = await Promise.all([
    readComposeState(slug).catch(() => null),
    listStorySources(slug).catch(() => []),
  ])
  return { state, sources }
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

// Best-effort cache lookup. If Supabase isn't reachable (fs-only dev, env
// missing) we just return nulls so the panel renders an "idle" state
// instead of failing the whole admin page.
async function loadVideoCache(slug: string): Promise<VideoCache> {
  try {
    const supabase = createServiceClient()
    const [vert, horiz] = await Promise.all([
      getFullVideo(supabase, slug, '9:16'),
      getFullVideo(supabase, slug, '16:9'),
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

// Returns null when the markdown source is missing (the page should 404).
export async function loadStoryEditorData(slug: string): Promise<StoryEditorData | null> {
  const src = getContentSource()
  const [videoCache, compose] = await Promise.all([loadVideoCache(slug), loadCompose(slug)])
  const [markdown, config_yaml, jsonChartIds, tts_yaml, assets, metas] = await Promise.all([
    src.readMarkdown(slug),
    src.readConfigYaml(slug),
    src.listChartIds(slug),
    src.readTtsYaml(slug),
    loadAssets(slug),
    src.listStories(),
  ])
  if (markdown == null) return null
  const appSlug = metas.find((m) => m.slug === slug)?.appSlug ?? null

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

  return {
    markdown,
    config_yaml: config_yaml ?? '',
    charts,
    assets,
    narrationUnits,
    tts_yaml: tts_yaml ?? null,
    videoCache,
    appSlug,
    composeState: compose.state,
    composeSources: compose.sources,
  }
}
