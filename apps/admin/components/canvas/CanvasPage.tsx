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
import { readComposeState } from '@vismay/content-source/composeState'
import { listStorySources } from '@vismay/content-source/storySources'
import { renderSurfaceUrl } from '@/lib/publicSite'
import CanvasClient from '@/components/canvas/CanvasClient'
import {
  canvasFrameId,
  outputSpecsForUnit,
} from '@/components/canvas/canvasOutputs'
import type { CanvasSources } from '@/components/canvas/canvasInputs'
import { getModuleTypesForVertical } from '@/lib/vizmayaModuleTypes'

interface CanvasPageProps {
  slug: string
  /**
   * The canvas's own URL, used as the post-login `next` target. Differs per
   * mount point: `/vizmaya/<slug>/canvas` for the vizmaya tree,
   * `/<appSlug>/<slug>/canvas` for every other vertical.
   */
  canvasPath: string
}

/**
 * Shared canvas renderer, mounted from both the vizmaya story tree
 * (`app/vizmaya/[slug]/canvas`) and the generic app tree
 * (`app/[appSlug]/[slug]/canvas`). The canvas itself is vertical-agnostic: it
 * loads a story by slug, signs iframe URLs against the shared vizmaya-fyi
 * render surface (which renders every vertical's story headlessly), and
 * resolves the module-type picker from the story's own `vertical` frontmatter.
 * The only per-route difference is the post-login redirect target.
 */
export default async function CanvasPage({ slug, canvasPath }: CanvasPageProps) {
  if (!(await isAuthed())) redirect(`/login?next=${encodeURIComponent(canvasPath)}`)
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

  // Pre-sign every iframe URL the canvas can mount. 24h TTL — well past
  // any plausible single editing session, refreshed on every page reload.
  // The HMAC secret stays server-side; only the resulting URLs cross to
  // the client.
  //
  // Every vertical's story renders through a headless render surface, resolved
  // PER SURFACE (`renderSurfaceUrl`, lib/publicSite). Today every surface
  // resolves to vizmaya-fyi (the one surface footshorts/vizf1 iframe into); the
  // render-engine extraction flips them to the neutral apps/render service one
  // surface at a time via RENDER_SURFACE_URL_<SURFACE>. The canvas-frame id and
  // each output spec sign against their own surface, so a flip moves exactly
  // that surface and the others keep their live vizmaya.fyi fallback.
  const vertical =
    typeof story.frontmatter.vertical === 'string'
      ? story.frontmatter.vertical
      : undefined
  const sectionUnits = units.filter((u) => u.subIndex === 0)
  const SIGN_TTL_SECONDS = 24 * 60 * 60
  const signedSrcById: Record<string, string> = {}
  for (const u of sectionUnits) {
    const sectionId = u.parentConfig.id ?? `section-${u.parentIndex}`
    signedSrcById[canvasFrameId(sectionId)] = signOutputUrl({
      baseUrl: renderSurfaceUrl('canvasFrame', vertical),
      path: `/story/${encodeURIComponent(slug)}/canvas-frame/${encodeURIComponent(sectionId)}`,
      ttlSeconds: SIGN_TTL_SECONDS,
    })
    for (const spec of outputSpecsForUnit(u, slug)) {
      signedSrcById[spec.id] = signOutputUrl({
        baseUrl: renderSurfaceUrl(spec.group, vertical),
        path: spec.path,
        ttlSeconds: SIGN_TTL_SECONDS,
        query: spec.query,
      })
    }
  }

  // Module-type lists for the "+ add layer" picker. Resolved server-side
  // so the vertical's modules can be loaded via dynamic import without
  // bloating the client bundle; the canvas only receives the resulting
  // string arrays. Failures fall back to core types.
  const moduleTypes = await getModuleTypesForVertical(vertical)

  // Compose scaffold (migration 056) — present only while a draft is being
  // composed. Best-effort: a missing column / fs-only dev just yields null and
  // the overlay doesn't render, leaving normal canvas editing untouched. The
  // panel lives here (the shared canvas page) so compose works on every
  // vertical's canvas route, not just the vizmaya one.
  const [composeState, composeSources] = await Promise.all([
    readComposeState(slug).catch(() => null),
    listStorySources(slug).catch(() => []),
  ])

  return (
    <CanvasClient
      slug={slug}
      units={units}
      sources={sources}
      theme={story.frontmatter.theme ?? null}
      signedSrcById={signedSrcById}
      moduleTypes={moduleTypes}
      format={story.frontmatter.format === 'deck' ? 'deck' : 'map'}
      composeState={composeState}
      composeSources={composeSources}
      appSlug={typeof story.frontmatter.vertical === 'string' ? story.frontmatter.vertical : null}
    />
  )
}
