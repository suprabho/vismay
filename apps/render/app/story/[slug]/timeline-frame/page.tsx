export const dynamic = 'force-dynamic'

import { StoryTimelineFrameSurface } from '@vismay/render-surface/surfaces'
import { mapboxToken } from '@/lib/env'

interface RouteParams {
  params: Promise<{ slug: string }>
}

/**
 * Full-story render target for the admin stage-timeline editor (E1). Thin
 * mount: the route body lives in `@vismay/render-surface` so apps/render
 * serves the identical surface as vizmaya-fyi. This file owns only the route
 * segment config (`dynamic`) and the env injection.
 */
export default async function StoryTimelineFramePage({ params }: RouteParams) {
  const { slug } = await params
  return (
    <StoryTimelineFrameSurface
      slug={slug}
      mapboxToken={mapboxToken()}
    />
  )
}
