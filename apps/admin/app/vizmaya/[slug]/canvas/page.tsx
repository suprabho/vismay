import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { signOutputUrl } from '@vismay/admin-core/signedUrl'
import { getStoryContent } from '@vismay/content-source/content'
import {
  loadStoryConfig,
  hasStoryConfig,
} from '@vismay/content-source/storyConfig'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { getContentSource } from '@vismay/content-source/contentSource'
import CanvasClient from '@/components/vizmaya/canvas/CanvasClient'
import {
  canvasFrameId,
  outputSpecsForUnit,
} from '@/components/vizmaya/canvas/canvasOutputs'
import type { CanvasSources } from '@/components/vizmaya/canvas/canvasInputs'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function CanvasPage({ params }: Props) {
  const { slug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/vizmaya/${slug}/canvas`)
  if (!(await hasStoryConfig(slug))) notFound()

  const [story, config] = await Promise.all([
    getStoryContent(slug),
    loadStoryConfig(slug),
  ])

  const { units } = resolveUnits(slug, story.sections, config)

  // Per-frame override sources + the primary config/markdown. Loaded once
  // on the server so the client can slice + edit without round-tripping the
  // file system. Failures shouldn't break the canvas — fall through to
  // `null` and the input node for that source renders its "no override"
  // placeholder. configYaml / markdown are the canonical files behind the
  // frame-level inputs; they have to round-trip the same edit path.
  const cs = getContentSource()
  const [shareYaml, reportYaml, mapYaml, ttsYaml, configYaml, markdown] = await Promise.all([
    cs.readShareYaml(slug).catch(() => null),
    cs.readReportYaml(slug).catch(() => null),
    cs.readMapYaml(slug).catch(() => null),
    cs.readTtsYaml(slug).catch(() => null),
    cs.readConfigYaml(slug).catch(() => null),
    cs.readMarkdown(slug).catch(() => null),
  ])

  const sources: CanvasSources = {
    shareYaml,
    reportYaml,
    mapYaml,
    ttsYaml,
    configYaml,
    markdown,
  }

  // The canvas iframes vizmaya-fyi's single-section render route. URL
  // comes from env so dev (localhost:3000) and prod (subdomain) both
  // work without code changes; default keeps the dev loop unblocked.
  const publicSiteUrl =
    process.env.NEXT_PUBLIC_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  // Pre-sign every iframe URL the canvas can mount. 24h TTL — well past
  // any plausible single editing session, refreshed on every page reload.
  // The HMAC secret stays server-side; only the resulting URLs cross to
  // the client.
  const sectionUnits = units.filter((u) => u.subIndex === 0)
  const SIGN_TTL_SECONDS = 24 * 60 * 60
  const signedSrcById: Record<string, string> = {}
  for (const u of sectionUnits) {
    const sectionId = u.parentConfig.id ?? `section-${u.parentIndex}`
    signedSrcById[canvasFrameId(sectionId)] = signOutputUrl({
      baseUrl: publicSiteUrl,
      path: `/story/${encodeURIComponent(slug)}/canvas-frame/${encodeURIComponent(sectionId)}`,
      ttlSeconds: SIGN_TTL_SECONDS,
    })
    for (const spec of outputSpecsForUnit(u, slug)) {
      signedSrcById[spec.id] = signOutputUrl({
        baseUrl: publicSiteUrl,
        path: spec.path,
        ttlSeconds: SIGN_TTL_SECONDS,
        query: spec.query,
      })
    }
  }

  return (
    <CanvasClient
      slug={slug}
      units={units}
      sources={sources}
      signedSrcById={signedSrcById}
    />
  )
}
