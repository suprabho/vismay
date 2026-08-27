import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { signOutputUrl } from '@vismay/admin-core/signedUrl'
import { getStoryContent } from '@vismay/content-source/content'
import { loadStoryConfig, hasStoryConfig } from '@vismay/content-source/storyConfig'
import { resolveUnits } from '@vismay/content-source/resolveUnits'
import { renderSurfaceUrl } from '@/lib/publicSite'
import StageTimelineClient from '@/components/timeline/StageTimelineClient'
import {
  buildTimelineColumns,
  buildAuthoredKeyframeIndex,
  buildEntityLifetimes,
} from '@/components/timeline/timelineShape'

interface StageTimelinePageProps {
  slug: string
  /** Post-login `next` target — mirrors `CanvasPage`'s `canvasPath`. */
  timelinePath: string
}

const SIGN_TTL_SECONDS = 24 * 60 * 60

/**
 * Shared stage-timeline renderer (E1 — scrub & inspect, read-only), mounted
 * from both the vizmaya story tree (`app/vizmaya/[slug]/timeline`) and the
 * generic app tree (`app/[appSlug]/[slug]/timeline`) — the same split as
 * `CanvasPage`. Loads the story's resolved units + stage config server-side,
 * signs the full-story preview iframe URL against `StoryTimelineFrameSurface`,
 * and hands both to the client, which owns the playhead and the
 * `viz-story-seek` postMessage bridge.
 */
export default async function StageTimelinePage({ slug, timelinePath }: StageTimelinePageProps) {
  if (!(await isAuthed())) redirect(`/login?next=${encodeURIComponent(timelinePath)}`)
  if (!(await hasStoryConfig(slug))) notFound()

  const [story, config] = await Promise.all([getStoryContent(slug), loadStoryConfig(slug)])
  const { units } = resolveUnits(slug, story.sections, config)
  const columns = buildTimelineColumns(units)
  const authoredIndex = buildAuthoredKeyframeIndex(config.defaults.stage, units)
  const lifetimes = buildEntityLifetimes(config.defaults.stage, units)

  const vertical =
    typeof story.frontmatter.vertical === 'string' ? story.frontmatter.vertical : undefined

  const previewUrl = signOutputUrl({
    baseUrl: renderSurfaceUrl('timelineFrame', vertical),
    path: `/story/${encodeURIComponent(slug)}/timeline-frame`,
    ttlSeconds: SIGN_TTL_SECONDS,
    query: { editor: 1 },
  })

  return (
    <StageTimelineClient
      slug={slug}
      columns={columns}
      stage={config.defaults.stage ?? null}
      authoredIndex={authoredIndex}
      lifetimes={lifetimes}
      previewUrl={previewUrl}
    />
  )
}
