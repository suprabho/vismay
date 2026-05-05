import { redirect, notFound } from 'next/navigation'
import { parse as parseYaml } from 'yaml'
import { isAuthed } from '@/lib/adminAuth'
import { getContentSource } from '@/lib/contentSource'
import EditorClient from '@/components/admin/EditorClient'

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
  const [markdown, config_yaml, share_yaml, jsonChartIds] = await Promise.all([
    src.readMarkdown(slug),
    src.readConfigYaml(slug),
    src.readShareYaml(slug),
    src.listChartIds(slug),
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

  return (
    <EditorClient
      slug={slug}
      initial={{
        markdown,
        config_yaml: config_yaml ?? '',
        share_yaml: share_yaml ?? '',
        charts,
      }}
    />
  )
}
